/**
 * Event server entry point — Bun HTTP + WebSocket server.
 */
import { existsSync } from 'node:fs';
import { handleRequest } from './routes';
import { initDatabase } from './database';
import { createWebSocketHandler } from './websocket';

const PORT = Number(process.env.VISUALIZER_PORT) || 3333;

// Static client directory — set by CLI in production, null in development
const CLIENT_DIR = process.env.VISUALIZER_CLIENT_DIR || null;
const validClientDir = CLIENT_DIR && existsSync(CLIENT_DIR) ? CLIENT_DIR : null;

const db = initDatabase();
const wsHandler = createWebSocketHandler(db);

const server = Bun.serve({
  port: PORT,
  maxRequestBodySize: 1_048_576, // 1MB — prevents memory exhaustion from oversized POST bodies
  fetch(req, server) {
    // Upgrade WebSocket requests
    if (new URL(req.url).pathname === '/ws') {
      const upgraded = server.upgrade(req, { data: {} });
      if (upgraded) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    return handleRequest(req, db, wsHandler, validClientDir);
  },
  websocket: wsHandler.handlers,
});

console.log(`Visualizer event server listening on http://localhost:${server.port}`);
