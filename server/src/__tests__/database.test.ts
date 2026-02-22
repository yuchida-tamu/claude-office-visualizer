import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  initDatabase,
  insertEvent,
  getEventById,
  getEvents,
  getEventsBySession,
  getEventsByType,
  getSessions,
  getEventCount,
} from '../database';

let counter = 0;

function makeEvent(overrides: Partial<{
  id: string;
  type: string;
  session_id: string;
  timestamp: string;
}> = {}) {
  counter++;
  const event = {
    id: overrides.id ?? `evt-${counter}`,
    type: overrides.type ?? 'SessionStarted',
    session_id: overrides.session_id ?? 'session-1',
    timestamp: overrides.timestamp ?? `2025-01-01T00:00:${String(counter).padStart(2, '0')}.000Z`,
    agent_type: 'main',
    model: 'claude-sonnet-4-20250514',
    source: 'cli',
  };
  return {
    id: event.id,
    type: event.type,
    session_id: event.session_id,
    timestamp: event.timestamp,
    payload: JSON.stringify(event),
  };
}

describe('initDatabase', () => {
  test('returns a database object', () => {
    const db = initDatabase(':memory:');
    expect(db).toBeInstanceOf(Database);
    db.close();
  });

  test('creates the events table', () => {
    const db = initDatabase(':memory:');
    // Verify by inserting a row — would throw if the table doesn't exist
    const stmt = db.prepare(
      'INSERT INTO events (id, type, session_id, timestamp, payload) VALUES (?, ?, ?, ?, ?)',
    );
    stmt.run('test-id', 'SessionStarted', 'sess', '2025-01-01T00:00:00Z', '{}');
    const row = db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number };
    expect(row.c).toBe(1);
    db.close();
  });

  test('creates indices without error', () => {
    const db = initDatabase(':memory:');
    // Query sqlite_master for expected indices
    const indices = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_events_%'")
      .all() as { name: string }[];
    const names = indices.map((i) => i.name).sort();
    expect(names).toContain('idx_events_session');
    expect(names).toContain('idx_events_type');
    expect(names).toContain('idx_events_timestamp');
    db.close();
  });
});

describe('insertEvent', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  test('inserts an event into the database', () => {
    const evt = makeEvent({ id: 'ins-1' });
    insertEvent(db, evt);

    const row = db.prepare('SELECT * FROM events WHERE id = ?').get('ins-1') as Record<string, unknown> | null;
    expect(row).not.toBeNull();
    expect(row!.id).toBe('ins-1');
    expect(row!.type).toBe('SessionStarted');
    expect(row!.payload).toBe(evt.payload);
  });

  test('INSERT OR IGNORE: duplicate id does not throw', () => {
    const evt1 = makeEvent({ id: 'dup-1', type: 'SessionStarted' });
    const evt2 = makeEvent({ id: 'dup-1', type: 'SessionEnded' });

    insertEvent(db, evt1);
    // Should not throw
    insertEvent(db, evt2);

    // Original event is preserved
    const row = db.prepare('SELECT type FROM events WHERE id = ?').get('dup-1') as { type: string };
    expect(row.type).toBe('SessionStarted');
  });

  test('INSERT OR IGNORE: count stays at 1 for duplicates', () => {
    const evt = makeEvent({ id: 'dup-count' });
    insertEvent(db, evt);
    insertEvent(db, evt);
    insertEvent(db, evt);

    const row = db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number };
    expect(row.c).toBe(1);
  });
});

describe('getEventById', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  test('returns the parsed event payload', () => {
    const evt = makeEvent({ id: 'get-1', session_id: 'sess-x' });
    insertEvent(db, evt);

    const result = getEventById(db, 'get-1') as Record<string, unknown>;
    expect(result).not.toBeNull();
    expect(result.id).toBe('get-1');
    expect(result.session_id).toBe('sess-x');
    expect(result.type).toBe('SessionStarted');
  });

  test('returns null for non-existent id', () => {
    const result = getEventById(db, 'does-not-exist');
    expect(result).toBeNull();
  });
});

describe('getEvents', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
    // Insert 5 events across 2 sessions and 2 types
    insertEvent(db, makeEvent({ id: 'e1', session_id: 'sess-A', type: 'SessionStarted', timestamp: '2025-01-01T00:00:01.000Z' }));
    insertEvent(db, makeEvent({ id: 'e2', session_id: 'sess-A', type: 'ToolCallStarted', timestamp: '2025-01-01T00:00:02.000Z' }));
    insertEvent(db, makeEvent({ id: 'e3', session_id: 'sess-B', type: 'SessionStarted', timestamp: '2025-01-01T00:00:03.000Z' }));
    insertEvent(db, makeEvent({ id: 'e4', session_id: 'sess-A', type: 'SessionEnded', timestamp: '2025-01-01T00:00:04.000Z' }));
    insertEvent(db, makeEvent({ id: 'e5', session_id: 'sess-B', type: 'SessionEnded', timestamp: '2025-01-01T00:00:05.000Z' }));
  });

  test('returns all events with no filters', () => {
    const events = getEvents(db);
    expect(events).toHaveLength(5);
  });

  test('returns events in chronological ASC order', () => {
    const events = getEvents(db) as Array<{ id: string }>;
    expect(events[0].id).toBe('e1');
    expect(events[4].id).toBe('e5');
  });

  test('filters by session_id', () => {
    const events = getEvents(db, { session_id: 'sess-A' }) as Array<{ session_id: string }>;
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.session_id).toBe('sess-A');
    }
  });

  test('filters by type', () => {
    const events = getEvents(db, { type: 'SessionStarted' }) as Array<{ type: string }>;
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.type).toBe('SessionStarted');
    }
  });

  test('filters by both session_id and type', () => {
    const events = getEvents(db, { session_id: 'sess-A', type: 'SessionStarted' });
    expect(events).toHaveLength(1);
  });

  test('applies limit', () => {
    const events = getEvents(db, { limit: 2 });
    expect(events).toHaveLength(2);
  });

  test('applies offset', () => {
    const events = getEvents(db, { limit: 2, offset: 3 }) as Array<{ id: string }>;
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('e4');
    expect(events[1].id).toBe('e5');
  });

  test('defaults limit to 100', () => {
    // With only 5 events, all should be returned
    const events = getEvents(db);
    expect(events).toHaveLength(5);
  });

  test('latest: true returns newest N in chronological order', () => {
    const events = getEvents(db, { limit: 3, latest: true }) as Array<{ id: string }>;
    expect(events).toHaveLength(3);
    // The 3 newest are e3, e4, e5 — returned in ASC order
    expect(events[0].id).toBe('e3');
    expect(events[1].id).toBe('e4');
    expect(events[2].id).toBe('e5');
  });

  test('latest: true with session filter', () => {
    const events = getEvents(db, { session_id: 'sess-A', limit: 2, latest: true }) as Array<{ id: string }>;
    expect(events).toHaveLength(2);
    // Newest 2 from sess-A are e2, e4 in ASC order
    expect(events[0].id).toBe('e2');
    expect(events[1].id).toBe('e4');
  });

  test('returns empty array when no events match', () => {
    const events = getEvents(db, { session_id: 'nonexistent' });
    expect(events).toHaveLength(0);
  });
});

describe('getEventsBySession', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
    insertEvent(db, makeEvent({ id: 's1', session_id: 'sess-X', timestamp: '2025-01-01T00:00:01.000Z' }));
    insertEvent(db, makeEvent({ id: 's2', session_id: 'sess-Y', timestamp: '2025-01-01T00:00:02.000Z' }));
    insertEvent(db, makeEvent({ id: 's3', session_id: 'sess-X', timestamp: '2025-01-01T00:00:03.000Z' }));
  });

  test('returns events for the given session', () => {
    const events = getEventsBySession(db, 'sess-X') as Array<{ session_id: string }>;
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.session_id).toBe('sess-X');
    }
  });

  test('returns empty array for unknown session', () => {
    const events = getEventsBySession(db, 'unknown');
    expect(events).toHaveLength(0);
  });
});

describe('getEventsByType', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
    insertEvent(db, makeEvent({ id: 't1', type: 'SessionStarted', timestamp: '2025-01-01T00:00:01.000Z' }));
    insertEvent(db, makeEvent({ id: 't2', type: 'ToolCallStarted', timestamp: '2025-01-01T00:00:02.000Z' }));
    insertEvent(db, makeEvent({ id: 't3', type: 'SessionStarted', timestamp: '2025-01-01T00:00:03.000Z' }));
  });

  test('returns events of the given type', () => {
    const events = getEventsByType(db, 'SessionStarted') as Array<{ type: string }>;
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.type).toBe('SessionStarted');
    }
  });

  test('returns empty array for unknown type', () => {
    const events = getEventsByType(db, 'NeverHappened');
    expect(events).toHaveLength(0);
  });
});

describe('getSessions', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  test('returns empty array when no events exist', () => {
    const sessions = getSessions(db);
    expect(sessions).toHaveLength(0);
  });

  test('returns distinct sessions with stats', () => {
    insertEvent(db, makeEvent({ id: 'ss1', session_id: 'sess-1', timestamp: '2025-01-01T00:00:01.000Z' }));
    insertEvent(db, makeEvent({ id: 'ss2', session_id: 'sess-1', timestamp: '2025-01-01T00:00:05.000Z' }));
    insertEvent(db, makeEvent({ id: 'ss3', session_id: 'sess-2', timestamp: '2025-01-01T00:00:03.000Z' }));

    const sessions = getSessions(db);
    expect(sessions).toHaveLength(2);

    // Ordered by last_event DESC, so sess-1 (last at :05) comes first
    expect(sessions[0].session_id).toBe('sess-1');
    expect(sessions[0].event_count).toBe(2);
    expect(sessions[0].first_event).toBe('2025-01-01T00:00:01.000Z');
    expect(sessions[0].last_event).toBe('2025-01-01T00:00:05.000Z');

    expect(sessions[1].session_id).toBe('sess-2');
    expect(sessions[1].event_count).toBe(1);
  });
});

describe('getEventCount', () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  test('returns 0 for empty database', () => {
    expect(getEventCount(db)).toBe(0);
  });

  test('returns correct count after inserts', () => {
    insertEvent(db, makeEvent({ id: 'c1', timestamp: '2025-01-01T00:00:01.000Z' }));
    insertEvent(db, makeEvent({ id: 'c2', timestamp: '2025-01-01T00:00:02.000Z' }));
    insertEvent(db, makeEvent({ id: 'c3', timestamp: '2025-01-01T00:00:03.000Z' }));
    expect(getEventCount(db)).toBe(3);
  });

  test('does not count duplicates', () => {
    const evt = makeEvent({ id: 'dup-c' });
    insertEvent(db, evt);
    insertEvent(db, evt);
    expect(getEventCount(db)).toBe(1);
  });
});
