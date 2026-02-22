import type { VisualizerState } from './useVisualizerStore';
import type { AgentNode } from '@shared/agent';

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
