import { describe, test, expect, beforeEach } from 'bun:test';
import { useVisualizerStore } from '../store/useVisualizerStore';
import { selectHeatmapData, selectAgentTokenMetrics } from '../store/selectors';
import type {
  SessionStartedEvent,
  AgentSpawnedEvent,
  AgentCompletedEvent,
  ToolCallStartedEvent,
  ToolCallCompletedEvent,
  ToolCallFailedEvent,
  SessionEndedEvent,
  ContextCompactionEvent,
} from '@shared/events';
import type { TokenMetrics } from '@shared/agent';

// ---------------------------------------------------------------------------
// Test event factories
// ---------------------------------------------------------------------------

let eventCounter = 0;
function nextId(): string {
  return `evt-${++eventCounter}`;
}

function makeTimestamp(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const SESSION_ID_2 = '22222222-2222-2222-2222-222222222222';
const AGENT_ID = 'a1b2c3d';
const TOOL_USE_ID = 'tool-use-001';
const TOOL_USE_ID_2 = 'tool-use-002';
const TOOL_USE_ID_3 = 'tool-use-003';

function makeSessionStarted(overrides: Partial<SessionStartedEvent> = {}): SessionStartedEvent {
  return {
    id: nextId(),
    type: 'SessionStarted',
    timestamp: makeTimestamp(),
    session_id: SESSION_ID,
    agent_type: 'main',
    model: 'claude-sonnet-4-20250514',
    source: 'cli',
    ...overrides,
  };
}

function makeAgentSpawned(overrides: Partial<AgentSpawnedEvent> = {}): AgentSpawnedEvent {
  return {
    id: nextId(),
    type: 'AgentSpawned',
    timestamp: makeTimestamp(),
    session_id: SESSION_ID,
    agent_id: AGENT_ID,
    parent_session_id: SESSION_ID,
    agent_type: 'task',
    model: 'claude-sonnet-4-20250514',
    task_description: 'Run tests',
    ...overrides,
  };
}

function makeAgentCompleted(overrides: Partial<AgentCompletedEvent> = {}): AgentCompletedEvent {
  return {
    id: nextId(),
    type: 'AgentCompleted',
    timestamp: makeTimestamp(),
    session_id: SESSION_ID,
    agent_id: AGENT_ID,
    transcript_path: null,
    result: 'done',
    ...overrides,
  };
}

function makeToolCallStarted(overrides: Partial<ToolCallStartedEvent> = {}): ToolCallStartedEvent {
  return {
    id: nextId(),
    type: 'ToolCallStarted',
    timestamp: makeTimestamp(),
    session_id: SESSION_ID,
    tool_name: 'Read',
    tool_input: { file_path: '/foo.ts' },
    tool_use_id: TOOL_USE_ID,
    ...overrides,
  };
}

function makeToolCallCompleted(overrides: Partial<ToolCallCompletedEvent> = {}): ToolCallCompletedEvent {
  return {
    id: nextId(),
    type: 'ToolCallCompleted',
    timestamp: makeTimestamp(),
    session_id: SESSION_ID,
    tool_name: 'Read',
    tool_response: 'file contents',
    duration_ms: 42,
    tool_use_id: TOOL_USE_ID,
    ...overrides,
  };
}

function makeToolCallFailed(overrides: Partial<ToolCallFailedEvent> = {}): ToolCallFailedEvent {
  return {
    id: nextId(),
    type: 'ToolCallFailed',
    timestamp: makeTimestamp(),
    session_id: SESSION_ID,
    tool_name: 'Read',
    error: 'File not found',
    tool_use_id: TOOL_USE_ID,
    ...overrides,
  };
}

function makeSessionEnded(overrides: Partial<SessionEndedEvent> = {}): SessionEndedEvent {
  return {
    id: nextId(),
    type: 'SessionEnded',
    timestamp: makeTimestamp(),
    session_id: SESSION_ID,
    reason: 'normal',
    summary: null,
    ...overrides,
  };
}

function makeContextCompaction(overrides: Partial<ContextCompactionEvent> = {}): ContextCompactionEvent {
  return {
    id: nextId(),
    type: 'ContextCompaction',
    timestamp: makeTimestamp(),
    session_id: SESSION_ID,
    context_pressure: 0.75,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMetrics(agentId: string): TokenMetrics | undefined {
  return useVisualizerStore.getState().tokenMetrics.get(agentId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Token Metrics', () => {
  beforeEach(() => {
    eventCounter = 0;
    useVisualizerStore.getState().reset();
  });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  describe('initialization', () => {
    test('tokenMetrics map starts empty', () => {
      const state = useVisualizerStore.getState();
      expect(state.tokenMetrics).toBeInstanceOf(Map);
      expect(state.tokenMetrics.size).toBe(0);
    });

    test('heatmapEnabled starts as false', () => {
      const state = useVisualizerStore.getState();
      expect(state.heatmapEnabled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Tool call tracking
  // -------------------------------------------------------------------------

  describe('tool call tracking', () => {
    test('ToolCallStarted increments toolCallCount for the session agent', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeToolCallStarted());

      const metrics = getMetrics(SESSION_ID);
      expect(metrics).toBeDefined();
      expect(metrics!.toolCallCount).toBe(1);
    });

    test('ToolCallCompleted accumulates duration_ms', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallCompleted({ duration_ms: 150 }));

      const metrics = getMetrics(SESSION_ID);
      expect(metrics!.toolCallDurationMs).toBe(150);
    });

    test('multiple tool calls accumulate correctly', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());

      processEvent(makeToolCallStarted({ tool_use_id: TOOL_USE_ID }));
      processEvent(makeToolCallCompleted({ tool_use_id: TOOL_USE_ID, duration_ms: 100 }));

      processEvent(makeToolCallStarted({ tool_use_id: TOOL_USE_ID_2 }));
      processEvent(makeToolCallCompleted({ tool_use_id: TOOL_USE_ID_2, duration_ms: 200 }));

      processEvent(makeToolCallStarted({ tool_use_id: TOOL_USE_ID_3 }));
      processEvent(makeToolCallCompleted({ tool_use_id: TOOL_USE_ID_3, duration_ms: 50 }));

      const metrics = getMetrics(SESSION_ID);
      expect(metrics!.toolCallCount).toBe(3);
      expect(metrics!.toolCallDurationMs).toBe(350);
    });

    test('ToolCallFailed increments failedToolCalls', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallFailed());

      const metrics = getMetrics(SESSION_ID);
      expect(metrics!.failedToolCalls).toBe(1);
      // ToolCallStarted still counts toward toolCallCount
      expect(metrics!.toolCallCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Token data from hook events
  // -------------------------------------------------------------------------

  describe('token data forwarding', () => {
    test('SessionEnded with input_tokens/output_tokens updates metrics', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeSessionEnded({ input_tokens: 5000, output_tokens: 1500 }));

      const metrics = getMetrics(SESSION_ID);
      expect(metrics!.inputTokens).toBe(5000);
      expect(metrics!.outputTokens).toBe(1500);
    });

    test('AgentCompleted with token data updates sub-agent metrics', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeAgentSpawned());
      processEvent(makeAgentCompleted({ input_tokens: 2000, output_tokens: 800 }));

      const metrics = getMetrics(AGENT_ID);
      expect(metrics!.inputTokens).toBe(2000);
      expect(metrics!.outputTokens).toBe(800);
    });

    test('events without token fields leave inputTokens/outputTokens at 0', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeSessionEnded());

      const metrics = getMetrics(SESSION_ID);
      expect(metrics!.inputTokens).toBe(0);
      expect(metrics!.outputTokens).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Context pressure
  // -------------------------------------------------------------------------

  describe('context pressure', () => {
    test('ContextCompaction updates context_pressure on session agent', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeContextCompaction({ context_pressure: 0.85 }));

      const metrics = getMetrics(SESSION_ID);
      expect(metrics!.contextPressure).toBe(0.85);
    });

    test('subsequent ContextCompaction overwrites previous value', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeContextCompaction({ context_pressure: 0.5 }));
      processEvent(makeContextCompaction({ context_pressure: 0.9 }));

      const metrics = getMetrics(SESSION_ID);
      expect(metrics!.contextPressure).toBe(0.9);
    });
  });

  // -------------------------------------------------------------------------
  // Session restart cleanup
  // -------------------------------------------------------------------------

  describe('session restart cleanup', () => {
    test('new SessionStarted clears metrics for previous session agents', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallCompleted({ duration_ms: 100 }));

      // Start a new session — old metrics should be cleared
      processEvent(makeSessionStarted({ session_id: SESSION_ID_2 }));

      expect(getMetrics(SESSION_ID)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Heatmap toggle
  // -------------------------------------------------------------------------

  describe('heatmap toggle', () => {
    test('toggleHeatmap flips the heatmapEnabled state', () => {
      const store = useVisualizerStore.getState();
      expect(store.heatmapEnabled).toBe(false);
      store.toggleHeatmap();
      expect(useVisualizerStore.getState().heatmapEnabled).toBe(true);
      useVisualizerStore.getState().toggleHeatmap();
      expect(useVisualizerStore.getState().heatmapEnabled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  describe('reset', () => {
    test('reset() clears tokenMetrics and heatmapEnabled', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallCompleted({ duration_ms: 42 }));
      useVisualizerStore.getState().toggleHeatmap();

      useVisualizerStore.getState().reset();

      const state = useVisualizerStore.getState();
      expect(state.tokenMetrics.size).toBe(0);
      expect(state.heatmapEnabled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Selectors
  // -------------------------------------------------------------------------

  describe('selectHeatmapData', () => {
    test('returns empty map when heatmap is disabled', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallCompleted({ duration_ms: 100 }));

      const state = useVisualizerStore.getState();
      const data = selectHeatmapData(state);
      expect(data.size).toBe(0);
    });

    test('returns normalized intensities when heatmap is enabled', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeAgentSpawned());

      // Root agent: 2 tool calls, 300ms total
      processEvent(makeToolCallStarted({ tool_use_id: TOOL_USE_ID }));
      processEvent(makeToolCallCompleted({ tool_use_id: TOOL_USE_ID, duration_ms: 200 }));
      processEvent(makeToolCallStarted({ tool_use_id: TOOL_USE_ID_2 }));
      processEvent(makeToolCallCompleted({ tool_use_id: TOOL_USE_ID_2, duration_ms: 100 }));

      // Sub-agent: 1 tool call, 50ms
      processEvent(makeToolCallStarted({ session_id: AGENT_ID, tool_use_id: TOOL_USE_ID_3 }));
      processEvent(makeToolCallCompleted({ session_id: AGENT_ID, tool_use_id: TOOL_USE_ID_3, duration_ms: 50 }));

      useVisualizerStore.getState().toggleHeatmap();

      const state = useVisualizerStore.getState();
      const data = selectHeatmapData(state);
      expect(data.size).toBe(2);

      // Root has higher score → intensity 1.0
      const rootIntensity = data.get(SESSION_ID);
      expect(rootIntensity).toBe(1);

      // Sub-agent has lower score → intensity < 1
      const subIntensity = data.get(AGENT_ID);
      expect(subIntensity).toBeDefined();
      expect(subIntensity!).toBeGreaterThan(0);
      expect(subIntensity!).toBeLessThan(1);
    });

    test('token data overrides activity score when present', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeAgentSpawned());

      // Root: few tool calls but high token usage
      processEvent(makeToolCallStarted({ tool_use_id: TOOL_USE_ID }));
      processEvent(makeToolCallCompleted({ tool_use_id: TOOL_USE_ID, duration_ms: 10 }));
      processEvent(makeSessionEnded({ reason: 'stop', input_tokens: 10000, output_tokens: 5000 }));

      // Sub-agent: many tool calls but lower token usage
      processEvent(makeToolCallStarted({ session_id: AGENT_ID, tool_use_id: TOOL_USE_ID_2 }));
      processEvent(makeToolCallCompleted({ session_id: AGENT_ID, tool_use_id: TOOL_USE_ID_2, duration_ms: 500 }));
      processEvent(makeAgentCompleted({ input_tokens: 1000, output_tokens: 500 }));

      useVisualizerStore.getState().toggleHeatmap();

      const state = useVisualizerStore.getState();
      const data = selectHeatmapData(state);

      // Root has 15000 total tokens vs sub-agent's 1500 → root should be 1.0
      expect(data.get(SESSION_ID)).toBe(1);
      expect(data.get(AGENT_ID)!).toBeLessThan(1);
    });
  });

  describe('selectAgentTokenMetrics', () => {
    test('returns metrics for a specific agent', () => {
      const { processEvent } = useVisualizerStore.getState();
      processEvent(makeSessionStarted());
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallCompleted({ duration_ms: 42 }));

      const state = useVisualizerStore.getState();
      const metrics = selectAgentTokenMetrics(SESSION_ID)(state);
      expect(metrics).toBeDefined();
      expect(metrics!.toolCallCount).toBe(1);
      expect(metrics!.toolCallDurationMs).toBe(42);
    });

    test('returns null for unknown agent', () => {
      const state = useVisualizerStore.getState();
      const metrics = selectAgentTokenMetrics('nonexistent')(state);
      expect(metrics).toBeNull();
    });
  });
});
