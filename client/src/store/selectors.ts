import type { VisualizerState } from './useVisualizerStore';
import type { AgentNode, TokenMetrics } from '@shared/agent';

/** All agents as an array (for rendering). */
export const selectAgents = (state: VisualizerState): AgentNode[] =>
  Array.from(state.agents.values());

/** Agent tree as an adjacency list: parentId → child IDs. */
export const selectAgentTree = (state: VisualizerState): Map<string | null, string[]> => {
  const tree = new Map<string | null, string[]>();
  for (const agent of state.agents.values()) {
    const siblings = tree.get(agent.parentId) ?? [];
    siblings.push(agent.id);
    tree.set(agent.parentId, siblings);
  }
  return tree;
};

/** Only active (non-completed) agents. */
export const selectActiveAgents = (state: VisualizerState): AgentNode[] =>
  Array.from(state.agents.values()).filter(
    (a) => a.status !== 'completed',
  );

/** Active tool call for a specific agent (curried selector). */
export const selectAgentToolCall = (agentId: string) => (state: VisualizerState) => {
  const agent = state.agents.get(agentId);
  return agent?.activeToolCall ?? null;
};

/** Messages currently in flight (for particle system). */
export const selectActiveMessages = (state: VisualizerState) =>
  state.activeMessages;

/** Focused agent (or null). */
export const selectFocusedAgent = (state: VisualizerState): AgentNode | null => {
  if (!state.focusedAgentId) return null;
  return state.agents.get(state.focusedAgentId) ?? null;
};

/** Connection status string. */
export const selectConnectionStatus = (state: VisualizerState) =>
  state.connectionStatus;

/** Aggregate stats for the HUD. */
export const selectStats = (state: VisualizerState) => ({
  totalEvents: state.totalEventsReceived,
  activeAgents: selectActiveAgents(state).length,
  activeToolCalls: state.activeToolCalls.size,
  messagesInFlight: state.activeMessages.length,
});

/** Get a single agent by ID (curried). */
export const selectAgentById = (agentId: string) => (state: VisualizerState) =>
  state.agents.get(agentId) ?? null;

/** Root agent node. */
export const selectRootAgent = (state: VisualizerState): AgentNode | null => {
  if (!state.rootAgentId) return null;
  return state.agents.get(state.rootAgentId) ?? null;
};

/** Whether heatmap is enabled. */
export const selectHeatmapEnabled = (state: VisualizerState): boolean =>
  state.heatmapEnabled;

/**
 * Heatmap intensity per agent (0..1), normalized relative to max across all agents.
 * Returns empty map when heatmap is disabled.
 * Uses token data (input + output) when available; falls back to activity score
 * (toolCallCount * 100 + toolCallDurationMs).
 */
export const selectHeatmapData = (state: VisualizerState): Map<string, number> => {
  if (!state.heatmapEnabled) return new Map();

  const scores = new Map<string, number>();
  let maxScore = 0;

  for (const [agentId, m] of state.tokenMetrics) {
    // Only include agents that currently exist in the scene
    if (!state.agents.has(agentId)) continue;

    const tokenTotal = m.inputTokens + m.outputTokens;
    const activityScore = m.toolCallCount * 100 + m.toolCallDurationMs;
    // Token data overrides activity score when present
    const score = tokenTotal > 0 ? tokenTotal : activityScore;
    scores.set(agentId, score);
    if (score > maxScore) maxScore = score;
  }

  // Normalize to 0..1
  const result = new Map<string, number>();
  if (maxScore === 0) return result;
  for (const [agentId, score] of scores) {
    result.set(agentId, score / maxScore);
  }
  return result;
};

/** Token metrics for a specific agent (curried selector). */
export const selectAgentTokenMetrics = (agentId: string) => (state: VisualizerState): TokenMetrics | null =>
  state.tokenMetrics.get(agentId) ?? null;
