import { useEffect, useState } from 'react';
import { useVisualizerStore } from '../store/useVisualizerStore';
import { selectFocusedAgent } from '../store/selectors';
import type { AgentStatus } from '@shared/agent';

// ---------------------------------------------------------------------------
// Status color mapping (matches 3D scene indicator colors)
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<AgentStatus, string> = {
  spawning: '#60a5fa',
  active: '#4ade80',
  thinking: '#60a5fa',
  tool_executing: '#fbbf24',
  waiting: '#fb923c',
  error: '#ef4444',
  completed: '#9ca3af',
};

const STATUS_LABELS: Record<AgentStatus, string> = {
  spawning: 'Spawning',
  active: 'Active',
  thinking: 'Thinking',
  tool_executing: 'Executing Tool',
  waiting: 'Waiting',
  error: 'Error',
  completed: 'Completed',
};

// ---------------------------------------------------------------------------
// Elapsed time helper
// ---------------------------------------------------------------------------

function useElapsedTime(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startedAt) {
      setElapsed('');
      return;
    }

    const update = () => {
      const start = new Date(startedAt).getTime();
      const diff = Math.max(0, Date.now() - start);
      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) {
        setElapsed(`${seconds}s`);
      } else {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        setElapsed(`${mins}m ${secs}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}

// ---------------------------------------------------------------------------
// Truncation helper
// ---------------------------------------------------------------------------

function truncateId(id: string, maxLen = 12): string {
  if (id.length <= maxLen) return id;
  return id.slice(0, maxLen) + '...';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  wrapper: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: '340px',
    pointerEvents: 'none' as const,
    zIndex: 20,
  },
  panel: (visible: boolean) => ({
    position: 'absolute' as const,
    top: '16px',
    right: '16px',
    bottom: '16px',
    width: '308px',
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    color: '#ffffff',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    overflowY: 'auto' as const,
    pointerEvents: 'auto' as const,
    transform: visible ? 'translateX(0)' : 'translateX(calc(100% + 16px))',
    opacity: visible ? 1 : 0,
    transition: 'transform 0.3s ease, opacity 0.3s ease',
  }),
  header: {
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  headerTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  closeButton: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '6px',
    color: 'rgba(255, 255, 255, 0.7)',
    cursor: 'pointer',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    fontSize: '14px',
    lineHeight: 1,
    padding: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    fontSize: '13px',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  value: {
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: '12px',
  },
  statusBadge: (status: AgentStatus) => ({
    display: 'inline-flex',
    alignItems: 'center' as const,
    gap: '6px',
    padding: '3px 10px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 500,
    background: `${STATUS_COLORS[status]}20`,
    color: STATUS_COLORS[status],
    border: `1px solid ${STATUS_COLORS[status]}40`,
  }),
  statusDot: (status: AgentStatus) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: STATUS_COLORS[status],
    boxShadow: `0 0 6px ${STATUS_COLORS[status]}`,
  }),
  divider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.08)',
    margin: '4px 0',
  },
  toolCallBox: {
    background: 'rgba(251, 191, 36, 0.1)',
    border: '1px solid rgba(251, 191, 36, 0.2)',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '12px',
  },
  notificationBox: (type: 'notification' | 'permission_request') => {
    const color = type === 'permission_request' ? '#ef4444' : '#fb923c';
    return {
      background: `${color}15`,
      border: `1px solid ${color}30`,
      borderRadius: '8px',
      padding: '10px 12px',
      fontSize: '12px',
    };
  },
  notificationLabel: (type: 'notification' | 'permission_request') => ({
    color: type === 'permission_request' ? '#ef4444' : '#fb923c',
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
  }),
  notificationMessage: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: '12px',
    lineHeight: 1.5,
    wordBreak: 'break-word' as const,
  },
  toolName: {
    color: '#fbbf24',
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  toolElapsed: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '11px',
    marginTop: '4px',
  },
  taskDescription: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: '12px',
    lineHeight: 1.5,
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    padding: '10px 12px',
    wordBreak: 'break-word' as const,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentDetailPanel() {
  const agent = useVisualizerStore(selectFocusedAgent);
  const focusAgent = useVisualizerStore((s) => s.focusAgent);

  // Track visibility separately for slide-in animation
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (agent) {
      // Trigger slide-in on next frame so the transition animates
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [agent?.id]);

  const toolElapsed = useElapsedTime(agent?.activeToolCall?.started_at ?? null);

  // Always render the wrapper for animation; hide when no agent and transition done
  if (!agent && !visible) return null;

  return (
    <div style={styles.wrapper}>
      <div style={styles.panel(visible && agent !== null)}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerTitle}>Agent Details</span>
          <button
            style={styles.closeButton}
            onClick={() => focusAgent(null)}
            title="Close panel"
          >
            X
          </button>
        </div>

        {agent && (
          <>
            {/* Identity section */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Identity</div>
              <div style={styles.row}>
                <span style={styles.label}>ID</span>
                <span style={styles.value} title={agent.id}>
                  {truncateId(agent.id)}
                </span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Type</span>
                <span style={styles.value}>{agent.agentType}</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Model</span>
                <span style={styles.value}>{agent.model}</span>
              </div>
            </div>

            <div style={styles.divider} />

            {/* Status section */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Status</div>
              <div>
                <span style={styles.statusBadge(agent.status)}>
                  <span style={styles.statusDot(agent.status)} />
                  {STATUS_LABELS[agent.status]}
                </span>
              </div>
            </div>

            {/* Notification message (when waiting for user) */}
            {agent.status === 'waiting' && (
              <>
                <div style={styles.divider} />
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Waiting For</div>
                  <div style={styles.notificationBox(agent.notificationType ?? 'notification')}>
                    <div style={styles.notificationLabel(agent.notificationType ?? 'notification')}>
                      {agent.notificationType === 'permission_request' ? 'Permission Required' : 'Needs Input'}
                    </div>
                    <div style={styles.notificationMessage}>
                      {agent.notificationMessage || 'Waiting for user input'}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Active tool call */}
            {agent.activeToolCall && (
              <>
                <div style={styles.divider} />
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Active Tool Call</div>
                  <div style={styles.toolCallBox}>
                    <div style={styles.toolName}>{agent.activeToolCall.tool_name}</div>
                    {toolElapsed && (
                      <div style={styles.toolElapsed}>Running for {toolElapsed}</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Task description (sub-agents) */}
            {agent.taskDescription && (
              <>
                <div style={styles.divider} />
                <div style={styles.section}>
                  <div style={styles.sectionTitle}>Task</div>
                  <div style={styles.taskDescription}>{agent.taskDescription}</div>
                </div>
              </>
            )}

            <div style={styles.divider} />

            {/* Relationships section */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Relationships</div>
              {agent.parentId && (
                <div style={styles.row}>
                  <span style={styles.label}>Parent</span>
                  <span style={styles.value} title={agent.parentId}>
                    {truncateId(agent.parentId)}
                  </span>
                </div>
              )}
              <div style={styles.row}>
                <span style={styles.label}>Children</span>
                <span style={styles.value}>{agent.children.length}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
