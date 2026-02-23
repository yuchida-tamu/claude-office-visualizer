import type { AgentNode } from '@shared/agent';
import type { SceneManager } from './SceneManager';
import type { ToolAnimationManager } from './ToolAnimationManager';
import type { VisualizerState, MessageInFlight } from '../store/useVisualizerStore';

/**
 * SceneBridge — connects Zustand store state to the 3D scene.
 *
 * Subscribes to store changes and drives DeskManager, ToolAnimationManager,
 * ParticleSystem, and CameraController based on agent lifecycle events,
 * tool calls, and messages in flight.
 */
export class SceneBridge {
  private sceneManager: SceneManager;
  private toolAnimations: ToolAnimationManager;
  private prevAgents = new Map<string, AgentNode>();
  private prevFocusedAgentId: string | null = null;

  constructor(sceneManager: SceneManager, toolAnimations: ToolAnimationManager) {
    this.sceneManager = sceneManager;
    this.toolAnimations = toolAnimations;
  }

  /**
   * Called on each store change with the latest state snapshot.
   * Diffs against previous state and applies changes to the scene.
   */
  sync(state: VisualizerState): void {
    this.syncAgents(state.agents);
    this.syncMessages(state.activeMessages);
    this.syncFocus(state.focusedAgentId);

    // Drive the store animation ticker
    state.updateAnimations(Date.now());
  }

  // ---------------------------------------------------------------------------
  // Agents — spawn, despawn, status changes, tool animations
  // ---------------------------------------------------------------------------

  private syncAgents(agents: Map<string, AgentNode>): void {
    const deskManager = this.sceneManager.deskManager;

    // Detect new agents (spawn)
    for (const [id, agent] of agents) {
      const prev = this.prevAgents.get(id);
      if (!prev) {
        // New agent — spawn avatar at pre-rendered desk
        deskManager.spawnAvatar(id, agent.parentId ?? undefined);
        if (agent.status !== 'spawning') {
          deskManager.updateDeskState(id, agent.status);
        }
        // If agent already has an active tool call at spawn time
        if (agent.activeToolCall) {
          const group = deskManager.getDeskGroup(id);
          if (group) {
            this.toolAnimations.start(id, agent.activeToolCall.tool_name, group);
          }
        }
        // If agent spawns already waiting (history replay), show notification immediately
        if (agent.status === 'waiting') {
          deskManager.showNotification(id, agent.notificationType, agent.notificationMessage);
        }
        continue;
      }

      // Status changed
      if (prev.status !== agent.status) {
        deskManager.updateDeskState(id, agent.status);

        // Error flash
        if (agent.status === 'error') {
          deskManager.triggerErrorFlash(id);
        }

        // Notification popup: show on transition TO waiting, hide on transition FROM waiting
        if (agent.status === 'waiting') {
          deskManager.showNotification(id, agent.notificationType, agent.notificationMessage);
        } else if (prev.status === 'waiting') {
          deskManager.hideNotification(id);
        }
      }

      // Tool call changed
      if (prev.activeToolCall?.tool_use_id !== agent.activeToolCall?.tool_use_id) {
        if (agent.activeToolCall) {
          // New tool call — start tool-specific icon animation
          const group = deskManager.getDeskGroup(id);
          if (group) {
            this.toolAnimations.start(id, agent.activeToolCall.tool_name, group);
          }
        } else {
          // Tool call ended — fade out icon
          const failed = prev.activeToolCall != null && agent.status === 'error';
          this.toolAnimations.stop(id, failed);
        }
      }
    }

    // Detect removed agents (despawn)
    for (const id of this.prevAgents.keys()) {
      if (!agents.has(id)) {
        console.warn('[SceneBridge] agent removed from store:', id, 'remaining:', [...agents.keys()]);
        this.toolAnimations.stop(id);
        deskManager.despawnAvatar(id);
      }
    }

    // Snapshot for next diff
    this.prevAgents = new Map(agents);
  }

  // ---------------------------------------------------------------------------
  // Messages — particle system
  // ---------------------------------------------------------------------------

  private syncMessages(messages: MessageInFlight[]): void {
    const ps = this.sceneManager.particleSystem;
    ps.update(0, messages);
  }

  // ---------------------------------------------------------------------------
  // Focus — camera
  // ---------------------------------------------------------------------------

  private syncFocus(focusedAgentId: string | null): void {
    if (focusedAgentId === this.prevFocusedAgentId) return;
    this.prevFocusedAgentId = focusedAgentId;

    const cam = this.sceneManager.cameraController;
    if (focusedAgentId) {
      const pos = this.sceneManager.deskManager.getDeskPosition(focusedAgentId);
      if (pos) {
        cam.focusOn(pos);
      }
    } else {
      cam.resetView();
    }
  }

  dispose(): void {
    console.warn('[SceneBridge] dispose: clearing', this.prevAgents.size, 'prevAgents');
    this.prevAgents.clear();
  }
}
