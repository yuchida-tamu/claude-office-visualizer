/**
 * Event type definitions for Claude Code Visualizer.
 *
 * All events use a discriminated union on the `type` field.
 * Each event extends a common base shape with id, type, timestamp, and session_id.
 */

/** Base fields present on every visualizer event. */
export interface EventBase {
  /** Unique event identifier (UUID v4). */
  id: string;
  /** ISO-8601 timestamp of when the event was generated. */
  timestamp: string;
  /** The Claude Code session that produced this event. */
  session_id: string;
}

// ---------------------------------------------------------------------------
// Individual event interfaces
// ---------------------------------------------------------------------------

export interface AgentSpawnedEvent extends EventBase {
  type: 'AgentSpawned';
  agent_id: string;
  parent_session_id: string | null;
  agent_type: string;
  model: string;
  task_description: string | null;
}

export interface AgentCompletedEvent extends EventBase {
  type: 'AgentCompleted';
  agent_id: string;
  transcript_path: string | null;
  result: string | null;
}

export interface ToolCallStartedEvent extends EventBase {
  type: 'ToolCallStarted';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

export interface ToolCallCompletedEvent extends EventBase {
  type: 'ToolCallCompleted';
  tool_name: string;
  tool_response: string | null;
  duration_ms: number;
  tool_use_id: string;
}

export interface ToolCallFailedEvent extends EventBase {
  type: 'ToolCallFailed';
  tool_name: string;
  error: string;
  tool_use_id: string;
}

export interface MessageSentEvent extends EventBase {
  type: 'MessageSent';
  from_agent: string;
  to_agent: string;
  content_preview: string;
}

export interface SessionStartedEvent extends EventBase {
  type: 'SessionStarted';
  agent_type: string;
  model: string;
  source: string;
}

export interface SessionEndedEvent extends EventBase {
  type: 'SessionEnded';
  reason: string;
  summary: string | null;
}

export interface UserPromptEvent extends EventBase {
  type: 'UserPrompt';
  prompt_text: string;
}

export interface WaitingForUserEvent extends EventBase {
  type: 'WaitingForUser';
  notification_type: 'notification' | 'permission_request';
  message: string;
}

export interface ContextCompactionEvent extends EventBase {
  type: 'ContextCompaction';
  context_pressure: number;
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type VisualizerEvent =
  | AgentSpawnedEvent
  | AgentCompletedEvent
  | ToolCallStartedEvent
  | ToolCallCompletedEvent
  | ToolCallFailedEvent
  | MessageSentEvent
  | SessionStartedEvent
  | SessionEndedEvent
  | UserPromptEvent
  | WaitingForUserEvent
  | ContextCompactionEvent;

/** All possible event type discriminator values. */
export type VisualizerEventType = VisualizerEvent['type'];

/** Helper: extract a specific event by its type discriminator. */
export type EventOfType<T extends VisualizerEventType> = Extract<VisualizerEvent, { type: T }>;
