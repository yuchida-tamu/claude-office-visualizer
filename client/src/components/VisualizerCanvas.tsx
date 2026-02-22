import { useEffect, useRef } from 'react';
import { SceneManager } from '../scene/SceneManager';
import { SceneBridge } from '../scene/SceneBridge';
import { useVisualizerStore } from '../store/useVisualizerStore';

/**
 * VisualizerCanvas – mounts the Three.js renderer into a full-screen canvas.
 * Owns the SceneManager lifecycle and bridges Zustand store to the 3D scene.
 */
export function VisualizerCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const bridgeRef = useRef<SceneBridge | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const manager = new SceneManager(canvas);
    sceneManagerRef.current = manager;

    const bridge = new SceneBridge(manager, manager.toolAnimationManager);
    bridgeRef.current = bridge;

    manager.init();

    // Drive bridge.sync() from the render loop so animations (particles,
    // message progress) advance every frame — not only on state changes.
    manager.setFrameCallback(() => {
      bridge.sync(useVisualizerStore.getState());
    });

    // Connect to the visualizer server via WebSocket
    useVisualizerStore.getState().connect();

    return () => {
      useVisualizerStore.getState().disconnect();
      bridge.dispose();
      manager.dispose();
      sceneManagerRef.current = null;
      bridgeRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: '100vh',
      }}
    />
  );
}
