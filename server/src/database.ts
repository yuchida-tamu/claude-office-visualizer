import { Database } from 'bun:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Resolve the database file path from explicit argument, env var, or default.
 *
 * Priority: explicit path > CLAUDE_VISUALIZER_DB env var > 'visualizer.db' (CWD)
 */
export function resolveDatabasePath(explicitPath?: string): string {
  if (explicitPath) return explicitPath;
  if (process.env.CLAUDE_VISUALIZER_DB) return process.env.CLAUDE_VISUALIZER_DB;
  return 'visualizer.db';
}

export function initDatabase(path?: string): Database {
  const dbPath = resolveDatabasePath(path);

  // Ensure parent directory exists for non-memory, non-CWD paths
  const dir = dirname(dbPath);
  if (dir !== '.' && dbPath !== ':memory:') {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      payload TEXT NOT NULL
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)');

  return db;
}

export function insertEvent(
  db: Database,
  event: { id: string; type: string; session_id: string; timestamp: string; payload: string },
): void {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO events (id, type, session_id, timestamp, payload) VALUES (?, ?, ?, ?, ?)',
  );
  stmt.run(event.id, event.type, event.session_id, event.timestamp, event.payload);
}

export function getEventById(db: Database, id: string): unknown | null {
  const stmt = db.prepare('SELECT payload FROM events WHERE id = ?');
  const row = stmt.get(id) as { payload: string } | null;
  return row ? JSON.parse(row.payload) : null;
}

export interface EventQueryFilters {
  session_id?: string;
  type?: string;
  fromTimestamp?: string;
  limit?: number;
  offset?: number;
  latest?: boolean;
}

export function getEvents(db: Database, filters: EventQueryFilters = {}): unknown[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.session_id) {
    conditions.push('session_id = ?');
    params.push(filters.session_id);
  }
  if (filters.type) {
    conditions.push('type = ?');
    params.push(filters.type);
  }
  if (filters.fromTimestamp) {
    conditions.push('timestamp >= ?');
    params.push(filters.fromTimestamp);
  }

  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  if (filters.latest) {
    // Subquery: grab the newest N rows (DESC), then re-sort ASC for chronological replay
    let inner = 'SELECT payload, timestamp FROM events';
    if (conditions.length > 0) {
      inner += ' WHERE ' + conditions.join(' AND ');
    }
    inner += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const sql = `SELECT payload FROM (${inner}) sub ORDER BY sub.timestamp ASC`;
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload));
  }

  let sql = 'SELECT payload FROM events';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY timestamp ASC';
  sql += ` LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as { payload: string }[];
  return rows.map((r) => JSON.parse(r.payload));
}

export function getEventsBySession(db: Database, sessionId: string): unknown[] {
  return getEvents(db, { session_id: sessionId, limit: 1000 });
}

export function getEventsByType(db: Database, type: string): unknown[] {
  return getEvents(db, { type, limit: 1000 });
}

export interface SessionInfo {
  session_id: string;
  event_count: number;
  first_event: string;
  last_event: string;
}

export function getSessions(db: Database): SessionInfo[] {
  const stmt = db.prepare(`
    SELECT
      session_id,
      COUNT(*) as event_count,
      MIN(timestamp) as first_event,
      MAX(timestamp) as last_event
    FROM events
    GROUP BY session_id
    ORDER BY last_event DESC
  `);
  return stmt.all() as SessionInfo[];
}

export function getEventCount(db: Database): number {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM events');
  const row = stmt.get() as { count: number };
  return row.count;
}
