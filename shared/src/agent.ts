/**
 * Agent state types for Claude Code Visualizer.
 */

/** The lifecycle status of an agent in the visualization. */
export type AgentStatus =
  | 'spawning'
  | 'active'
  | 'thinking'
  | 'tool_executing'
  | 'waiting'
  | 'completed'
  | 'error';

/** 3D position in the office scene. */
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

/** Information about an in-progress tool call. */
export interface ActiveToolCall {
  tool_use_id: string;
  tool_name: string;
  started_at: string;
}

/** A single agent node in the orchestration tree. */
export interface AgentNode {
  id: string;
  parentId: string | null;
  children: string[];
  status: AgentStatus;
  agentType: string;
  model: string;
  taskDescription: string | null;
  position: Position3D;
  activeToolCall: ActiveToolCall | null;
  notificationMessage: string | null;
  notificationType: 'notification' | 'permission_request' | null;
}

/**
 * The full agent tree, keyed by agent ID.
 * Use a plain Record for serialisability across WebSocket boundaries.
 */
export type AgentTree = Record<string, AgentNode>;

/** Per-agent resource consumption metrics for heatmap visualization. */
export interface TokenMetrics {
  /** Total tool calls initiated by this agent. */
  toolCallCount: number;
  /** Sum of ToolCallCompleted.duration_ms for this agent. */
  toolCallDurationMs: number;
  /** Number of failed tool calls. */
  failedToolCalls: number;
  /** Cumulative input tokens (from SessionEnded/AgentCompleted; 0 if unavailable). */
  inputTokens: number;
  /** Cumulative output tokens (from SessionEnded/AgentCompleted; 0 if unavailable). */
  outputTokens: number;
  /** Latest context pressure ratio from ContextCompaction (0..1). */
  contextPressure: number;
}
