import { useShallow } from 'zustand/react/shallow';
import { useVisualizerStore } from '../store/useVisualizerStore';
import { selectStats, selectConnectionStatus } from '../store/selectors';
import type { ConnectionStatus } from '../store/useVisualizerStore';

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: '#4ade80',
  connecting: '#fbbf24',
  error: '#ef4444',
  disconnected: '#9ca3af',
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting...',
  error: 'Error',
  disconnected: 'Disconnected',
};

export function GlobalHUD() {
  const connectionStatus = useVisualizerStore(selectConnectionStatus);
  const stats = useVisualizerStore(useShallow(selectStats));
  const sessionId = useVisualizerStore((s) => s.currentSessionId);

  const dotColor = STATUS_COLORS[connectionStatus];
  const truncatedSession = sessionId ? sessionId.slice(0, 8) : '--';

  return (
    <div style={styles.container}>
      {/* Connection status */}
      <div style={styles.row}>
        <span
          style={{
            ...styles.dot,
            backgroundColor: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
          }}
        />
        <span style={styles.label}>{STATUS_LABELS[connectionStatus]}</span>
      </div>

      {/* Stats */}
      <div style={styles.statsGrid}>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{stats.activeAgents}</span>
          <span style={styles.statLabel}>Agents</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{stats.activeToolCalls}</span>
          <span style={styles.statLabel}>Tools</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{stats.messagesInFlight}</span>
          <span style={styles.statLabel}>Messages</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{stats.totalEvents}</span>
          <span style={styles.statLabel}>Events</span>
        </div>
      </div>

      {/* Session ID */}
      <div style={styles.sessionRow}>
        <span style={styles.sessionLabel}>Session:</span>
        <span style={styles.sessionValue}>{truncatedSession}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 16,
    left: 16,
    padding: '12px 16px',
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    color: '#fff',
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: 12,
    minWidth: 160,
    pointerEvents: 'auto',
    zIndex: 100,
    userSelect: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  label: {
    fontSize: 11,
    opacity: 0.9,
    letterSpacing: 0.3,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px 12px',
    marginBottom: 10,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.2,
  },
  statLabel: {
    fontSize: 9,
    opacity: 0.5,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  sessionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    paddingTop: 8,
  },
  sessionLabel: {
    fontSize: 9,
    opacity: 0.4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  sessionValue: {
    fontSize: 11,
    opacity: 0.7,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  },
};
