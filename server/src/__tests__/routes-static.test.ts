import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import { initDatabase } from '../database';
import { handleRequest } from '../routes';
import type { WebSocketHandler } from '../websocket';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CLIENT_DIR = join(import.meta.dir, '__routes_static_test_fixtures__');

function createMockWsHandler() {
  return {
    handlers: {
      open() {},
      message() {},
      close() {},
    },
    broadcast() {},
    clientCount() {
      return 0;
    },
  } as WebSocketHandler;
}

function req(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

// ---------------------------------------------------------------------------
// Setup: create a temp directory with mock static files
// ---------------------------------------------------------------------------

beforeAll(() => {
  mkdirSync(join(TEST_CLIENT_DIR, 'assets'), { recursive: true });
  writeFileSync(
    join(TEST_CLIENT_DIR, 'index.html'),
    '<!DOCTYPE html><html><body>App</body></html>',
  );
  writeFileSync(join(TEST_CLIENT_DIR, 'assets', 'app.js'), 'console.log("app")');
});

afterAll(() => {
  rmSync(TEST_CLIENT_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes with static file serving', () => {
  let db: Database;
  let ws: WebSocketHandler;

  beforeEach(() => {
    db = initDatabase(':memory:');
    ws = createMockWsHandler();
  });

  // -------------------------------------------------------------------------
  // Dev mode: clientDir is null/undefined
  // -------------------------------------------------------------------------
  describe('dev mode (clientDir is null)', () => {
    test('GET / returns 404 when clientDir is not set', async () => {
      const res = await handleRequest(req('/'), db, ws);
      expect(res.status).toBe(404);
    });

    test('GET /some/path returns 404 when clientDir is not set', async () => {
      const res = await handleRequest(req('/some/path'), db, ws);
      expect(res.status).toBe(404);
    });

    test('GET / returns 404 when clientDir is explicitly null', async () => {
      const res = await handleRequest(req('/'), db, ws, null);
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Production mode: clientDir is set
  // -------------------------------------------------------------------------
  describe('production mode (clientDir is set)', () => {
    test('GET / returns index.html', async () => {
      const res = await handleRequest(req('/'), db, ws, TEST_CLIENT_DIR);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      const body = await res.text();
      expect(body).toContain('<!DOCTYPE html>');
    });

    test('GET /assets/app.js returns the JS file', async () => {
      const res = await handleRequest(req('/assets/app.js'), db, ws, TEST_CLIENT_DIR);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8');
    });

    test('GET /some/deep/path returns index.html (SPA fallback)', async () => {
      const res = await handleRequest(req('/some/deep/path'), db, ws, TEST_CLIENT_DIR);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      const body = await res.text();
      expect(body).toContain('App');
    });
  });

  // -------------------------------------------------------------------------
  // API routes still have priority over static serving
  // -------------------------------------------------------------------------
  describe('API routes have priority over static serving', () => {
    test('GET /api/health still works when clientDir is set', async () => {
      const res = await handleRequest(req('/api/health'), db, ws, TEST_CLIENT_DIR);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.status).toBe('ok');
    });

    test('POST /api/events still works when clientDir is set', async () => {
      const event = {
        id: crypto.randomUUID(),
        type: 'SessionStarted',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
        agent_type: 'main',
        model: 'claude-sonnet-4-20250514',
        source: 'cli',
      };
      const res = await handleRequest(
        req('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        }),
        db,
        ws,
        TEST_CLIENT_DIR,
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
    });

    test('GET /api/nonexistent returns 404 JSON, NOT index.html', async () => {
      const res = await handleRequest(req('/api/nonexistent'), db, ws, TEST_CLIENT_DIR);
      expect(res.status).toBe(404);
      // Should be text "Not Found", not HTML
      const body = await res.text();
      expect(body).toBe('Not Found');
      expect(body).not.toContain('<!DOCTYPE html>');
    });

    test('GET /api/sessions returns JSON when clientDir is set', async () => {
      const res = await handleRequest(req('/api/sessions'), db, ws, TEST_CLIENT_DIR);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test('OPTIONS request still returns 204 when clientDir is set', async () => {
      const res = await handleRequest(
        req('/api/events', { method: 'OPTIONS' }),
        db,
        ws,
        TEST_CLIENT_DIR,
      );
      expect(res.status).toBe(204);
    });
  });
});
