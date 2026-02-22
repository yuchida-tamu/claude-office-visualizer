import { create } from 'zustand';
import type { VisualizerEvent } from '@shared/events';
import type { AgentNode, AgentStatus, ActiveToolCall } from '@shared/agent';
import type { ServerMessage, ClientSubscribeMessage } from '@shared/messages';

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface MessageInFlight {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  contentPreview: string;
  messageType: 'task' | 'message' | 'broadcast' | 'user_prompt';
  startTime: number;
  duration: number;
  progress: number;
}

export interface BufferedEvent {
  event: VisualizerEvent;
  receivedAt: number;
  scheduledAt: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface VisualizerState {
  // Connection
  connectionStatus: ConnectionStatus;
  websocket: WebSocket | null;

  // Agent tree
  agents: Map<string, AgentNode>;
  rootAgentId: string | null;

  // Tool calls (active, keyed by tool_use_id)
  activeToolCalls: Map<string, ActiveToolCall>;

  // Messages in flight (for particle animation)
  activeMessages: MessageInFlight[];

  // Event buffer for timing normalization
  eventBuffer: BufferedEvent[];
  bufferDelay: number;

  // Session info
  currentSessionId: string | null;

  // Stats
  totalEventsReceived: number;

  // Focus
  focusedAgentId: string | null;

  // Tracking for thinking-state inference
  lastEventTimeByAgent: Map<string, number>;

  // Actions
  connect: (url?: string) => void;
  disconnect: () => void;
  processEvent: (event: VisualizerEvent, eventTime?: number) => void;
  cleanupStaleAgents: () => void;
  setBufferDelay: (delay: number) => void;
  focusAgent: (agentId: string | null) => void;
  updateAnimations: (now: number) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Internals (not in state, managed outside Zustand)
// ---------------------------------------------------------------------------

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let thinkingInterval: ReturnType<typeof setInterval> | null = null;
let bufferRafId: number | null = null;
let lastProcessedTime = 0;
// Epoch counter — incremented on each connect(). Timers created during an older
// epoch are stale and must no-op to avoid double-processing after StrictMode
// double-mount or reconnections.
let connectionEpoch = 0;

function clearTimers() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (thinkingInterval !== null) {
    clearInterval(thinkingInterval);
    thinkingInterval = null;
  }
  if (bufferRafId !== null) {
    cancelAnimationFrame(bufferRafId);
    bufferRafId = null;
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const initialState = {
  connectionStatus: 'disconnected' as ConnectionStatus,
  websocket: null as WebSocket | null,
  agents: new Map<string, AgentNode>(),
  rootAgentId: null as string | null,
  activeToolCalls: new Map<string, ActiveToolCall>(),
  activeMessages: [] as MessageInFlight[],
  eventBuffer: [] as BufferedEvent[],
  bufferDelay: 100,
  currentSessionId: null as string | null,
  totalEventsReceived: 0,
  focusedAgentId: null as string | null,
  lastEventTimeByAgent: new Map<string, number>(),
};

export const useVisualizerStore = create<VisualizerState>((set, get) => ({
  ...initialState,

  // -------------------------------------------------------------------
  // WebSocket connection
  // -------------------------------------------------------------------
  connect: (url?: string) => {
    // Default: use relative path so Vite proxy forwards to the server,
    // falling back to direct connection for production builds.
    if (!url) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      url = `${proto}//${window.location.host}/ws`;
    }
    const current = get();
    if (current.websocket) {
      current.websocket.close();
    }
    clearTimers();
    connectionEpoch++;

    set({ connectionStatus: 'connecting' });

    const ws = new WebSocket(url);

    ws.onopen = () => {
      // Guard against stale WS from React StrictMode double-mount.
      // If disconnect() ran before this WS opened, ignore it.
      if (get().websocket !== ws) return;

      set({ connectionStatus: 'connected', websocket: ws });
      const sub: ClientSubscribeMessage = { type: 'subscribe' };
      ws.send(JSON.stringify(sub));

      // Start thinking-state inference loop
      thinkingInterval = setInterval(() => {
        const state = get();
        const now = Date.now();
        const THINKING_THRESHOLD = 3000;
        const updatedAgents = new Map(state.agents);
        let changed = false;

        for (const [id, agent] of updatedAgents) {
          if (agent.status !== 'active') continue;
          const lastTime = state.lastEventTimeByAgent.get(id);
          if (lastTime !== undefined && now - lastTime > THINKING_THRESHOLD) {
            updatedAgents.set(id, { ...agent, status: 'thinking' as AgentStatus });
            changed = true;
          }
        }

        if (changed) {
          set({ agents: updatedAgents });
        }
      }, 1000);

      // Start event buffer processing loop
      const processBuffer = () => {
        const state = get();
        const now = Date.now();
        const ready: VisualizerEvent[] = [];
        const remaining: BufferedEvent[] = [];

        for (const buffered of state.eventBuffer) {
          if (buffered.scheduledAt <= now) {
            ready.push(buffered.event);
          } else {
            remaining.push(buffered);
          }
        }

        if (ready.length > 0) {
          set({ eventBuffer: remaining });
          for (const event of ready) {
            get().processEvent(event);
          }
        }

        bufferRafId = requestAnimationFrame(processBuffer);
      };
      bufferRafId = requestAnimationFrame(processBuffer);
    };

    ws.onmessage = (msgEvent) => {
      // Ignore messages from stale WebSocket (React StrictMode double-mount)
      if (get().websocket !== ws) return;

      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(msgEvent.data as string) as ServerMessage;
      } catch {
        return;
      }

      if (parsed.type === 'connected') {
        set({ currentSessionId: parsed.sessionId });
        return;
      }

      if (parsed.type === 'event') {
        enqueueEvent(parsed.data);
        return;
      }

      if (parsed.type === 'history') {
        // Process history events using their actual timestamps
        for (const event of parsed.data) {
          const eventTime = new Date(event.timestamp).getTime();
          get().processEvent(event, eventTime);
        }
        // Remove agents whose last event was >1 minute ago
        get().cleanupStaleAgents();

        // After history replay, fix root agent status and reset timestamps
        const postCleanup = get();
        const rootId = postCleanup.rootAgentId;
        if (rootId) {
          const rootAgent = postCleanup.agents.get(rootId);
          const lastRootEvent = postCleanup.lastEventTimeByAgent.get(rootId);
          const now = Date.now();

          // Step 1: If root agent's last event is stale (>15s), set to "waiting"
          if (
            rootAgent &&
            lastRootEvent &&
            now - lastRootEvent > 15_000 &&
            rootAgent.status !== 'completed'
          ) {
            const updatedAgents = new Map(postCleanup.agents);
            updatedAgents.set(rootId, { ...rootAgent, status: 'waiting' });
            set({ agents: updatedAgents });
          }
        }

        // Step 2: Reset all lastEventTimeByAgent to now to prevent stale thinking inference
        const afterFix = get();
        const resetTimes = new Map<string, number>();
        const freshNow = Date.now();
        for (const [id] of afterFix.lastEventTimeByAgent) {
          if (afterFix.agents.has(id)) {
            resetTimes.set(id, freshNow);
          }
        }
        set({ lastEventTimeByAgent: resetTimes });
      }
    };

    ws.onclose = () => {
      // Ignore stale closures — only handle if this is still the active WebSocket.
      // This prevents React StrictMode double-mount from creating an infinite
      // reconnection loop (old WS's async onclose fires after new WS is created).
      if (get().websocket !== ws) return;

      set({ connectionStatus: 'disconnected', websocket: null });
      clearTimers();
      // Auto-reconnect after 3 seconds
      reconnectTimer = setTimeout(() => {
        get().connect(url);
      }, 3000);
    };

    ws.onerror = () => {
      if (get().websocket !== ws) return;
      set({ connectionStatus: 'error' });
    };

    set({ websocket: ws });
  },

  // -------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------
  disconnect: () => {
    const { websocket } = get();
    clearTimers();
    connectionEpoch++; // Invalidate pending timers from this connection
    if (websocket) {
      websocket.close();
    }
    set({ connectionStatus: 'disconnected', websocket: null });
  },

  // -------------------------------------------------------------------
  // Stale agent cleanup (after history replay)
  // -------------------------------------------------------------------
  cleanupStaleAgents: () => {
    const state = get();
    const now = Date.now();
    const STALE_THRESHOLD = 60_000; // 1 minute
    const newAgents = new Map(state.agents);
    let changed = false;

    for (const [id, agent] of newAgents) {
      // Never clean up the root agent (current session)
      if (id === state.rootAgentId) continue;

      // Remove completed sub-agents immediately — their despawn animation is
      // irrelevant after history replay (no one saw the live completion).
      if (agent.status === 'completed') {
        newAgents.delete(id);
        changed = true;
        continue;
      }

      const lastEvent = state.lastEventTimeByAgent.get(id);
      if (lastEvent && now - lastEvent > STALE_THRESHOLD) {
        // Remove stale agent
        newAgents.delete(id);
        // Remove from parent's children array
        if (agent.parentId) {
          const parent = newAgents.get(agent.parentId);
          if (parent) {
            newAgents.set(agent.parentId, {
              ...parent,
              children: parent.children.filter((c) => c !== id),
            });
          }
        }
        changed = true;
      }
    }

    // Clear orphaned activeToolCalls — ToolCallStarted events whose matching
    // Completed/Failed events fell outside the history replay window leave
    // stale entries. Remove any tool call not actively tracked by an agent.
    const validToolIds = new Set<string>();
    for (const agent of newAgents.values()) {
      if (agent.activeToolCall) {
        validToolIds.add(agent.activeToolCall.tool_use_id);
      }
    }
    const newToolCalls = new Map(state.activeToolCalls);
    let toolCallsChanged = false;
    for (const toolId of newToolCalls.keys()) {
      if (!validToolIds.has(toolId)) {
        newToolCalls.delete(toolId);
        toolCallsChanged = true;
      }
    }

    if (changed || toolCallsChanged) {
      set({
        ...(changed ? { agents: newAgents } : {}),
        ...(toolCallsChanged ? { activeToolCalls: newToolCalls } : {}),
      });
    }
  },

  // -------------------------------------------------------------------
  // Core event processor
  // -------------------------------------------------------------------
  processEvent: (event: VisualizerEvent, eventTime?: number) => {
    const state = get();
    const now = eventTime ?? Date.now();

    // Track per-agent event timing
    const agentId = extractAgentId(event);
    const newLastEventTime = new Map(state.lastEventTimeByAgent);
    if (agentId) {
      newLastEventTime.set(agentId, now);
    }

    set({ totalEventsReceived: state.totalEventsReceived + 1, lastEventTimeByAgent: newLastEventTime });

    switch (event.type) {
      case 'SessionStarted': {
        const newAgents = new Map(state.agents);
        const newAgent: AgentNode = {
          id: event.session_id,
          parentId: null,
          children: [],
          status: 'active',
          agentType: event.agent_type,
          model: event.model,
          taskDescription: null,
          position: { x: 0, y: 0, z: 0 },
          activeToolCall: null,
          notificationMessage: null,
          notificationType: null,
        };
        newAgents.set(event.session_id, newAgent);
        set({
          agents: newAgents,
          rootAgentId: event.session_id,
          currentSessionId: event.session_id,
        });
        break;
      }

      case 'AgentSpawned': {
        const newAgents = new Map(state.agents);
        // Fall back to session_id as parent — Claude Code's subagent-start hook
        // provides the parent's session ID as session_id, but may not populate
        // parent_session_id separately.
        const parentId = event.parent_session_id ?? event.session_id;
        const parent = newAgents.get(parentId);

        const newAgent: AgentNode = {
          id: event.agent_id,
          parentId: parent ? parentId : null,
          children: [],
          status: 'spawning',
          agentType: event.agent_type,
          model: event.model,
          taskDescription: event.task_description,
          position: { x: 0, y: 0, z: 0 },
          activeToolCall: null,
          notificationMessage: null,
          notificationType: null,
        };
        newAgents.set(event.agent_id, newAgent);

        // Add child reference to parent
        if (parent) {
          newAgents.set(parentId, {
            ...parent,
            children: [...parent.children, event.agent_id],
          });
        }

        set({ agents: newAgents });

        // Transition to active after short delay (live events only)
        if (eventTime === undefined) {
          const timerEpoch = connectionEpoch;
          setTimeout(() => {
            if (connectionEpoch !== timerEpoch) return;
            const s = get();
            const agent = s.agents.get(event.agent_id);
            if (agent && agent.status === 'spawning') {
              const updated = new Map(s.agents);
              updated.set(event.agent_id, { ...agent, status: 'active' });
              set({ agents: updated });
            }
          }, 300);
        } else {
          // During history replay, transition immediately
          const curr = get().agents.get(event.agent_id);
          if (curr && curr.status === 'spawning') {
            const updated = new Map(get().agents);
            updated.set(event.agent_id, { ...curr, status: 'active' });
            set({ agents: updated });
          }
        }
        break;
      }

      case 'AgentCompleted': {
        const newAgents = new Map(state.agents);
        let agent = newAgents.get(event.agent_id);

        // Auto-create agent if AgentSpawned was missed (e.g. SubagentStart
        // hook didn't fire). Use session_id as parentId since that's the
        // parent session for subagent hooks.
        if (!agent) {
          const parentId = event.session_id;
          const parent = newAgents.get(parentId);
          agent = {
            id: event.agent_id,
            parentId: parent ? parentId : null,
            children: [],
            status: 'active',
            agentType: 'unknown',
            model: 'unknown',
            taskDescription: null,
            position: { x: 0, y: 0, z: 0 },
            activeToolCall: null,
            notificationMessage: null,
            notificationType: null,
          };
          newAgents.set(event.agent_id, agent);
          if (parent) {
            newAgents.set(parentId, {
              ...parent,
              children: [...parent.children, event.agent_id],
            });
          }
        }

        if (agent) {
          newAgents.set(event.agent_id, { ...agent, status: 'completed', activeToolCall: null });
          set({ agents: newAgents });

          // Remove after animation delay (live events only — history replay
          // relies on cleanupStaleAgents to remove completed agents)
          if (eventTime === undefined) {
            const timerEpoch = connectionEpoch;
            setTimeout(() => {
              if (connectionEpoch !== timerEpoch) return;
              const s = get();
              const updated = new Map(s.agents);
              const completedAgent = updated.get(event.agent_id);
              if (completedAgent) {
                updated.delete(event.agent_id);
                // Remove from parent's children array
                if (completedAgent.parentId) {
                  const p = updated.get(completedAgent.parentId);
                  if (p) {
                    updated.set(completedAgent.parentId, {
                      ...p,
                      children: p.children.filter((c) => c !== event.agent_id),
                    });
                  }
                }
                set({ agents: updated });
              }
            }, 500);
          }
        }
        break;
      }

      case 'ToolCallStarted': {
        const toolCall: ActiveToolCall = {
          tool_use_id: event.tool_use_id,
          tool_name: event.tool_name,
          started_at: event.timestamp,
        };
        const newToolCalls = new Map(state.activeToolCalls);
        newToolCalls.set(event.tool_use_id, toolCall);

        // Update agent status — tool events use session_id as agent identifier
        const newAgents = new Map(state.agents);
        const agent = newAgents.get(event.session_id);
        if (agent) {
          newAgents.set(event.session_id, {
            ...agent,
            status: 'tool_executing',
            activeToolCall: toolCall,
            notificationMessage: null,
            notificationType: null,
          });
        }

        set({ activeToolCalls: newToolCalls, agents: newAgents });
        break;
      }

      case 'ToolCallCompleted': {
        const newToolCalls = new Map(state.activeToolCalls);
        newToolCalls.delete(event.tool_use_id);

        const newAgents = new Map(state.agents);
        const agent = newAgents.get(event.session_id);
        if (agent) {
          newAgents.set(event.session_id, {
            ...agent,
            status: 'active',
            activeToolCall: null,
            notificationMessage: null,
            notificationType: null,
          });
        }

        set({ activeToolCalls: newToolCalls, agents: newAgents });
        break;
      }

      case 'ToolCallFailed': {
        const newToolCalls = new Map(state.activeToolCalls);
        newToolCalls.delete(event.tool_use_id);

        const newAgents = new Map(state.agents);
        const agent = newAgents.get(event.session_id);
        if (agent) {
          newAgents.set(event.session_id, { ...agent, status: 'error', activeToolCall: null, notificationMessage: null, notificationType: null });
          set({ activeToolCalls: newToolCalls, agents: newAgents });

          // Revert to active after brief error display (live events only)
          if (eventTime === undefined) {
            const timerEpoch = connectionEpoch;
            setTimeout(() => {
              if (connectionEpoch !== timerEpoch) return;
              const s = get();
              const a = s.agents.get(event.session_id);
              if (a && a.status === 'error') {
                const updated = new Map(s.agents);
                updated.set(event.session_id, { ...a, status: 'active' });
                set({ agents: updated });
              }
            }, 1500);
          }
        } else {
          set({ activeToolCalls: newToolCalls });
        }
        break;
      }

      case 'MessageSent': {
        const MESSAGE_DURATION = 800;
        const msg: MessageInFlight = {
          id: event.id,
          fromAgentId: event.from_agent,
          toAgentId: event.to_agent,
          contentPreview: event.content_preview,
          messageType: 'message',
          startTime: now,
          duration: MESSAGE_DURATION,
          progress: 0,
        };
        set({ activeMessages: [...state.activeMessages, msg] });
        break;
      }

      case 'UserPrompt': {
        const rootId = state.rootAgentId;
        if (rootId) {
          const MESSAGE_DURATION = 600;
          const msg: MessageInFlight = {
            id: event.id,
            fromAgentId: 'external',
            toAgentId: rootId,
            contentPreview: event.prompt_text.slice(0, 100),
            messageType: 'user_prompt',
            startTime: now,
            duration: MESSAGE_DURATION,
            progress: 0,
          };
          set({ activeMessages: [...state.activeMessages, msg] });
        }
        break;
      }

      case 'WaitingForUser': {
        const newAgents = new Map(state.agents);
        const agent = newAgents.get(event.session_id);
        if (agent) {
          newAgents.set(event.session_id, {
            ...agent,
            status: 'waiting',
            activeToolCall: null,
            notificationMessage: event.message,
            notificationType: event.notification_type,
          });
          set({ agents: newAgents });
        }
        break;
      }

      case 'SessionEnded': {
        const newAgents = new Map(state.agents);
        const root = state.rootAgentId ? newAgents.get(state.rootAgentId) : undefined;
        if (root && state.rootAgentId) {
          // "stop" fires between turns — agent is waiting for user, not finished
          const newStatus = event.reason === 'stop' ? 'waiting' : 'completed';
          newAgents.set(state.rootAgentId, { ...root, status: newStatus, activeToolCall: null, notificationMessage: null, notificationType: null });
          set({ agents: newAgents });
        }
        break;
      }

      case 'ContextCompaction': {
        // Optional: could store context pressure on agent. No-op for now.
        break;
      }
    }
  },

  // -------------------------------------------------------------------
  // Buffer delay config
  // -------------------------------------------------------------------
  setBufferDelay: (delay: number) => {
    set({ bufferDelay: delay });
  },

  // -------------------------------------------------------------------
  // Focus
  // -------------------------------------------------------------------
  focusAgent: (agentId: string | null) => {
    set({ focusedAgentId: agentId });
  },

  // -------------------------------------------------------------------
  // Animation tick — called from render loop
  // -------------------------------------------------------------------
  updateAnimations: (now: number) => {
    const state = get();
    if (state.activeMessages.length === 0) return;

    let changed = false;
    const updated: MessageInFlight[] = [];

    for (const msg of state.activeMessages) {
      const elapsed = now - msg.startTime;
      const progress = Math.min(elapsed / msg.duration, 1);
      if (progress >= 1) {
        changed = true;
        continue; // remove completed
      }
      if (progress !== msg.progress) {
        changed = true;
        updated.push({ ...msg, progress });
      } else {
        updated.push(msg);
      }
    }

    if (changed) {
      set({ activeMessages: updated });
    }
  },

  // -------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------
  reset: () => {
    const { websocket } = get();
    clearTimers();
    connectionEpoch++;
    if (websocket) {
      websocket.close();
    }
    lastProcessedTime = 0;
    set({
      ...initialState,
      agents: new Map(),
      activeToolCalls: new Map(),
      lastEventTimeByAgent: new Map(),
      activeMessages: [],
      eventBuffer: [],
    });
  },
}));

// ---------------------------------------------------------------------------
// Diagnostic: detect when root agent disappears from agents map
// ---------------------------------------------------------------------------

if (import.meta.env.DEV) {
  let prevRootPresent = false;
  useVisualizerStore.subscribe((state) => {
    const rootPresent = state.rootAgentId ? state.agents.has(state.rootAgentId) : false;
    if (prevRootPresent && !rootPresent && state.rootAgentId) {
      console.warn(
        '[VIZ] Root agent disappeared from store!',
        'rootAgentId:', state.rootAgentId,
        'agents:', [...state.agents.keys()],
        'epoch:', connectionEpoch,
      );
      console.trace();
    }
    prevRootPresent = rootPresent;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractAgentId(event: VisualizerEvent): string | null {
  switch (event.type) {
    case 'SessionStarted':
      return event.session_id;
    case 'AgentSpawned':
      return event.agent_id;
    case 'AgentCompleted':
      return event.agent_id;
    case 'ToolCallStarted':
    case 'ToolCallCompleted':
    case 'ToolCallFailed':
      return event.session_id;
    case 'MessageSent':
      return event.from_agent;
    case 'UserPrompt':
      return null;
    case 'WaitingForUser':
      return event.session_id;
    case 'SessionEnded':
      return event.session_id;
    case 'ContextCompaction':
      return event.session_id;
  }
}

function enqueueEvent(event: VisualizerEvent): void {
  const state = useVisualizerStore.getState();
  const now = Date.now();
  const scheduledAt = Math.max(lastProcessedTime + state.bufferDelay, now);
  lastProcessedTime = scheduledAt;

  const buffered: BufferedEvent = {
    event,
    receivedAt: now,
    scheduledAt,
  };

  useVisualizerStore.setState({
    eventBuffer: [...state.eventBuffer, buffered],
  });
}
