import { describe, test, expect, beforeEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import type { ServerWebSocket } from 'bun';
import { initDatabase, insertEvent } from '../database';
import { createWebSocketHandler, type WebSocketHandler } from '../websocket';
import type { ServerMessage } from '@shared/messages';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockWebSocket {
  sentMessages: string[];
  closed: boolean;
  sendText(msg: string): void;
  close(): void;
}

function createMockWs(): MockWebSocket {
  return {
    sentMessages: [],
    closed: false,
    sendText(msg: string) {
      this.sentMessages.push(msg);
    },
    close() {
      this.closed = true;
    },
  };
}

function parseSent(mock: MockWebSocket): ServerMessage[] {
  return mock.sentMessages.map((m) => JSON.parse(m));
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  const base = {
    id: crypto.randomUUID(),
    type: 'SessionStarted',
    timestamp: new Date().toISOString(),
    session_id: 'session-1',
    agent_type: 'main',
    model: 'claude-sonnet-4-20250514',
    source: 'cli',
  };
  return { ...base, ...overrides };
}

function seedEvent(db: Database, overrides: Record<string, unknown> = {}) {
  const event = makeEvent(overrides);
  insertEvent(db, {
    id: event.id as string,
    type: event.type as string,
    session_id: event.session_id as string,
    timestamp: event.timestamp as string,
    payload: JSON.stringify(event),
  });
  return event;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocket handler', () => {
  let db: Database;
  let wsHandler: WebSocketHandler;

  beforeEach(() => {
    db = initDatabase(':memory:');
    wsHandler = createWebSocketHandler(db);
  });

  // -----------------------------------------------------------------------
  // open handler
  // -----------------------------------------------------------------------
  describe('open', () => {
    test('sends connected message on open', () => {
      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      const messages = parseSent(mock);
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('connected');
      expect((messages[0] as { type: 'connected'; sessionId: string }).sessionId).toBe('server');
    });

    test('adds client to the set (clientCount increases)', () => {
      expect(wsHandler.clientCount()).toBe(0);

      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      expect(wsHandler.clientCount()).toBe(1);
    });

    test('multiple clients can connect', () => {
      const mock1 = createMockWs();
      const mock2 = createMockWs();
      wsHandler.handlers.open(mock1 as unknown as ServerWebSocket<unknown>);
      wsHandler.handlers.open(mock2 as unknown as ServerWebSocket<unknown>);

      expect(wsHandler.clientCount()).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // close handler
  // -----------------------------------------------------------------------
  describe('close', () => {
    test('removes client from the set', () => {
      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);
      expect(wsHandler.clientCount()).toBe(1);

      wsHandler.handlers.close(mock as unknown as ServerWebSocket<unknown>);
      expect(wsHandler.clientCount()).toBe(0);
    });

    test('closing an unknown client does not throw', () => {
      const mock = createMockWs();
      // Should not throw even if the client was never opened
      expect(() => {
        wsHandler.handlers.close(mock as unknown as ServerWebSocket<unknown>);
      }).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // message handler — subscribe
  // -----------------------------------------------------------------------
  describe('subscribe message', () => {
    test('sends history with empty data when no events exist', () => {
      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      const subscribeMsg = JSON.stringify({ type: 'subscribe' });
      wsHandler.handlers.message(mock as unknown as ServerWebSocket<unknown>, subscribeMsg);

      const messages = parseSent(mock);
      // First message is 'connected', second is 'history'
      expect(messages.length).toBe(2);
      expect(messages[1].type).toBe('history');
      expect((messages[1] as { type: 'history'; data: unknown[] }).data).toEqual([]);
    });

    test('sends history with stored events', () => {
      seedEvent(db, { id: 'e1', timestamp: '2025-01-01T00:00:01Z' });
      seedEvent(db, { id: 'e2', timestamp: '2025-01-01T00:00:02Z' });

      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      const subscribeMsg = JSON.stringify({ type: 'subscribe' });
      wsHandler.handlers.message(mock as unknown as ServerWebSocket<unknown>, subscribeMsg);

      const messages = parseSent(mock);
      const history = messages[1] as { type: 'history'; data: Array<{ id: string }> };
      expect(history.type).toBe('history');
      expect(history.data.length).toBe(2);
      // Should be in chronological order
      expect(history.data[0].id).toBe('e1');
      expect(history.data[1].id).toBe('e2');
    });

    test('subscribe with sessionId filters events', () => {
      seedEvent(db, { id: 'e1', session_id: 'session-A', timestamp: '2025-01-01T00:00:01Z' });
      seedEvent(db, { id: 'e2', session_id: 'session-B', timestamp: '2025-01-01T00:00:02Z' });
      seedEvent(db, { id: 'e3', session_id: 'session-A', timestamp: '2025-01-01T00:00:03Z' });

      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      const subscribeMsg = JSON.stringify({ type: 'subscribe', sessionId: 'session-A' });
      wsHandler.handlers.message(mock as unknown as ServerWebSocket<unknown>, subscribeMsg);

      const messages = parseSent(mock);
      const history = messages[1] as { type: 'history'; data: Array<{ id: string; session_id: string }> };
      expect(history.data.length).toBe(2);
      expect(history.data.every((e) => e.session_id === 'session-A')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // message handler — replay
  // -----------------------------------------------------------------------
  describe('replay message', () => {
    test('sends history with events from the given timestamp', () => {
      seedEvent(db, { id: 'e1', timestamp: '2025-01-01T00:00:01Z' });
      seedEvent(db, { id: 'e2', timestamp: '2025-01-01T00:00:02Z' });
      seedEvent(db, { id: 'e3', timestamp: '2025-01-01T00:00:03Z' });

      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      const replayMsg = JSON.stringify({ type: 'replay', fromTimestamp: '2025-01-01T00:00:02Z' });
      wsHandler.handlers.message(mock as unknown as ServerWebSocket<unknown>, replayMsg);

      const messages = parseSent(mock);
      const history = messages[1] as { type: 'history'; data: Array<{ id: string }> };
      expect(history.type).toBe('history');
      expect(history.data.length).toBe(2);
      expect(history.data[0].id).toBe('e2');
      expect(history.data[1].id).toBe('e3');
    });

    test('replay returns events in chronological order', () => {
      seedEvent(db, { id: 'e1', timestamp: '2025-01-01T00:00:01Z' });
      seedEvent(db, { id: 'e2', timestamp: '2025-01-01T00:00:02Z' });
      seedEvent(db, { id: 'e3', timestamp: '2025-01-01T00:00:03Z' });

      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      const replayMsg = JSON.stringify({ type: 'replay', fromTimestamp: '2025-01-01T00:00:01Z' });
      wsHandler.handlers.message(mock as unknown as ServerWebSocket<unknown>, replayMsg);

      const messages = parseSent(mock);
      const history = messages[1] as { type: 'history'; data: Array<{ timestamp: string }> };
      for (let i = 1; i < history.data.length; i++) {
        expect(history.data[i].timestamp >= history.data[i - 1].timestamp).toBe(true);
      }
    });

    test('replay with future timestamp returns empty', () => {
      seedEvent(db, { id: 'e1', timestamp: '2025-01-01T00:00:01Z' });

      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      const replayMsg = JSON.stringify({ type: 'replay', fromTimestamp: '2099-12-31T23:59:59Z' });
      wsHandler.handlers.message(mock as unknown as ServerWebSocket<unknown>, replayMsg);

      const messages = parseSent(mock);
      const history = messages[1] as { type: 'history'; data: unknown[] };
      expect(history.data.length).toBe(0);
    });

    test('replay delegates to getEvents with fromTimestamp filter', () => {
      // Seed events at specific timestamps
      seedEvent(db, { id: 'e1', timestamp: '2025-01-01T00:00:01Z' });
      seedEvent(db, { id: 'e2', timestamp: '2025-06-01T00:00:01Z' });
      seedEvent(db, { id: 'e3', timestamp: '2025-12-01T00:00:01Z' });

      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      // Request replay from mid-year — should get e2 and e3 only
      const replayMsg = JSON.stringify({ type: 'replay', fromTimestamp: '2025-06-01T00:00:00Z' });
      wsHandler.handlers.message(mock as unknown as ServerWebSocket<unknown>, replayMsg);

      const messages = parseSent(mock);
      const history = messages[1] as { type: 'history'; data: Array<{ id: string }> };
      expect(history.data.length).toBe(2);
      expect(history.data[0].id).toBe('e2');
      expect(history.data[1].id).toBe('e3');
    });
  });

  // -----------------------------------------------------------------------
  // message handler — malformed messages
  // -----------------------------------------------------------------------
  describe('malformed messages', () => {
    test('non-JSON message does not throw', () => {
      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      expect(() => {
        wsHandler.handlers.message(mock as unknown as ServerWebSocket<unknown>, 'not json');
      }).not.toThrow();
    });

    test('non-JSON message does not send anything (beyond connected)', () => {
      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      wsHandler.handlers.message(mock as unknown as ServerWebSocket<unknown>, 'not json');

      const messages = parseSent(mock);
      // Only the initial connected message
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('connected');
    });

    test('unknown message type is silently ignored', () => {
      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      const unknownMsg = JSON.stringify({ type: 'unknown_type' });
      wsHandler.handlers.message(mock as unknown as ServerWebSocket<unknown>, unknownMsg);

      const messages = parseSent(mock);
      // Only the initial connected message
      expect(messages.length).toBe(1);
    });

    test('Buffer messages are handled', () => {
      const mock = createMockWs();
      wsHandler.handlers.open(mock as unknown as ServerWebSocket<unknown>);

      const subscribeMsg = Buffer.from(JSON.stringify({ type: 'subscribe' }));
      wsHandler.handlers.message(mock as unknown as ServerWebSocket<unknown>, subscribeMsg);

      const messages = parseSent(mock);
      expect(messages.length).toBe(2);
      expect(messages[1].type).toBe('history');
    });
  });

  // -----------------------------------------------------------------------
  // broadcast
  // -----------------------------------------------------------------------
  describe('broadcast', () => {
    test('sends message to all connected clients', () => {
      const mock1 = createMockWs();
      const mock2 = createMockWs();
      wsHandler.handlers.open(mock1 as unknown as ServerWebSocket<unknown>);
      wsHandler.handlers.open(mock2 as unknown as ServerWebSocket<unknown>);

      const event = makeEvent();
      wsHandler.broadcast({ type: 'event', data: event as never });

      // Each client gets connected + broadcast
      const messages1 = parseSent(mock1);
      const messages2 = parseSent(mock2);

      expect(messages1.length).toBe(2); // connected + event
      expect(messages1[1].type).toBe('event');

      expect(messages2.length).toBe(2); // connected + event
      expect(messages2[1].type).toBe('event');
    });

    test('broadcast does not send to disconnected clients', () => {
      const mock1 = createMockWs();
      const mock2 = createMockWs();
      wsHandler.handlers.open(mock1 as unknown as ServerWebSocket<unknown>);
      wsHandler.handlers.open(mock2 as unknown as ServerWebSocket<unknown>);

      // Disconnect mock2
      wsHandler.handlers.close(mock2 as unknown as ServerWebSocket<unknown>);

      wsHandler.broadcast({ type: 'event', data: makeEvent() as never });

      // mock1 gets connected + event, mock2 only gets connected (from open)
      expect(parseSent(mock1).length).toBe(2);
      expect(parseSent(mock2).length).toBe(1); // only connected
    });

    test('broadcast with no clients does not throw', () => {
      expect(() => {
        wsHandler.broadcast({ type: 'event', data: makeEvent() as never });
      }).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // clientCount
  // -----------------------------------------------------------------------
  describe('clientCount', () => {
    test('returns 0 initially', () => {
      expect(wsHandler.clientCount()).toBe(0);
    });

    test('tracks connects and disconnects', () => {
      const mock1 = createMockWs();
      const mock2 = createMockWs();

      wsHandler.handlers.open(mock1 as unknown as ServerWebSocket<unknown>);
      expect(wsHandler.clientCount()).toBe(1);

      wsHandler.handlers.open(mock2 as unknown as ServerWebSocket<unknown>);
      expect(wsHandler.clientCount()).toBe(2);

      wsHandler.handlers.close(mock1 as unknown as ServerWebSocket<unknown>);
      expect(wsHandler.clientCount()).toBe(1);

      wsHandler.handlers.close(mock2 as unknown as ServerWebSocket<unknown>);
      expect(wsHandler.clientCount()).toBe(0);
    });
  });
});
