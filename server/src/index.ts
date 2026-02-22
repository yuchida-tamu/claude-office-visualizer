/**
 * Event server entry point — Bun HTTP + WebSocket server.
 */
import { handleRequest } from './routes';
import { initDatabase } from './database';
import { createWebSocketHandler } from './websocket';

const PORT = Number(process.env.VISUALIZER_PORT) || 3333;

const db = initDatabase();
const wsHandler = createWebSocketHandler(db);

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    // Upgrade WebSocket requests
    if (new URL(req.url).pathname === '/ws') {
      const upgraded = server.upgrade(req, { data: {} });
      if (upgraded) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    return handleRequest(req, db, wsHandler);
  },
  websocket: wsHandler.handlers,
});

console.log(`Visualizer event server listening on http://localhost:${server.port}`);
