import type { VisualizerEvent } from '@shared/events';

const VALID_EVENT_TYPES = new Set([
  'AgentSpawned',
  'AgentCompleted',
  'ToolCallStarted',
  'ToolCallCompleted',
  'ToolCallFailed',
  'MessageSent',
  'SessionStarted',
  'SessionEnded',
  'UserPrompt',
  'WaitingForUser',
  'ContextCompaction',
]);

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateEvent(body: unknown): { event: VisualizerEvent | null; result: ValidationResult } {
  if (!body || typeof body !== 'object') {
    return { event: null, result: { valid: false, error: 'Request body must be a JSON object' } };
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    return { event: null, result: { valid: false, error: 'Missing or invalid "id" field' } };
  }
  if (typeof obj.type !== 'string') {
    return { event: null, result: { valid: false, error: 'Missing or invalid "type" field' } };
  }
  if (typeof obj.timestamp !== 'string') {
    return { event: null, result: { valid: false, error: 'Missing or invalid "timestamp" field' } };
  }
  if (typeof obj.session_id !== 'string') {
    return { event: null, result: { valid: false, error: 'Missing or invalid "session_id" field' } };
  }

  // String length limits
  if ((obj.id as string).length > 256) {
    return { event: null, result: { valid: false, error: '"id" exceeds maximum length of 256 characters' } };
  }
  if ((obj.timestamp as string).length > 64) {
    return { event: null, result: { valid: false, error: '"timestamp" exceeds maximum length of 64 characters' } };
  }
  if ((obj.session_id as string).length > 256) {
    return { event: null, result: { valid: false, error: '"session_id" exceeds maximum length of 256 characters' } };
  }

  if (!VALID_EVENT_TYPES.has(obj.type)) {
    return { event: null, result: { valid: false, error: `Unknown event type: "${obj.type}"` } };
  }

  // Overall payload size check (64KB max)
  if (JSON.stringify(body).length > 65_536) {
    return { event: null, result: { valid: false, error: 'Event payload exceeds maximum size' } };
  }

  return { event: obj as unknown as VisualizerEvent, result: { valid: true } };
}
