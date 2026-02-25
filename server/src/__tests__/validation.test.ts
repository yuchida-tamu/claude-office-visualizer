import { describe, test, expect } from 'bun:test';
import { validateEvent } from '../validation';

// ---------------------------------------------------------------------------
// Test event helpers
// ---------------------------------------------------------------------------

function baseFields(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-uuid-1234',
    timestamp: '2026-02-22T00:00:00.000Z',
    session_id: 'session-uuid-5678',
    ...overrides,
  };
}

function makeEvent(type: string, extra: Record<string, unknown> = {}) {
  return { ...baseFields(), type, ...extra };
}

/** Per-type factories with realistic extra fields matching shared/src/events.ts */
const eventFactories: Record<string, () => Record<string, unknown>> = {
  AgentSpawned: () =>
    makeEvent('AgentSpawned', {
      agent_id: 'a8efeee',
      parent_session_id: null,
      agent_type: 'general-purpose',
      model: 'claude-opus-4-6',
      task_description: 'Research codebase',
    }),
  AgentCompleted: () =>
    makeEvent('AgentCompleted', {
      agent_id: 'a8efeee',
      transcript_path: '/tmp/transcript.json',
      result: 'Done',
    }),
  ToolCallStarted: () =>
    makeEvent('ToolCallStarted', {
      tool_name: 'Read',
      tool_input: { file_path: '/src/index.ts' },
      tool_use_id: 'tool-123',
    }),
  ToolCallCompleted: () =>
    makeEvent('ToolCallCompleted', {
      tool_name: 'Read',
      tool_response: 'file contents',
      duration_ms: 42,
      tool_use_id: 'tool-123',
    }),
  ToolCallFailed: () =>
    makeEvent('ToolCallFailed', {
      tool_name: 'Read',
      error: 'File not found',
      tool_use_id: 'tool-123',
    }),
  MessageSent: () =>
    makeEvent('MessageSent', {
      from_agent: 'agent-1',
      to_agent: 'agent-2',
      content_preview: 'Hello',
    }),
  SessionStarted: () =>
    makeEvent('SessionStarted', {
      agent_type: 'general-purpose',
      model: 'claude-opus-4-6',
      source: 'cli',
    }),
  SessionEnded: () =>
    makeEvent('SessionEnded', {
      reason: 'normal',
      summary: null,
    }),
  UserPrompt: () =>
    makeEvent('UserPrompt', {
      prompt_text: 'Fix the bug',
    }),
  WaitingForUser: () =>
    makeEvent('WaitingForUser', {
      notification_type: 'permission_request',
      message: 'Allow file write?',
    }),
  ContextCompaction: () =>
    makeEvent('ContextCompaction', {
      context_pressure: 0.85,
    }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateEvent', () => {
  // ---- Valid events for all 11 types ----
  describe('valid events', () => {
    for (const [type, factory] of Object.entries(eventFactories)) {
      test(`accepts a valid ${type} event`, () => {
        const { event, result } = validateEvent(factory());
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(event).not.toBeNull();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(event!.type).toBe(type as any);
        expect(event!.id).toBe('test-uuid-1234');
        expect(event!.session_id).toBe('session-uuid-5678');
      });
    }

    test('covers all 11 event types', () => {
      expect(Object.keys(eventFactories)).toHaveLength(11);
    });

    test('returns the parsed event object on success', () => {
      const input = eventFactories.SessionStarted();
      input.id = 'custom-id-999';
      const { event } = validateEvent(input);
      expect(event).not.toBeNull();
      expect(event!.id).toBe('custom-id-999');
      expect(event!.session_id).toBe('session-uuid-5678');
    });

    test('accepts event with extra unknown fields (pass-through)', () => {
      const body = makeEvent('UserPrompt', {
        prompt_text: 'hello',
        some_extra_field: 'should be ignored by validation',
      });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(true);
      expect(event).not.toBeNull();
    });
  });

  // ---- Missing required fields ----
  describe('missing required fields', () => {
    test('rejects when id is missing', () => {
      const input = eventFactories.SessionStarted();
      delete input.id;
      const { event, result } = validateEvent(input);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "id" field');
      expect(event).toBeNull();
    });

    test('rejects when type is missing', () => {
      const input = baseFields();
      const { event, result } = validateEvent(input);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "type" field');
      expect(event).toBeNull();
    });

    test('rejects when timestamp is missing', () => {
      const input = eventFactories.AgentSpawned();
      delete input.timestamp;
      const { event, result } = validateEvent(input);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "timestamp" field');
      expect(event).toBeNull();
    });

    test('rejects when session_id is missing', () => {
      const input = eventFactories.ToolCallStarted();
      delete input.session_id;
      const { event, result } = validateEvent(input);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "session_id" field');
      expect(event).toBeNull();
    });
  });

  // ---- Invalid body types ----
  describe('invalid body types', () => {
    test('rejects null', () => {
      const { event, result } = validateEvent(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Request body must be a JSON object');
      expect(event).toBeNull();
    });

    test('rejects undefined', () => {
      const { event, result } = validateEvent(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Request body must be a JSON object');
      expect(event).toBeNull();
    });

    test('rejects a string', () => {
      const { event, result } = validateEvent('not an object');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Request body must be a JSON object');
      expect(event).toBeNull();
    });

    test('rejects a number', () => {
      const { event, result } = validateEvent(42);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Request body must be a JSON object');
      expect(event).toBeNull();
    });

    test('rejects a boolean', () => {
      const { event, result } = validateEvent(true);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Request body must be a JSON object');
      expect(event).toBeNull();
    });

    test('rejects an array', () => {
      // Arrays pass typeof === 'object' and are truthy, so they pass
      // the first guard but fail on field checks
      const { event, result } = validateEvent([1, 2, 3]);
      expect(result.valid).toBe(false);
      expect(event).toBeNull();
    });
  });

  // ---- Unknown event type ----
  describe('unknown event type', () => {
    test('rejects an unknown type string', () => {
      const body = makeEvent('UnknownEventType');
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unknown event type: "UnknownEventType"');
      expect(event).toBeNull();
    });

    test('rejects a similar but wrong-cased type', () => {
      const body = makeEvent('sessionStarted');
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unknown event type: "sessionStarted"');
      expect(event).toBeNull();
    });

    test('rejects an empty type string after other field checks pass', () => {
      const body = makeEvent('');
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unknown event type: ""');
      expect(event).toBeNull();
    });
  });

  // ---- Empty string id ----
  describe('empty string id', () => {
    test('rejects an empty id', () => {
      const body = makeEvent('SessionStarted', { id: '' });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "id" field');
      expect(event).toBeNull();
    });
  });

  // ---- Return value structure ----
  describe('return value structure', () => {
    test('valid event returns { event: <parsed>, result: { valid: true } }', () => {
      const input = eventFactories.SessionStarted();
      const output = validateEvent(input);

      expect(output).toHaveProperty('event');
      expect(output).toHaveProperty('result');
      expect(output.result).toEqual({ valid: true });
      expect(output.event).not.toBeNull();
      expect(output.event!.type).toBe('SessionStarted');
    });

    test('invalid event returns { event: null, result: { valid: false, error: "..." } }', () => {
      const output = validateEvent(null);

      expect(output).toHaveProperty('event');
      expect(output).toHaveProperty('result');
      expect(output.event).toBeNull();
      expect(output.result.valid).toBe(false);
      expect(typeof output.result.error).toBe('string');
      expect(output.result.error!.length).toBeGreaterThan(0);
    });
  });

  // ---- Edge cases: wrong types for required fields ----
  describe('edge cases', () => {
    test('rejects when id is a number instead of string', () => {
      const body = makeEvent('SessionStarted', { id: 123 });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "id" field');
      expect(event).toBeNull();
    });

    test('rejects when timestamp is a number instead of string', () => {
      const body = makeEvent('SessionStarted', { timestamp: Date.now() });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "timestamp" field');
      expect(event).toBeNull();
    });

    test('rejects when session_id is a number instead of string', () => {
      const body = makeEvent('SessionStarted', { session_id: 999 });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "session_id" field');
      expect(event).toBeNull();
    });

    test('rejects when session_id is null', () => {
      const body = makeEvent('SessionStarted', { session_id: null });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "session_id" field');
      expect(event).toBeNull();
    });

    test('rejects when id is a boolean', () => {
      const body = makeEvent('SessionStarted', { id: true });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "id" field');
      expect(event).toBeNull();
    });

    test('rejects when id is an object', () => {
      const body = makeEvent('SessionStarted', { id: { value: 'abc' } });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "id" field');
      expect(event).toBeNull();
    });

    test('rejects when id is null', () => {
      const body = makeEvent('SessionStarted', { id: null });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "id" field');
      expect(event).toBeNull();
    });

    test('rejects when type is a number', () => {
      const body = { ...baseFields(), type: 42 };
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "type" field');
      expect(event).toBeNull();
    });

    test('rejects when type is a boolean', () => {
      const body = { ...baseFields(), type: false };
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "type" field');
      expect(event).toBeNull();
    });

    test('rejects when type is null', () => {
      const body = { ...baseFields(), type: null };
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "type" field');
      expect(event).toBeNull();
    });

    test('rejects when type is an object', () => {
      const body = { ...baseFields(), type: { name: 'SessionStarted' } };
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "type" field');
      expect(event).toBeNull();
    });

    test('rejects when timestamp is a boolean', () => {
      const body = makeEvent('SessionStarted', { timestamp: true });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "timestamp" field');
      expect(event).toBeNull();
    });

    test('rejects when timestamp is null', () => {
      const body = makeEvent('SessionStarted', { timestamp: null });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "timestamp" field');
      expect(event).toBeNull();
    });

    test('rejects when timestamp is an object', () => {
      const body = makeEvent('SessionStarted', { timestamp: { iso: '2026-01-01' } });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "timestamp" field');
      expect(event).toBeNull();
    });

    test('rejects when session_id is a boolean', () => {
      const body = makeEvent('SessionStarted', { session_id: true });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "session_id" field');
      expect(event).toBeNull();
    });

    test('rejects when session_id is an object', () => {
      const body = makeEvent('SessionStarted', { session_id: { uuid: 'abc' } });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid "session_id" field');
      expect(event).toBeNull();
    });
  });

  // ---- String length limits ----
  describe('string length limits', () => {
    test('rejects when id exceeds 256 characters', () => {
      const body = makeEvent('SessionStarted', { id: 'x'.repeat(257) });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('"id" exceeds maximum length of 256 characters');
      expect(event).toBeNull();
    });

    test('accepts id at exactly 256 characters', () => {
      const body = makeEvent('SessionStarted', { id: 'x'.repeat(256) });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(true);
      expect(event).not.toBeNull();
    });

    test('rejects when timestamp exceeds 64 characters', () => {
      const body = makeEvent('SessionStarted', { timestamp: 'x'.repeat(65) });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('"timestamp" exceeds maximum length of 64 characters');
      expect(event).toBeNull();
    });

    test('accepts timestamp at exactly 64 characters', () => {
      const body = makeEvent('SessionStarted', { timestamp: 'x'.repeat(64) });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(true);
      expect(event).not.toBeNull();
    });

    test('rejects when session_id exceeds 256 characters', () => {
      const body = makeEvent('SessionStarted', { session_id: 'x'.repeat(257) });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('"session_id" exceeds maximum length of 256 characters');
      expect(event).toBeNull();
    });

    test('accepts session_id at exactly 256 characters', () => {
      const body = makeEvent('SessionStarted', { session_id: 'x'.repeat(256) });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(true);
      expect(event).not.toBeNull();
    });
  });

  // ---- Payload size limit ----
  describe('payload size limit', () => {
    test('rejects when overall payload exceeds 64KB', () => {
      // Create a payload with a very large extra field to push it over 64KB
      const body = makeEvent('SessionStarted', {
        big_field: 'x'.repeat(65_536),
      });
      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Event payload exceeds maximum size');
      expect(event).toBeNull();
    });

    test('accepts payload at exactly 64KB', () => {
      // Build a payload and pad it to exactly 64KB
      const base = makeEvent('SessionStarted');
      const baseSize = JSON.stringify(base).length;
      // We need total to be exactly 65536.
      // Adding a field: {"pad":"..."} adds ~9 chars of overhead for key+quotes+colon+comma
      const paddingOverhead = JSON.stringify({ ...base, pad: '' }).length - baseSize;
      const padLength = 65_536 - baseSize - paddingOverhead;
      const body = { ...base, pad: 'x'.repeat(padLength) };
      expect(JSON.stringify(body).length).toBe(65_536);

      const { event, result } = validateEvent(body);
      expect(result.valid).toBe(true);
      expect(event).not.toBeNull();
    });
  });

  // ---- Validation order ----
  describe('validation order', () => {
    test('checks id before type', () => {
      const { result } = validateEvent({ timestamp: 'x', session_id: 'x' });
      expect(result.error).toBe('Missing or invalid "id" field');
    });

    test('checks type before timestamp', () => {
      const { result } = validateEvent({ id: 'x', session_id: 'x' });
      expect(result.error).toBe('Missing or invalid "type" field');
    });

    test('checks timestamp before session_id', () => {
      const { result } = validateEvent({ id: 'x', type: 'SessionStarted' });
      expect(result.error).toBe('Missing or invalid "timestamp" field');
    });

    test('checks session_id before event type validity', () => {
      const { result } = validateEvent({ id: 'x', type: 'Bogus', timestamp: 'x' });
      expect(result.error).toBe('Missing or invalid "session_id" field');
    });
  });
});
