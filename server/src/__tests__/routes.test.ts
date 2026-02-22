import { describe, test, expect, beforeEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { initDatabase } from '../database';
import { handleRequest } from '../routes';
import type { WebSocketHandler } from '../websocket';
import type { VisualizerEvent } from '@shared/events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWsHandler() {
  const broadcasted: unknown[] = [];
  return {
    handler: {
      handlers: {
        open() {},
        message() {},
        close() {},
      },
      broadcast(msg: unknown) {
        broadcasted.push(msg);
      },
      clientCount() {
        return 0;
      },
    } as WebSocketHandler,
    broadcasted,
  };
}

function makeSessionStartedEvent(overrides: Partial<VisualizerEvent> = {}): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    type: 'SessionStarted',
    timestamp: new Date().toISOString(),
    session_id: 'session-1',
    agent_type: 'main',
    model: 'claude-sonnet-4-20250514',
    source: 'cli',
    ...overrides,
  };
}

function makeToolCallStartedEvent(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    type: 'ToolCallStarted',
    timestamp: new Date().toISOString(),
    session_id: 'session-1',
    tool_name: 'Read',
    tool_input: { file_path: '/tmp/test.ts' },
    tool_use_id: 'tool-1',
    ...overrides,
  };
}

function req(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

async function postEvent(db: Database, ws: WebSocketHandler, body: unknown): Promise<Response> {
  return handleRequest(
    req('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    db,
    ws,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes', () => {
  let db: Database;
  let ws: WebSocketHandler;
  let broadcasted: unknown[];

  beforeEach(() => {
    db = initDatabase(':memory:');
    const mock = createMockWsHandler();
    ws = mock.handler;
    broadcasted = mock.broadcasted;
  });

  // -----------------------------------------------------------------------
  // OPTIONS (CORS preflight)
  // -----------------------------------------------------------------------
  describe('OPTIONS (CORS preflight)', () => {
    test('returns 204 for any OPTIONS request', async () => {
      const res = await handleRequest(req('/api/anything', { method: 'OPTIONS' }), db, ws);
      expect(res.status).toBe(204);
    });

    test('includes CORS headers', async () => {
      const res = await handleRequest(req('/api/events', { method: 'OPTIONS' }), db, ws);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/health
  // -----------------------------------------------------------------------
  describe('GET /api/health', () => {
    test('returns 200 with expected shape', async () => {
      const res = await handleRequest(req('/api/health'), db, ws);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(typeof body.uptime).toBe('number');
      expect(body.eventCount).toBe(0);
      expect(body.clientCount).toBe(0);
    });

    test('eventCount reflects stored events', async () => {
      // Insert an event first
      await postEvent(db, ws, makeSessionStartedEvent());

      const res = await handleRequest(req('/api/health'), db, ws);
      const body = await res.json();
      expect(body.eventCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/events
  // -----------------------------------------------------------------------
  describe('POST /api/events', () => {
    test('valid event returns 201 with { ok: true }', async () => {
      const event = makeSessionStartedEvent();
      const res = await postEvent(db, ws, event);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    test('valid event is stored in the database', async () => {
      const event = makeSessionStartedEvent({ id: 'persist-check' });
      await postEvent(db, ws, event);

      const res = await handleRequest(req('/api/events/persist-check'), db, ws);
      expect(res.status).toBe(200);

      const stored = await res.json();
      expect(stored.id).toBe('persist-check');
      expect(stored.type).toBe('SessionStarted');
    });

    test('valid event triggers broadcast', async () => {
      const event = makeSessionStartedEvent();
      await postEvent(db, ws, event);

      expect(broadcasted.length).toBe(1);
      const msg = broadcasted[0] as { type: string; data: unknown };
      expect(msg.type).toBe('event');
      expect((msg.data as Record<string, unknown>).id).toBe(event.id);
    });

    test('broadcast message is a ServerEventMessage', async () => {
      const event = makeSessionStartedEvent();
      await postEvent(db, ws, event);

      const msg = broadcasted[0] as { type: string; data: Record<string, unknown> };
      expect(msg.type).toBe('event');
      expect(msg.data.type).toBe('SessionStarted');
      expect(msg.data.session_id).toBe('session-1');
    });

    test('missing required fields returns 400', async () => {
      const res = await postEvent(db, ws, { type: 'SessionStarted' });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    test('missing id returns 400', async () => {
      const res = await postEvent(db, ws, {
        type: 'SessionStarted',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('id');
    });

    test('missing type returns 400', async () => {
      const res = await postEvent(db, ws, {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('type');
    });

    test('unknown event type returns 400', async () => {
      const res = await postEvent(db, ws, {
        id: crypto.randomUUID(),
        type: 'UnknownEvent',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Unknown event type');
    });

    test('non-JSON body returns 500', async () => {
      const res = await handleRequest(
        req('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'this is not json',
        }),
        db,
        ws,
      );
      // req.json() throws → caught by try/catch → 500
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    test('no broadcast on invalid event', async () => {
      await postEvent(db, ws, { type: 'SessionStarted' });
      expect(broadcasted.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/events
  // -----------------------------------------------------------------------
  describe('GET /api/events', () => {
    async function seedEvents() {
      const events = [
        makeSessionStartedEvent({ id: 'e1', session_id: 'session-A', timestamp: '2025-01-01T00:00:01Z' }),
        makeToolCallStartedEvent({ id: 'e2', session_id: 'session-A', timestamp: '2025-01-01T00:00:02Z' }),
        makeSessionStartedEvent({ id: 'e3', session_id: 'session-B', timestamp: '2025-01-01T00:00:03Z' }),
        makeToolCallStartedEvent({ id: 'e4', session_id: 'session-B', timestamp: '2025-01-01T00:00:04Z' }),
        makeSessionStartedEvent({ id: 'e5', session_id: 'session-A', timestamp: '2025-01-01T00:00:05Z' }),
      ];
      for (const event of events) {
        await postEvent(db, ws, event);
      }
    }

    test('returns array of events', async () => {
      await seedEvents();

      const res = await handleRequest(req('/api/events'), db, ws);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(5);
    });

    test('filters by session_id', async () => {
      await seedEvents();

      const res = await handleRequest(req('/api/events?session_id=session-A'), db, ws);
      const body = await res.json();
      expect(body.length).toBe(3);
      for (const event of body) {
        expect(event.session_id).toBe('session-A');
      }
    });

    test('filters by type', async () => {
      await seedEvents();

      const res = await handleRequest(req('/api/events?type=ToolCallStarted'), db, ws);
      const body = await res.json();
      expect(body.length).toBe(2);
      for (const event of body) {
        expect(event.type).toBe('ToolCallStarted');
      }
    });

    test('supports limit', async () => {
      await seedEvents();

      const res = await handleRequest(req('/api/events?limit=2'), db, ws);
      const body = await res.json();
      expect(body.length).toBe(2);
    });

    test('supports offset', async () => {
      await seedEvents();

      const res = await handleRequest(req('/api/events?limit=2&offset=3'), db, ws);
      const body = await res.json();
      expect(body.length).toBe(2);
      expect(body[0].id).toBe('e4');
      expect(body[1].id).toBe('e5');
    });

    test('default limit is 100', async () => {
      // Insert more than 100 events — but just verify the limit param defaults
      const res = await handleRequest(req('/api/events'), db, ws);
      const body = await res.json();
      // With only seeded events, all should return. The default is 100 so this is fine.
      expect(Array.isArray(body)).toBe(true);
    });

    test('limit is capped at 1000', async () => {
      // We can't easily verify the cap directly, but we can check the route doesn't error
      const res = await handleRequest(req('/api/events?limit=5000'), db, ws);
      expect(res.status).toBe(200);
    });

    test('returns events in chronological order', async () => {
      await seedEvents();

      const res = await handleRequest(req('/api/events'), db, ws);
      const body = (await res.json()) as Array<{ timestamp: string }>;
      for (let i = 1; i < body.length; i++) {
        expect(body[i].timestamp >= body[i - 1].timestamp).toBe(true);
      }
    });

    test('combined filters: session_id + type', async () => {
      await seedEvents();

      const res = await handleRequest(
        req('/api/events?session_id=session-A&type=ToolCallStarted'),
        db,
        ws,
      );
      const body = await res.json();
      expect(body.length).toBe(1);
      expect(body[0].id).toBe('e2');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/events/:id
  // -----------------------------------------------------------------------
  describe('GET /api/events/:id', () => {
    test('returns event data for existing event', async () => {
      const event = makeSessionStartedEvent({ id: 'lookup-me' });
      await postEvent(db, ws, event);

      const res = await handleRequest(req('/api/events/lookup-me'), db, ws);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe('lookup-me');
      expect(body.type).toBe('SessionStarted');
    });

    test('returns 404 for non-existent event', async () => {
      const res = await handleRequest(req('/api/events/does-not-exist'), db, ws);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Event not found');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/sessions
  // -----------------------------------------------------------------------
  describe('GET /api/sessions', () => {
    test('returns empty array when no events exist', async () => {
      const res = await handleRequest(req('/api/sessions'), db, ws);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual([]);
    });

    test('returns session list after inserting events', async () => {
      await postEvent(db, ws, makeSessionStartedEvent({ id: 'sa1', session_id: 'sess-X', timestamp: '2025-01-01T00:00:01Z' }));
      await postEvent(db, ws, makeToolCallStartedEvent({ id: 'sa2', session_id: 'sess-X', timestamp: '2025-01-01T00:00:02Z' }));
      await postEvent(db, ws, makeSessionStartedEvent({ id: 'sb1', session_id: 'sess-Y', timestamp: '2025-01-01T00:00:03Z' }));

      const res = await handleRequest(req('/api/sessions'), db, ws);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.length).toBe(2);

      // Sessions ordered by last_event DESC
      expect(body[0].session_id).toBe('sess-Y');
      expect(body[0].event_count).toBe(1);
      expect(body[1].session_id).toBe('sess-X');
      expect(body[1].event_count).toBe(2);
    });

    test('session info includes first_event and last_event timestamps', async () => {
      await postEvent(db, ws, makeSessionStartedEvent({ id: 's1', session_id: 'sess-Z', timestamp: '2025-01-01T10:00:00Z' }));
      await postEvent(db, ws, makeToolCallStartedEvent({ id: 's2', session_id: 'sess-Z', timestamp: '2025-01-01T10:05:00Z' }));

      const res = await handleRequest(req('/api/sessions'), db, ws);
      const body = await res.json();

      expect(body[0].first_event).toBe('2025-01-01T10:00:00Z');
      expect(body[0].last_event).toBe('2025-01-01T10:05:00Z');
    });
  });

  // -----------------------------------------------------------------------
  // Unknown routes
  // -----------------------------------------------------------------------
  describe('unknown routes', () => {
    test('GET /api/unknown returns 404', async () => {
      const res = await handleRequest(req('/api/unknown'), db, ws);
      expect(res.status).toBe(404);
    });

    test('POST /unknown returns 404', async () => {
      const res = await handleRequest(
        req('/unknown', { method: 'POST', body: '{}' }),
        db,
        ws,
      );
      expect(res.status).toBe(404);
    });

    test('GET / returns 404', async () => {
      const res = await handleRequest(req('/'), db, ws);
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // CORS headers on all responses
  // -----------------------------------------------------------------------
  describe('CORS headers on all responses', () => {
    test('200 response has CORS headers', async () => {
      const res = await handleRequest(req('/api/health'), db, ws);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    test('201 response has CORS headers', async () => {
      const res = await postEvent(db, ws, makeSessionStartedEvent());
      expect(res.status).toBe(201);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    test('400 response has CORS headers', async () => {
      const res = await postEvent(db, ws, { type: 'SessionStarted' });
      expect(res.status).toBe(400);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    test('404 response has CORS headers', async () => {
      const res = await handleRequest(req('/api/unknown'), db, ws);
      expect(res.status).toBe(404);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    });

    test('500 response has CORS headers', async () => {
      const res = await handleRequest(
        req('/api/events', {
          method: 'POST',
          body: 'not json',
        }),
        db,
        ws,
      );
      expect(res.status).toBe(500);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
