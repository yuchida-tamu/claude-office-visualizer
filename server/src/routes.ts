import type { Database } from 'bun:sqlite';
import type { WebSocketHandler } from './websocket';
import { validateEvent } from './validation';
import { insertEvent, getEvents, getEventById, getSessions, getEventCount } from './database';
import type { ServerMessage } from '@shared/messages';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const startTime = Date.now();

export async function handleRequest(
  req: Request,
  db: Database,
  ws: WebSocketHandler,
): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // Health check
  if (req.method === 'GET' && path === '/api/health') {
    return json({
      status: 'ok',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      eventCount: getEventCount(db),
      clientCount: ws.clientCount(),
    });
  }

  // POST /api/events — ingest a hook event
  if (req.method === 'POST' && path === '/api/events') {
    return handlePostEvent(req, db, ws);
  }

  // GET /api/events/:id — single event by ID
  if (req.method === 'GET' && path.startsWith('/api/events/')) {
    const id = path.slice('/api/events/'.length);
    if (id) {
      return handleGetEventById(db, id);
    }
  }

  // GET /api/events — query events with filters
  if (req.method === 'GET' && path === '/api/events') {
    return handleGetEvents(url, db);
  }

  // GET /api/sessions — list distinct sessions
  if (req.method === 'GET' && path === '/api/sessions') {
    return json(getSessions(db));
  }

  return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
}

async function handlePostEvent(
  req: Request,
  db: Database,
  ws: WebSocketHandler,
): Promise<Response> {
  try {
    const body = await req.json();
    const { event, result } = validateEvent(body);

    if (!event) {
      return json({ error: result.error }, 400);
    }

    insertEvent(db, {
      id: event.id,
      type: event.type,
      session_id: event.session_id,
      timestamp: event.timestamp,
      payload: JSON.stringify(event),
    });

    const message: ServerMessage = { type: 'event', data: event };
    ws.broadcast(message);

    return json({ ok: true }, 201);
  } catch {
    return json({ error: 'Failed to process event' }, 500);
  }
}

function handleGetEventById(db: Database, id: string): Response {
  const event = getEventById(db, id);
  if (!event) {
    return json({ error: 'Event not found' }, 404);
  }
  return json(event);
}

function handleGetEvents(url: URL, db: Database): Response {
  const session_id = url.searchParams.get('session_id') || undefined;
  const type = url.searchParams.get('type') || undefined;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 1000);
  const offset = Number(url.searchParams.get('offset')) || 0;

  const events = getEvents(db, { session_id, type, limit, offset });
  return json(events);
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}
