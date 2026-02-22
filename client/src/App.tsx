import { VisualizerCanvas } from './components/VisualizerCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GlobalHUD } from './components/GlobalHUD';
import { AgentDetailPanel } from './components/AgentDetailPanel';

export function App() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <VisualizerCanvas />
      <ErrorBoundary>
        <GlobalHUD />
      </ErrorBoundary>
      <ErrorBoundary>
        <AgentDetailPanel />
      </ErrorBoundary>
    </div>
  );
}
