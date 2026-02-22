import { describe, test, expect, beforeEach } from 'bun:test';
import { useVisualizerStore } from '../store/useVisualizerStore';
import type { VisualizerEvent } from '@shared/events';
import type {
  SessionStartedEvent,
  AgentSpawnedEvent,
  AgentCompletedEvent,
  ToolCallStartedEvent,
  ToolCallCompletedEvent,
  ToolCallFailedEvent,
  MessageSentEvent,
  UserPromptEvent,
  WaitingForUserEvent,
  SessionEndedEvent,
  ContextCompactionEvent,
} from '@shared/events';

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
const AGENT_ID_2 = 'e4f5g6h';
const TOOL_USE_ID = 'tool-use-001';
const TOOL_USE_ID_2 = 'tool-use-002';

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
    tool_name: 'Write',
    error: 'Permission denied',
    tool_use_id: TOOL_USE_ID,
    ...overrides,
  };
}

function makeMessageSent(overrides: Partial<MessageSentEvent> = {}): MessageSentEvent {
  return {
    id: nextId(),
    type: 'MessageSent',
    timestamp: makeTimestamp(),
    session_id: SESSION_ID,
    from_agent: AGENT_ID,
    to_agent: SESSION_ID,
    content_preview: 'Task completed successfully',
    ...overrides,
  };
}

function makeUserPrompt(overrides: Partial<UserPromptEvent> = {}): UserPromptEvent {
  return {
    id: nextId(),
    type: 'UserPrompt',
    timestamp: makeTimestamp(),
    session_id: SESSION_ID,
    prompt_text: 'Please fix the bug',
    ...overrides,
  };
}

function makeWaitingForUser(overrides: Partial<WaitingForUserEvent> = {}): WaitingForUserEvent {
  return {
    id: nextId(),
    type: 'WaitingForUser',
    timestamp: makeTimestamp(),
    session_id: SESSION_ID,
    notification_type: 'notification',
    message: 'Waiting for input',
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
    context_pressure: 0.85,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState() {
  return useVisualizerStore.getState();
}

function processEvent(event: VisualizerEvent, eventTime?: number) {
  getState().processEvent(event, eventTime);
}

/**
 * Sets up a root session and returns the session_id used.
 */
function setupRootSession(sessionId = SESSION_ID): string {
  processEvent(makeSessionStarted({ session_id: sessionId }));
  return sessionId;
}

/**
 * Sets up a root session with a spawned sub-agent and returns both IDs.
 */
function setupWithSubAgent(
  sessionId = SESSION_ID,
  agentId = AGENT_ID,
): { sessionId: string; agentId: string } {
  setupRootSession(sessionId);
  processEvent(
    makeAgentSpawned({
      session_id: sessionId,
      agent_id: agentId,
      parent_session_id: sessionId,
    }),
  );
  return { sessionId, agentId };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useVisualizerStore', () => {
  beforeEach(() => {
    eventCounter = 0;
    getState().reset();
  });

  // =========================================================================
  // Initial state
  // =========================================================================

  describe('initial state', () => {
    test('has correct default values', () => {
      const s = getState();
      expect(s.connectionStatus).toBe('disconnected');
      expect(s.websocket).toBeNull();
      expect(s.agents.size).toBe(0);
      expect(s.rootAgentId).toBeNull();
      expect(s.activeToolCalls.size).toBe(0);
      expect(s.activeMessages).toEqual([]);
      expect(s.eventBuffer).toEqual([]);
      expect(s.bufferDelay).toBe(100);
      expect(s.currentSessionId).toBeNull();
      expect(s.totalEventsReceived).toBe(0);
      expect(s.focusedAgentId).toBeNull();
      expect(s.lastEventTimeByAgent.size).toBe(0);
    });
  });

  // =========================================================================
  // reset()
  // =========================================================================

  describe('reset()', () => {
    test('restores state to initial values after modifications', () => {
      setupRootSession();
      expect(getState().agents.size).toBe(1);

      getState().reset();

      const s = getState();
      expect(s.agents.size).toBe(0);
      expect(s.rootAgentId).toBeNull();
      expect(s.totalEventsReceived).toBe(0);
      expect(s.activeToolCalls.size).toBe(0);
      expect(s.activeMessages).toEqual([]);
      expect(s.lastEventTimeByAgent.size).toBe(0);
    });
  });

  // =========================================================================
  // processEvent: SessionStarted
  // =========================================================================

  describe('processEvent: SessionStarted', () => {
    test('creates a root agent node with correct fields', () => {
      processEvent(makeSessionStarted());

      const s = getState();
      expect(s.agents.size).toBe(1);
      expect(s.rootAgentId).toBe(SESSION_ID);
      expect(s.currentSessionId).toBe(SESSION_ID);

      const agent = s.agents.get(SESSION_ID)!;
      expect(agent.id).toBe(SESSION_ID);
      expect(agent.parentId).toBeNull();
      expect(agent.children).toEqual([]);
      expect(agent.status).toBe('active');
      expect(agent.agentType).toBe('main');
      expect(agent.model).toBe('claude-sonnet-4-20250514');
      expect(agent.taskDescription).toBeNull();
      expect(agent.activeToolCall).toBeNull();
    });

    test('always updates rootAgentId to latest session', () => {
      processEvent(makeSessionStarted({ session_id: SESSION_ID }));
      expect(getState().rootAgentId).toBe(SESSION_ID);

      processEvent(makeSessionStarted({ session_id: SESSION_ID_2 }));
      expect(getState().rootAgentId).toBe(SESSION_ID_2);
    });

    test('increments totalEventsReceived', () => {
      processEvent(makeSessionStarted());
      expect(getState().totalEventsReceived).toBe(1);
    });

    test('tracks event time for the agent', () => {
      processEvent(makeSessionStarted());
      expect(getState().lastEventTimeByAgent.has(SESSION_ID)).toBe(true);
    });
  });

  // =========================================================================
  // processEvent: AgentSpawned
  // =========================================================================

  describe('processEvent: AgentSpawned', () => {
    test('creates a sub-agent with spawning status (history replay transitions immediately)', () => {
      setupRootSession();
      // Use history replay (eventTime provided) — transitions to active immediately
      processEvent(
        makeAgentSpawned({ agent_id: AGENT_ID }),
        Date.now(),
      );

      const agent = getState().agents.get(AGENT_ID)!;
      // History replay transitions spawning → active immediately
      expect(agent.status).toBe('active');
      expect(agent.agentType).toBe('task');
      expect(agent.taskDescription).toBe('Run tests');
    });

    test('links child to parent correctly', () => {
      setupRootSession();
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), Date.now());

      const parent = getState().agents.get(SESSION_ID)!;
      expect(parent.children).toContain(AGENT_ID);

      const child = getState().agents.get(AGENT_ID)!;
      expect(child.parentId).toBe(SESSION_ID);
    });

    test('falls back to session_id as parent when parent_session_id is null', () => {
      setupRootSession();
      processEvent(
        makeAgentSpawned({
          agent_id: AGENT_ID,
          parent_session_id: null,
          session_id: SESSION_ID,
        }),
        Date.now(),
      );

      const child = getState().agents.get(AGENT_ID)!;
      expect(child.parentId).toBe(SESSION_ID);

      const parent = getState().agents.get(SESSION_ID)!;
      expect(parent.children).toContain(AGENT_ID);
    });

    test('sets parentId to null if parent agent not found', () => {
      // No session created yet — parent doesn't exist in the agents map
      processEvent(
        makeAgentSpawned({
          agent_id: AGENT_ID,
          parent_session_id: 'nonexistent-parent',
          session_id: 'also-nonexistent',
        }),
        Date.now(),
      );

      const agent = getState().agents.get(AGENT_ID)!;
      expect(agent.parentId).toBeNull();
    });

    test('during live events, agent starts as spawning (no immediate transition)', () => {
      setupRootSession();
      // Live event — no eventTime passed
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }));

      const agent = getState().agents.get(AGENT_ID)!;
      // Live events keep spawning status; setTimeout transitions it later
      expect(agent.status).toBe('spawning');
    });

    test('during history replay, agent transitions to active immediately', () => {
      setupRootSession();
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), Date.now());

      const agent = getState().agents.get(AGENT_ID)!;
      expect(agent.status).toBe('active');
    });

    test('spawning multiple sub-agents creates correct parent-child tree', () => {
      setupRootSession();
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), Date.now());
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID_2 }), Date.now());

      const parent = getState().agents.get(SESSION_ID)!;
      expect(parent.children).toContain(AGENT_ID);
      expect(parent.children).toContain(AGENT_ID_2);
      expect(parent.children.length).toBe(2);
    });
  });

  // =========================================================================
  // processEvent: AgentCompleted
  // =========================================================================

  describe('processEvent: AgentCompleted', () => {
    test('sets agent status to completed and clears activeToolCall', () => {
      const { agentId } = setupWithSubAgent();

      // Give agent an active tool call first
      processEvent(makeToolCallStarted({ session_id: agentId, tool_use_id: 'tc-1' }));

      processEvent(makeAgentCompleted({ agent_id: agentId }), Date.now());

      const agent = getState().agents.get(agentId)!;
      expect(agent.status).toBe('completed');
      expect(agent.activeToolCall).toBeNull();
    });

    test('agent remains in map during history replay (no timer-based removal)', () => {
      const { agentId } = setupWithSubAgent();
      processEvent(makeAgentCompleted({ agent_id: agentId }), Date.now());

      // During history replay, agent is NOT removed by setTimeout
      expect(getState().agents.has(agentId)).toBe(true);
      expect(getState().agents.get(agentId)!.status).toBe('completed');
    });

    test('auto-creates agent on AgentCompleted if not in store (missed AgentSpawned)', () => {
      setupRootSession();
      // SubagentStart hook may not fire, but SubagentStop does.
      // AgentCompleted arrives for an agent never seen before.
      processEvent(makeAgentCompleted({
        agent_id: 'never-spawned',
        session_id: SESSION_ID,
      }), Date.now());

      // Agent should be auto-created with completed status
      expect(getState().agents.has('never-spawned')).toBe(true);
      const agent = getState().agents.get('never-spawned')!;
      expect(agent.status).toBe('completed');
      expect(agent.parentId).toBe(SESSION_ID);
    });
  });

  // =========================================================================
  // processEvent: ToolCallStarted
  // =========================================================================

  describe('processEvent: ToolCallStarted', () => {
    test('adds tool call to activeToolCalls map', () => {
      setupRootSession();
      processEvent(makeToolCallStarted());

      const s = getState();
      expect(s.activeToolCalls.size).toBe(1);
      const tc = s.activeToolCalls.get(TOOL_USE_ID)!;
      expect(tc.tool_name).toBe('Read');
      expect(tc.tool_use_id).toBe(TOOL_USE_ID);
    });

    test('sets agent status to tool_executing and stores activeToolCall', () => {
      setupRootSession();
      processEvent(makeToolCallStarted());

      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.status).toBe('tool_executing');
      expect(agent.activeToolCall).not.toBeNull();
      expect(agent.activeToolCall!.tool_name).toBe('Read');
    });

    test('handles missing agent gracefully (no agent in map)', () => {
      // No session created — tool call for unknown session_id
      processEvent(makeToolCallStarted({ session_id: 'nonexistent' }));

      // Tool call is still tracked
      expect(getState().activeToolCalls.size).toBe(1);
      // No crash
    });

    test('tracks multiple concurrent tool calls', () => {
      setupRootSession();
      processEvent(makeToolCallStarted({ tool_use_id: TOOL_USE_ID }));
      processEvent(makeToolCallStarted({ tool_use_id: TOOL_USE_ID_2, tool_name: 'Write' }));

      expect(getState().activeToolCalls.size).toBe(2);
    });
  });

  // =========================================================================
  // processEvent: ToolCallCompleted
  // =========================================================================

  describe('processEvent: ToolCallCompleted', () => {
    test('removes tool call from activeToolCalls', () => {
      setupRootSession();
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallCompleted());

      expect(getState().activeToolCalls.size).toBe(0);
    });

    test('sets agent status back to active and clears activeToolCall', () => {
      setupRootSession();
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallCompleted());

      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.status).toBe('active');
      expect(agent.activeToolCall).toBeNull();
    });

    test('handles missing agent gracefully', () => {
      processEvent(makeToolCallStarted({ session_id: 'gone' }));
      processEvent(makeToolCallCompleted({ session_id: 'gone' }));
      expect(getState().activeToolCalls.size).toBe(0);
    });
  });

  // =========================================================================
  // processEvent: ToolCallFailed
  // =========================================================================

  describe('processEvent: ToolCallFailed', () => {
    test('removes tool call from activeToolCalls', () => {
      setupRootSession();
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallFailed());

      expect(getState().activeToolCalls.size).toBe(0);
    });

    test('sets agent status to error and clears activeToolCall', () => {
      setupRootSession();
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallFailed());

      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.status).toBe('error');
      expect(agent.activeToolCall).toBeNull();
    });

    test('during history replay, does not schedule revert timer (stays in error)', () => {
      setupRootSession();
      processEvent(makeToolCallStarted(), Date.now());
      processEvent(makeToolCallFailed(), Date.now());

      // No timer during history replay, status stays as 'error'
      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.status).toBe('error');
    });

    test('handles missing agent gracefully', () => {
      processEvent(makeToolCallStarted({ session_id: 'missing' }));
      processEvent(makeToolCallFailed({ session_id: 'missing' }));
      expect(getState().activeToolCalls.size).toBe(0);
    });
  });

  // =========================================================================
  // processEvent: MessageSent
  // =========================================================================

  describe('processEvent: MessageSent', () => {
    test('adds a message in flight', () => {
      processEvent(makeMessageSent());

      const msgs = getState().activeMessages;
      expect(msgs.length).toBe(1);
      expect(msgs[0].fromAgentId).toBe(AGENT_ID);
      expect(msgs[0].toAgentId).toBe(SESSION_ID);
      expect(msgs[0].contentPreview).toBe('Task completed successfully');
      expect(msgs[0].messageType).toBe('message');
      expect(msgs[0].progress).toBe(0);
      expect(msgs[0].duration).toBe(800);
    });

    test('accumulates multiple messages', () => {
      processEvent(makeMessageSent({ id: 'msg-1' }));
      processEvent(makeMessageSent({ id: 'msg-2' }));

      expect(getState().activeMessages.length).toBe(2);
    });
  });

  // =========================================================================
  // processEvent: UserPrompt
  // =========================================================================

  describe('processEvent: UserPrompt', () => {
    test('creates a user_prompt message targeting the root agent', () => {
      setupRootSession();
      processEvent(makeUserPrompt());

      const msgs = getState().activeMessages;
      expect(msgs.length).toBe(1);
      expect(msgs[0].fromAgentId).toBe('external');
      expect(msgs[0].toAgentId).toBe(SESSION_ID);
      expect(msgs[0].messageType).toBe('user_prompt');
      expect(msgs[0].duration).toBe(600);
    });

    test('truncates prompt_text to 100 chars for contentPreview', () => {
      const longText = 'x'.repeat(200);
      setupRootSession();
      processEvent(makeUserPrompt({ prompt_text: longText }));

      const msgs = getState().activeMessages;
      expect(msgs[0].contentPreview.length).toBe(100);
    });

    test('auto-creates root agent and creates message when no root agent exists', () => {
      // No session started — rootAgentId is null, but ensureAgentExists creates one
      processEvent(makeUserPrompt());
      expect(getState().activeMessages.length).toBe(1);
      expect(getState().agents.has(SESSION_ID)).toBe(true);
    });
  });

  // =========================================================================
  // processEvent: WaitingForUser
  // =========================================================================

  describe('processEvent: WaitingForUser', () => {
    test('sets agent status to waiting and clears activeToolCall', () => {
      setupRootSession();
      processEvent(makeToolCallStarted());
      processEvent(makeWaitingForUser());

      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.status).toBe('waiting');
      expect(agent.activeToolCall).toBeNull();
    });

    test('auto-creates agent for unknown session_id', () => {
      processEvent(makeWaitingForUser({ session_id: 'unknown' }));
      // Agent is auto-created and set to waiting
      expect(getState().agents.size).toBe(1);
      expect(getState().agents.get('unknown')!.status).toBe('waiting');
    });
  });

  // =========================================================================
  // processEvent: SessionEnded
  // =========================================================================

  describe('processEvent: SessionEnded', () => {
    test('reason "stop" sets root agent to waiting', () => {
      setupRootSession();
      processEvent(makeSessionEnded({ reason: 'stop' }));

      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.status).toBe('waiting');
      expect(agent.activeToolCall).toBeNull();
    });

    test('reason "normal" sets root agent to completed', () => {
      setupRootSession();
      processEvent(makeSessionEnded({ reason: 'normal' }));

      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.status).toBe('completed');
    });

    test('any non-stop reason sets root agent to completed', () => {
      setupRootSession();
      processEvent(makeSessionEnded({ reason: 'error' }));

      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.status).toBe('completed');
    });

    test('auto-creates root agent if it does not exist', () => {
      // No root session started — ensureAgentExists creates one
      processEvent(makeSessionEnded({ reason: 'stop' }));
      expect(getState().agents.size).toBe(1);
      expect(getState().agents.get(SESSION_ID)!.status).toBe('waiting');
    });

    test('clears activeToolCall on root agent', () => {
      setupRootSession();
      processEvent(makeToolCallStarted());
      processEvent(makeSessionEnded({ reason: 'stop' }));

      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.activeToolCall).toBeNull();
    });
  });

  // =========================================================================
  // processEvent: ContextCompaction
  // =========================================================================

  describe('processEvent: ContextCompaction', () => {
    test('is a no-op but increments totalEventsReceived and tracks time', () => {
      setupRootSession();
      const countBefore = getState().totalEventsReceived;

      processEvent(makeContextCompaction());

      expect(getState().totalEventsReceived).toBe(countBefore + 1);
      expect(getState().lastEventTimeByAgent.has(SESSION_ID)).toBe(true);
    });
  });

  // =========================================================================
  // totalEventsReceived counter
  // =========================================================================

  describe('totalEventsReceived', () => {
    test('increments for every event type', () => {
      setupRootSession(); // 1
      processEvent(makeAgentSpawned(), Date.now()); // 2
      processEvent(makeToolCallStarted()); // 3
      processEvent(makeToolCallCompleted()); // 4
      processEvent(makeMessageSent()); // 5
      processEvent(makeUserPrompt()); // 6
      processEvent(makeWaitingForUser()); // 7
      processEvent(makeSessionEnded({ reason: 'stop' })); // 8
      processEvent(makeContextCompaction()); // 9

      expect(getState().totalEventsReceived).toBe(9);
    });
  });

  // =========================================================================
  // lastEventTimeByAgent tracking
  // =========================================================================

  describe('lastEventTimeByAgent', () => {
    test('tracks time for SessionStarted using session_id', () => {
      processEvent(makeSessionStarted());
      expect(getState().lastEventTimeByAgent.has(SESSION_ID)).toBe(true);
    });

    test('tracks time for AgentSpawned using agent_id', () => {
      setupRootSession();
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), Date.now());
      expect(getState().lastEventTimeByAgent.has(AGENT_ID)).toBe(true);
    });

    test('tracks time for ToolCallStarted using session_id', () => {
      setupRootSession();
      processEvent(makeToolCallStarted());
      // session_id is the agent for tool events
      expect(getState().lastEventTimeByAgent.has(SESSION_ID)).toBe(true);
    });

    test('tracks time for MessageSent using from_agent', () => {
      processEvent(makeMessageSent({ from_agent: 'sender-1' }));
      expect(getState().lastEventTimeByAgent.has('sender-1')).toBe(true);
    });

    test('does not track time for UserPrompt (returns null from extractAgentId)', () => {
      setupRootSession();
      processEvent(makeUserPrompt());
      // UserPrompt sets agentId = null, so lastEventTimeByAgent should not gain a new key
      // (SESSION_ID already exists from SessionStarted, but no new null key)
      expect(getState().lastEventTimeByAgent.has('null')).toBe(false);
    });

    test('uses eventTime parameter when provided (history replay)', () => {
      const historicalTime = 1000000;
      processEvent(makeSessionStarted(), historicalTime);
      expect(getState().lastEventTimeByAgent.get(SESSION_ID)).toBe(historicalTime);
    });
  });

  // =========================================================================
  // cleanupStaleAgents()
  // =========================================================================

  describe('cleanupStaleAgents()', () => {
    test('removes completed sub-agents immediately', () => {
      setupRootSession();
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), Date.now());
      processEvent(makeAgentCompleted({ agent_id: AGENT_ID }), Date.now());

      expect(getState().agents.has(AGENT_ID)).toBe(true);

      getState().cleanupStaleAgents();

      expect(getState().agents.has(AGENT_ID)).toBe(false);
    });

    test('never removes the root agent even if completed', () => {
      setupRootSession();
      processEvent(makeSessionEnded({ reason: 'normal' }));
      // Root agent is now completed

      getState().cleanupStaleAgents();

      expect(getState().agents.has(SESSION_ID)).toBe(true);
    });

    test('removes stale non-root agents (>60s without event)', () => {
      setupRootSession();
      // Spawn a sub-agent with an old timestamp
      const oldTime = Date.now() - 120_000; // 2 minutes ago
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), oldTime);

      getState().cleanupStaleAgents();

      expect(getState().agents.has(AGENT_ID)).toBe(false);
    });

    test('does not remove active sub-agents with recent events', () => {
      setupRootSession();
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), Date.now());

      getState().cleanupStaleAgents();

      expect(getState().agents.has(AGENT_ID)).toBe(true);
    });

    test('removes stale agent from parent children array', () => {
      setupRootSession();
      const oldTime = Date.now() - 120_000;
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), oldTime);

      const parentBefore = getState().agents.get(SESSION_ID)!;
      expect(parentBefore.children).toContain(AGENT_ID);

      getState().cleanupStaleAgents();

      const parentAfter = getState().agents.get(SESSION_ID)!;
      expect(parentAfter.children).not.toContain(AGENT_ID);
    });

    test('is idempotent — calling twice produces same result', () => {
      setupRootSession();
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), Date.now());
      processEvent(makeAgentCompleted({ agent_id: AGENT_ID }), Date.now());

      getState().cleanupStaleAgents();
      const agentCount1 = getState().agents.size;

      getState().cleanupStaleAgents();
      const agentCount2 = getState().agents.size;

      expect(agentCount1).toBe(agentCount2);
    });

    test('does not modify state if no stale agents exist', () => {
      setupRootSession();
      const agentsBefore = getState().agents;

      getState().cleanupStaleAgents();

      // Root is the only agent, never cleaned up
      expect(getState().agents.size).toBe(agentsBefore.size);
    });
  });

  // =========================================================================
  // updateAnimations()
  // =========================================================================

  describe('updateAnimations()', () => {
    test('no-ops when activeMessages is empty', () => {
      const before = getState().activeMessages;
      getState().updateAnimations(Date.now());
      expect(getState().activeMessages).toBe(before); // same reference
    });

    test('advances message progress based on elapsed time', () => {
      processEvent(makeMessageSent());
      const msg = getState().activeMessages[0];
      const halfTime = msg.startTime + msg.duration / 2;

      getState().updateAnimations(halfTime);

      const updated = getState().activeMessages[0];
      expect(updated.progress).toBeCloseTo(0.5, 1);
    });

    test('removes messages when progress reaches 1.0', () => {
      processEvent(makeMessageSent());
      const msg = getState().activeMessages[0];
      const endTime = msg.startTime + msg.duration + 1;

      getState().updateAnimations(endTime);

      expect(getState().activeMessages.length).toBe(0);
    });

    test('caps progress at 1.0 and then removes', () => {
      processEvent(makeMessageSent());
      const msg = getState().activeMessages[0];
      const pastEnd = msg.startTime + msg.duration * 2;

      getState().updateAnimations(pastEnd);

      expect(getState().activeMessages.length).toBe(0);
    });

    test('handles multiple messages with different timings', () => {
      setupRootSession();
      processEvent(makeMessageSent({ id: 'msg-1' }));

      // Small delay to ensure different startTime
      const msgs1 = getState().activeMessages;
      const earlyTime = msgs1[0].startTime + msgs1[0].duration / 4;

      processEvent(makeUserPrompt());
      const msgs2 = getState().activeMessages;
      expect(msgs2.length).toBe(2);

      // At earlyTime, first message should be ~25% done, second just started
      getState().updateAnimations(earlyTime);
      const afterUpdate = getState().activeMessages;
      // Both should still be in flight (progress < 1)
      expect(afterUpdate.length).toBe(2);
    });

    test('does not update state if no progress changed', () => {
      processEvent(makeMessageSent());
      const msg = getState().activeMessages[0];

      // Update at startTime — progress should be 0 which is same as initial
      getState().updateAnimations(msg.startTime);

      // Progress should still be 0
      expect(getState().activeMessages[0].progress).toBe(0);
    });
  });

  // =========================================================================
  // focusAgent()
  // =========================================================================

  describe('focusAgent()', () => {
    test('sets focusedAgentId', () => {
      getState().focusAgent('some-agent');
      expect(getState().focusedAgentId).toBe('some-agent');
    });

    test('clears focusedAgentId with null', () => {
      getState().focusAgent('some-agent');
      getState().focusAgent(null);
      expect(getState().focusedAgentId).toBeNull();
    });
  });

  // =========================================================================
  // setBufferDelay()
  // =========================================================================

  describe('setBufferDelay()', () => {
    test('updates buffer delay value', () => {
      getState().setBufferDelay(200);
      expect(getState().bufferDelay).toBe(200);
    });

    test('allows setting delay to 0', () => {
      getState().setBufferDelay(0);
      expect(getState().bufferDelay).toBe(0);
    });
  });

  // =========================================================================
  // History replay vs live events
  // =========================================================================

  describe('history replay vs live events', () => {
    test('history replay: AgentSpawned transitions to active immediately', () => {
      setupRootSession();
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), Date.now());

      expect(getState().agents.get(AGENT_ID)!.status).toBe('active');
    });

    test('live event: AgentSpawned stays as spawning (timer transitions later)', () => {
      setupRootSession();
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }));

      expect(getState().agents.get(AGENT_ID)!.status).toBe('spawning');
    });

    test('history replay: AgentCompleted does not remove agent from map', () => {
      setupWithSubAgent();
      // Complete via history replay
      processEvent(makeAgentCompleted({ agent_id: AGENT_ID }), Date.now());

      // Agent should still be present (cleanup handles removal)
      expect(getState().agents.has(AGENT_ID)).toBe(true);
    });

    test('history replay: uses eventTime for lastEventTimeByAgent', () => {
      const pastTime = 1700000000000; // arbitrary fixed timestamp
      processEvent(makeSessionStarted(), pastTime);

      expect(getState().lastEventTimeByAgent.get(SESSION_ID)).toBe(pastTime);
    });

    test('live event: uses Date.now() for lastEventTimeByAgent', () => {
      const before = Date.now();
      processEvent(makeSessionStarted());
      const after = Date.now();

      const tracked = getState().lastEventTimeByAgent.get(SESSION_ID)!;
      expect(tracked).toBeGreaterThanOrEqual(before);
      expect(tracked).toBeLessThanOrEqual(after);
    });
  });

  // =========================================================================
  // Complex event sequences
  // =========================================================================

  describe('complex event sequences', () => {
    test('full agent lifecycle: spawn → tool → complete', () => {
      setupRootSession();

      // Spawn sub-agent (history replay for immediate transition)
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), Date.now());
      expect(getState().agents.get(AGENT_ID)!.status).toBe('active');

      // Note: tool calls use session_id as agent identifier,
      // but for sub-agents, the session_id in ToolCallStarted
      // refers to the agent's own "session". We'll use the agent_id
      // approach here to demonstrate if we have the agent.
      // Actually the store looks up the agent by event.session_id for tool events.

      // Simulate tool call on the root session
      processEvent(makeToolCallStarted({ session_id: SESSION_ID }));
      expect(getState().agents.get(SESSION_ID)!.status).toBe('tool_executing');

      processEvent(makeToolCallCompleted({ session_id: SESSION_ID }));
      expect(getState().agents.get(SESSION_ID)!.status).toBe('active');

      // Complete sub-agent
      processEvent(makeAgentCompleted({ agent_id: AGENT_ID }), Date.now());
      expect(getState().agents.get(AGENT_ID)!.status).toBe('completed');

      // End session with stop → waiting
      processEvent(makeSessionEnded({ reason: 'stop' }));
      expect(getState().agents.get(SESSION_ID)!.status).toBe('waiting');
    });

    test('multiple sub-agents: spawn, complete one, keep other active', () => {
      setupRootSession();

      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), Date.now());
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID_2 }), Date.now());
      expect(getState().agents.size).toBe(3);

      // Complete first sub-agent
      processEvent(makeAgentCompleted({ agent_id: AGENT_ID }), Date.now());
      expect(getState().agents.get(AGENT_ID)!.status).toBe('completed');
      expect(getState().agents.get(AGENT_ID_2)!.status).toBe('active');

      // Cleanup removes completed sub-agent
      getState().cleanupStaleAgents();
      expect(getState().agents.has(AGENT_ID)).toBe(false);
      expect(getState().agents.has(AGENT_ID_2)).toBe(true);
      expect(getState().agents.size).toBe(2);
    });

    test('tool call failed then new tool call succeeds', () => {
      setupRootSession();

      processEvent(makeToolCallStarted({ tool_use_id: 'fail-1' }));
      processEvent(makeToolCallFailed({ tool_use_id: 'fail-1' }), Date.now());
      expect(getState().agents.get(SESSION_ID)!.status).toBe('error');

      // New tool call should work fine
      processEvent(makeToolCallStarted({ tool_use_id: 'success-1' }));
      expect(getState().agents.get(SESSION_ID)!.status).toBe('tool_executing');

      processEvent(makeToolCallCompleted({ tool_use_id: 'success-1' }));
      expect(getState().agents.get(SESSION_ID)!.status).toBe('active');
      expect(getState().activeToolCalls.size).toBe(0);
    });

    test('session restart: new SessionStarted replaces rootAgentId', () => {
      setupRootSession(SESSION_ID);
      processEvent(makeSessionEnded({ reason: 'normal' }));
      expect(getState().agents.get(SESSION_ID)!.status).toBe('completed');

      // New session
      processEvent(makeSessionStarted({ session_id: SESSION_ID_2 }));
      expect(getState().rootAgentId).toBe(SESSION_ID_2);
      expect(getState().agents.has(SESSION_ID)).toBe(true);
      expect(getState().agents.has(SESSION_ID_2)).toBe(true);
    });

    test('history replay full sequence with cleanup', () => {
      const baseTime = Date.now() - 300_000; // 5 minutes ago

      processEvent(makeSessionStarted(), baseTime);
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), baseTime + 1000);
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID_2 }), baseTime + 2000);
      processEvent(makeAgentCompleted({ agent_id: AGENT_ID }), baseTime + 10000);
      processEvent(makeAgentCompleted({ agent_id: AGENT_ID_2 }), baseTime + 20000);

      expect(getState().agents.size).toBe(3); // root + 2 completed sub-agents

      getState().cleanupStaleAgents();

      // Completed sub-agents removed, root stays
      expect(getState().agents.size).toBe(1);
      expect(getState().agents.has(SESSION_ID)).toBe(true);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    test('processing event on empty store does not crash', () => {
      expect(() => processEvent(makeToolCallCompleted())).not.toThrow();
      expect(() => processEvent(makeAgentCompleted())).not.toThrow();
      expect(() => processEvent(makeSessionEnded())).not.toThrow();
      expect(() => processEvent(makeWaitingForUser())).not.toThrow();
    });

    test('duplicate SessionStarted for same session_id overwrites agent', () => {
      processEvent(makeSessionStarted({ model: 'model-A' }));
      processEvent(makeSessionStarted({ model: 'model-B' }));

      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.model).toBe('model-B');
    });

    test('ToolCallCompleted for unknown tool_use_id is a no-op for tool map', () => {
      processEvent(makeToolCallCompleted({ tool_use_id: 'unknown-tool' }));
      // Should not crash, tool map remains empty
      expect(getState().activeToolCalls.size).toBe(0);
    });

    test('WaitingForUser on non-existent session auto-creates agent', () => {
      processEvent(makeWaitingForUser({ session_id: 'nonexistent' }));
      expect(getState().agents.size).toBe(1);
      expect(getState().agents.get('nonexistent')!.status).toBe('waiting');
    });

    test('SessionEnded with no rootAgentId set auto-creates agent', () => {
      processEvent(makeSessionEnded({ reason: 'stop' }));
      expect(getState().agents.size).toBe(1);
      expect(getState().agents.get(SESSION_ID)!.status).toBe('waiting');
    });

    test('MessageSent creates in-flight message even without agents in store', () => {
      processEvent(makeMessageSent());
      expect(getState().activeMessages.length).toBe(1);
    });
  });

  // =========================================================================
  // Notification fields on AgentNode
  // =========================================================================

  describe('notification fields', () => {
    test('SessionStarted creates agent with null notification fields', () => {
      setupRootSession();
      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.notificationMessage).toBeNull();
      expect(agent.notificationType).toBeNull();
    });

    test('AgentSpawned creates agent with null notification fields', () => {
      setupRootSession();
      processEvent(makeAgentSpawned({ agent_id: AGENT_ID }), Date.now());
      const agent = getState().agents.get(AGENT_ID)!;
      expect(agent.notificationMessage).toBeNull();
      expect(agent.notificationType).toBeNull();
    });

    test('AgentCompleted auto-created agent has null notification fields', () => {
      setupRootSession();
      processEvent(makeAgentCompleted({
        agent_id: 'auto-created',
        session_id: SESSION_ID,
      }), Date.now());
      const agent = getState().agents.get('auto-created')!;
      expect(agent.notificationMessage).toBeNull();
      expect(agent.notificationType).toBeNull();
    });

    test('WaitingForUser stores notificationMessage and notificationType on agent', () => {
      setupRootSession();
      processEvent(makeWaitingForUser({
        notification_type: 'permission_request',
        message: 'Allow file write?',
      }));
      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.status).toBe('waiting');
      expect(agent.notificationMessage).toBe('Allow file write?');
      expect(agent.notificationType).toBe('permission_request');
    });

    test('WaitingForUser with notification type stores correctly', () => {
      setupRootSession();
      processEvent(makeWaitingForUser({
        notification_type: 'notification',
        message: 'Task completed, waiting for next instruction',
      }));
      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.notificationMessage).toBe('Task completed, waiting for next instruction');
      expect(agent.notificationType).toBe('notification');
    });

    test('ToolCallStarted clears notification fields', () => {
      setupRootSession();
      // Set notification via WaitingForUser
      processEvent(makeWaitingForUser({
        notification_type: 'permission_request',
        message: 'Allow write?',
      }));
      expect(getState().agents.get(SESSION_ID)!.notificationMessage).toBe('Allow write?');

      // Tool call starts — agent transitions away from waiting
      processEvent(makeToolCallStarted());
      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.notificationMessage).toBeNull();
      expect(agent.notificationType).toBeNull();
    });

    test('SessionEnded clears notification fields', () => {
      setupRootSession();
      processEvent(makeWaitingForUser({
        notification_type: 'notification',
        message: 'Waiting for input',
      }));
      expect(getState().agents.get(SESSION_ID)!.notificationMessage).toBe('Waiting for input');

      processEvent(makeSessionEnded({ reason: 'normal' }));
      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.notificationMessage).toBeNull();
      expect(agent.notificationType).toBeNull();
    });

    test('SessionEnded with reason "stop" preserves notification fields', () => {
      setupRootSession();
      processEvent(makeWaitingForUser({
        notification_type: 'permission_request',
        message: 'Allow?',
      }));

      processEvent(makeSessionEnded({ reason: 'stop' }));
      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.status).toBe('waiting');
      // stop means "still waiting" — preserve the notification from WaitingForUser
      expect(agent.notificationMessage).toBe('Allow?');
      expect(agent.notificationType).toBe('permission_request');
    });

    test('SessionEnded with reason "normal" clears notification fields', () => {
      setupRootSession();
      processEvent(makeWaitingForUser({
        notification_type: 'notification',
        message: 'Waiting',
      }));

      processEvent(makeSessionEnded({ reason: 'normal' }));
      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.status).toBe('completed');
      expect(agent.notificationMessage).toBeNull();
      expect(agent.notificationType).toBeNull();
    });

    test('ToolCallCompleted clears notification fields', () => {
      setupRootSession();
      processEvent(makeWaitingForUser({
        notification_type: 'notification',
        message: 'Waiting',
      }));
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallCompleted());
      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.notificationMessage).toBeNull();
      expect(agent.notificationType).toBeNull();
    });

    test('ToolCallFailed clears notification fields', () => {
      setupRootSession();
      processEvent(makeWaitingForUser({
        notification_type: 'notification',
        message: 'Waiting',
      }));
      processEvent(makeToolCallStarted());
      processEvent(makeToolCallFailed());
      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.notificationMessage).toBeNull();
      expect(agent.notificationType).toBeNull();
    });
  });

  // =========================================================================
  // Auto-create root agent when SessionStarted is missed
  // =========================================================================

  describe('auto-create root agent when SessionStarted is missed', () => {
    test('ToolCallStarted with unknown session_id auto-creates a root agent', () => {
      // No SessionStarted — server started after session began
      processEvent(makeToolCallStarted({ session_id: SESSION_ID }));

      const agent = getState().agents.get(SESSION_ID);
      expect(agent).toBeDefined();
      expect(agent!.id).toBe(SESSION_ID);
      expect(agent!.parentId).toBeNull();
      expect(agent!.status).toBe('tool_executing');
      expect(agent!.agentType).toBe('unknown');
      expect(agent!.model).toBe('unknown');
      expect(getState().rootAgentId).toBe(SESSION_ID);
    });

    test('ToolCallCompleted with unknown session_id auto-creates a root agent', () => {
      processEvent(makeToolCallCompleted({ session_id: SESSION_ID }));

      const agent = getState().agents.get(SESSION_ID);
      expect(agent).toBeDefined();
      expect(agent!.status).toBe('active');
      expect(getState().rootAgentId).toBe(SESSION_ID);
    });

    test('ToolCallFailed with unknown session_id auto-creates a root agent', () => {
      processEvent(makeToolCallFailed({ session_id: SESSION_ID }));

      const agent = getState().agents.get(SESSION_ID);
      expect(agent).toBeDefined();
      expect(agent!.status).toBe('error');
      expect(getState().rootAgentId).toBe(SESSION_ID);
    });

    test('WaitingForUser with unknown session_id auto-creates a root agent', () => {
      processEvent(makeWaitingForUser({ session_id: SESSION_ID }));

      const agent = getState().agents.get(SESSION_ID);
      expect(agent).toBeDefined();
      expect(agent!.status).toBe('waiting');
      expect(getState().rootAgentId).toBe(SESSION_ID);
    });

    test('SessionEnded with unknown session_id auto-creates a root agent', () => {
      processEvent(makeSessionEnded({ session_id: SESSION_ID, reason: 'stop' }));

      const agent = getState().agents.get(SESSION_ID);
      expect(agent).toBeDefined();
      expect(agent!.status).toBe('waiting');
      expect(getState().rootAgentId).toBe(SESSION_ID);
    });

    test('UserPrompt with unknown session_id auto-creates a root agent', () => {
      processEvent(makeUserPrompt({ session_id: SESSION_ID }));

      const agent = getState().agents.get(SESSION_ID);
      expect(agent).toBeDefined();
      expect(agent!.status).toBe('active');
      expect(getState().rootAgentId).toBe(SESSION_ID);
    });

    test('auto-created root agent has correct default fields', () => {
      processEvent(makeToolCallStarted({ session_id: SESSION_ID }));

      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.children).toEqual([]);
      expect(agent.taskDescription).toBeNull();
      expect(agent.activeToolCall).not.toBeNull(); // set by ToolCallStarted
      expect(agent.notificationMessage).toBeNull();
      expect(agent.notificationType).toBeNull();
    });

    test('does not re-create agent if it already exists', () => {
      setupRootSession();
      const originalAgent = getState().agents.get(SESSION_ID)!;
      expect(originalAgent.agentType).toBe('main');

      processEvent(makeToolCallStarted({ session_id: SESSION_ID }));

      // Should keep the original agent type, not overwrite with 'unknown'
      const agent = getState().agents.get(SESSION_ID)!;
      expect(agent.agentType).toBe('main');
    });

    test('subsequent events work correctly after auto-creation', () => {
      // Auto-create via ToolCallStarted
      processEvent(makeToolCallStarted({ session_id: SESSION_ID }));
      expect(getState().agents.get(SESSION_ID)!.status).toBe('tool_executing');

      // ToolCallCompleted should transition to active
      processEvent(makeToolCallCompleted({ session_id: SESSION_ID }));
      expect(getState().agents.get(SESSION_ID)!.status).toBe('active');

      // WaitingForUser should transition to waiting
      processEvent(makeWaitingForUser({ session_id: SESSION_ID }));
      expect(getState().agents.get(SESSION_ID)!.status).toBe('waiting');
    });
  });

  // -----------------------------------------------------------------
  // Bug fix: activeToolCalls cleanup after history replay
  // -----------------------------------------------------------------
  describe('activeToolCalls cleanup after history replay', () => {
    test('orphaned ToolCallStarted entries are cleared after history replay', () => {
      // Simulate history replay where ToolCallStarted has no matching Completed
      // (the Completed event fell outside the 500-event window)
      const historyTime = Date.now() - 30_000;
      processEvent(makeSessionStarted(), historyTime);
      processEvent(
        makeToolCallStarted({ tool_use_id: 'orphan-1', session_id: SESSION_ID }),
        historyTime + 1000,
      );
      processEvent(
        makeToolCallStarted({ tool_use_id: 'orphan-2', session_id: SESSION_ID }),
        historyTime + 2000,
      );
      // Only orphan-2 gets a Completed event
      processEvent(
        makeToolCallCompleted({ tool_use_id: 'orphan-2', session_id: SESSION_ID }),
        historyTime + 3000,
      );

      // Before cleanup: orphan-1 is still in activeToolCalls
      expect(getState().activeToolCalls.size).toBe(1);
      expect(getState().activeToolCalls.has('orphan-1')).toBe(true);

      // After cleanup: stale tool calls should be removed
      getState().cleanupStaleAgents();
      expect(getState().activeToolCalls.size).toBe(0);
    });

    test('activeToolCalls for the root agent in waiting status are cleared', () => {
      const historyTime = Date.now() - 30_000;
      processEvent(makeSessionStarted(), historyTime);
      processEvent(
        makeToolCallStarted({ tool_use_id: 'stale-tool', session_id: SESSION_ID }),
        historyTime + 1000,
      );
      // Session ends with "stop" → root goes to waiting
      processEvent(makeSessionEnded({ reason: 'stop' }), historyTime + 5000);

      // Root agent is waiting but activeToolCalls still has stale entry
      expect(getState().agents.get(SESSION_ID)?.status).toBe('waiting');
      expect(getState().activeToolCalls.size).toBe(1);

      getState().cleanupStaleAgents();
      // After cleanup, stale tool calls should be gone
      expect(getState().activeToolCalls.size).toBe(0);
    });
  });
});
