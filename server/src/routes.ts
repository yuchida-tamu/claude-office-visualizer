import type { Database } from 'bun:sqlite';
import type { WebSocketHandler } from './websocket';
import { validateEvent } from './validation';
import { insertEvent, getEvents, getEventById, getSessions, getEventCount } from './database';
import { serveStatic } from './static';
import type { ServerMessage } from '@shared/messages';

/** Loopback origin patterns: localhost, 127.0.0.1, [::1] with any port or no port. */
const LOOPBACK_ORIGIN_RE = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

/**
 * Returns the validated origin for CORS, or '*' when no Origin header is present
 * (non-browser clients like curl / hook scripts), or empty string for disallowed origins.
 */
function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get('Origin');
  if (origin === null) {
    // No Origin header — non-browser request (hooks, curl, server-to-server). Allow.
    return '*';
  }
  if (LOOPBACK_ORIGIN_RE.test(origin)) {
    return origin;
  }
  // Foreign browser origin — deny by omitting ACAO header.
  return '';
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = getAllowedOrigin(req);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

const startTime = Date.now();

export async function handleRequest(
  req: Request,
  db: Database,
  ws: WebSocketHandler,
  clientDir?: string | null,
): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // Health check
  if (req.method === 'GET' && path === '/api/health') {
    return json(req, {
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
      return handleGetEventById(req, db, id);
    }
  }

  // GET /api/events — query events with filters
  if (req.method === 'GET' && path === '/api/events') {
    return handleGetEvents(req, url, db);
  }

  // GET /api/sessions — list distinct sessions
  if (req.method === 'GET' && path === '/api/sessions') {
    return json(req, getSessions(db));
  }

  // Static file serving (production mode) — only for non-API routes
  if (clientDir && !path.startsWith('/api/')) {
    const staticResponse = await serveStatic(path, clientDir);
    if (staticResponse) return staticResponse;
  }

  return new Response('Not Found', { status: 404, headers: corsHeaders(req) });
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
      return json(req, { error: result.error }, 400);
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

    return json(req, { ok: true }, 201);
  } catch {
    return json(req, { error: 'Failed to process event' }, 500);
  }
}

function handleGetEventById(req: Request, db: Database, id: string): Response {
  const event = getEventById(db, id);
  if (!event) {
    return json(req, { error: 'Event not found' }, 404);
  }
  return json(req, event);
}

function handleGetEvents(req: Request, url: URL, db: Database): Response {
  const session_id = url.searchParams.get('session_id') || undefined;
  const type = url.searchParams.get('type') || undefined;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 1000);
  const offset = Number(url.searchParams.get('offset')) || 0;

  const events = getEvents(db, { session_id, type, limit, offset });
  return json(req, events);
}

function json(req: Request, data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders(req) });
}
