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

  if (!VALID_EVENT_TYPES.has(obj.type)) {
    return { event: null, result: { valid: false, error: `Unknown event type: "${obj.type}"` } };
  }

  return { event: obj as unknown as VisualizerEvent, result: { valid: true } };
}
