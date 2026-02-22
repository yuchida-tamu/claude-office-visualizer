import type { ServerWebSocket } from 'bun';
import type { Database } from 'bun:sqlite';
import type { ServerMessage, ClientMessage } from '@shared/messages';
import { getEvents } from './database';

export interface WebSocketHandler {
  handlers: {
    open(ws: ServerWebSocket<unknown>): void;
    message(ws: ServerWebSocket<unknown>, message: string | Buffer): void;
    close(ws: ServerWebSocket<unknown>): void;
  };
  broadcast(message: ServerMessage): void;
  clientCount(): number;
}

export function createWebSocketHandler(db: Database): WebSocketHandler {
  const clients = new Set<ServerWebSocket<unknown>>();

  return {
    handlers: {
      open(ws) {
        clients.add(ws);
        const connected: ServerMessage = { type: 'connected', sessionId: 'server' };
        ws.sendText(JSON.stringify(connected));
      },

      message(ws, message) {
        try {
          const raw = typeof message === 'string' ? message : message.toString();
          const msg = JSON.parse(raw) as ClientMessage;

          if (msg.type === 'subscribe') {
            // Send the most recent events, in chronological order
            const events = msg.sessionId
              ? getEvents(db, { session_id: msg.sessionId, limit: 500, latest: true })
              : getEvents(db, { limit: 500, latest: true });
            const history: ServerMessage = { type: 'history', data: events as never[] };
            ws.sendText(JSON.stringify(history));
          } else if (msg.type === 'replay') {
            // Replay events from a given timestamp
            const conditions: string[] = [];
            const params: (string | number)[] = [];
            conditions.push('timestamp >= ?');
            params.push(msg.fromTimestamp);

            let sql = 'SELECT payload FROM events WHERE ' + conditions.join(' AND ');
            sql += ' ORDER BY timestamp ASC LIMIT 1000';

            const stmt = db.prepare(sql);
            const rows = stmt.all(...params) as { payload: string }[];
            const events = rows.map((r) => JSON.parse(r.payload));
            const history: ServerMessage = { type: 'history', data: events };
            ws.sendText(JSON.stringify(history));
          }
        } catch {
          // Ignore malformed messages
        }
      },

      close(ws) {
        clients.delete(ws);
      },
    },

    broadcast(message: ServerMessage) {
      const data = JSON.stringify(message);
      for (const client of clients) {
        client.sendText(data);
      }
    },

    clientCount() {
      return clients.size;
    },
  };
}
