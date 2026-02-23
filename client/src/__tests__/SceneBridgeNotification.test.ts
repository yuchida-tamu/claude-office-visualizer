import { describe, test, expect, beforeEach } from 'bun:test';
import type { AgentNode } from '@shared/agent';
import { SceneBridge } from '../scene/SceneBridge';

// ---------------------------------------------------------------------------
// Minimal mocks — just enough to test SceneBridge notification wiring
// ---------------------------------------------------------------------------

class MockDeskManager {
  showNotificationCalls: Array<{ agentId: string; type: string; message: string }> = [];
  hideNotificationCalls: string[] = [];

  addDesk() {}
  removeDesk() {}
  spawnAvatar() {}
  despawnAvatar() {}
  updateDeskState() {}
  getDeskGroup() { return null; }
  getDeskPosition() { return null; }
  triggerErrorFlash() {}

  showNotification(agentId: string, type: 'notification' | 'permission_request', message: string) {
    this.showNotificationCalls.push({ agentId, type, message });
  }

  hideNotification(agentId: string) {
    this.hideNotificationCalls.push(agentId);
  }
}

class MockToolAnimationManager {
  start() {}
  stop() {}
}

class MockCameraController {
  focusOn() {}
  resetView() {}
}

class MockParticleSystem {
  update() {}
}

class MockSceneManager {
  deskManager: MockDeskManager;
  cameraController = new MockCameraController();
  particleSystem = new MockParticleSystem();

  constructor() {
    this.deskManager = new MockDeskManager();
  }
}

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: 'agent-1',
    parentId: null,
    children: [],
    status: 'active',
    agentType: 'main',
    model: 'test-model',
    taskDescription: null,
    position: { x: 0, y: 0, z: 0 },
    activeToolCall: null,
    notificationMessage: null,
    notificationType: null,
    ...overrides,
  };
}

function makeState(agents: Map<string, AgentNode>) {
  return {
    agents,
    activeMessages: [],
    focusedAgentId: null,
    updateAnimations: () => {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SceneBridge notification wiring', () => {
  let sceneMgr: MockSceneManager;
  let toolAnims: MockToolAnimationManager;
  let bridge: SceneBridge;

  beforeEach(() => {
    sceneMgr = new MockSceneManager();
    toolAnims = new MockToolAnimationManager();
    // Cast mocks to satisfy the constructor — we only test notification logic
    bridge = new SceneBridge(sceneMgr as any, toolAnims as any);
  });

  test('calls showNotification when status changes TO waiting', () => {
    const agents1 = new Map<string, AgentNode>();
    agents1.set('agent-1', makeAgent({ status: 'active' }));
    bridge.sync(makeState(agents1) as any);

    // Transition to waiting
    const agents2 = new Map<string, AgentNode>();
    agents2.set('agent-1', makeAgent({
      status: 'waiting',
      notificationType: 'notification',
      notificationMessage: 'Needs input',
    }));
    bridge.sync(makeState(agents2) as any);

    expect(sceneMgr.deskManager.showNotificationCalls.length).toBe(1);
    expect(sceneMgr.deskManager.showNotificationCalls[0]).toEqual({
      agentId: 'agent-1',
      type: 'notification',
      message: 'Needs input',
    });
  });

  test('calls showNotification with permission_request type', () => {
    const agents1 = new Map<string, AgentNode>();
    agents1.set('agent-1', makeAgent({ status: 'active' }));
    bridge.sync(makeState(agents1) as any);

    const agents2 = new Map<string, AgentNode>();
    agents2.set('agent-1', makeAgent({
      status: 'waiting',
      notificationType: 'permission_request',
      notificationMessage: 'Permission Required',
    }));
    bridge.sync(makeState(agents2) as any);

    expect(sceneMgr.deskManager.showNotificationCalls[0].type).toBe('permission_request');
  });

  test('calls hideNotification when status changes FROM waiting', () => {
    // Start in waiting
    const agents1 = new Map<string, AgentNode>();
    agents1.set('agent-1', makeAgent({
      status: 'waiting',
      notificationType: 'notification',
      notificationMessage: 'Needs input',
    }));
    bridge.sync(makeState(agents1) as any);

    // Transition to active
    const agents2 = new Map<string, AgentNode>();
    agents2.set('agent-1', makeAgent({ status: 'active' }));
    bridge.sync(makeState(agents2) as any);

    expect(sceneMgr.deskManager.hideNotificationCalls.length).toBe(1);
    expect(sceneMgr.deskManager.hideNotificationCalls[0]).toBe('agent-1');
  });

  test('shows notification on new agent spawn with status already waiting (history replay)', () => {
    const agents = new Map<string, AgentNode>();
    agents.set('agent-1', makeAgent({
      status: 'waiting',
      notificationType: 'notification',
      notificationMessage: 'Waiting for user',
    }));
    bridge.sync(makeState(agents) as any);

    expect(sceneMgr.deskManager.showNotificationCalls.length).toBe(1);
    expect(sceneMgr.deskManager.showNotificationCalls[0]).toEqual({
      agentId: 'agent-1',
      type: 'notification',
      message: 'Waiting for user',
    });
  });

  test('does NOT call showNotification when status remains waiting (no change)', () => {
    const agents1 = new Map<string, AgentNode>();
    agents1.set('agent-1', makeAgent({
      status: 'waiting',
      notificationType: 'notification',
      notificationMessage: 'Waiting',
    }));
    bridge.sync(makeState(agents1) as any);

    // Sync again with same status
    const agents2 = new Map<string, AgentNode>();
    agents2.set('agent-1', makeAgent({
      status: 'waiting',
      notificationType: 'notification',
      notificationMessage: 'Waiting',
    }));
    bridge.sync(makeState(agents2) as any);

    // Only one call from the initial spawn, not a second one
    expect(sceneMgr.deskManager.showNotificationCalls.length).toBe(1);
  });

  test('does NOT call hideNotification when agent is despawned (removed from map)', () => {
    const agents1 = new Map<string, AgentNode>();
    agents1.set('agent-1', makeAgent({
      status: 'waiting',
      notificationType: 'notification',
      notificationMessage: 'Waiting',
    }));
    bridge.sync(makeState(agents1) as any);

    // Remove agent entirely
    const agents2 = new Map<string, AgentNode>();
    bridge.sync(makeState(agents2) as any);

    // hideNotification should NOT be called — desk removal handles cleanup
    expect(sceneMgr.deskManager.hideNotificationCalls.length).toBe(0);
  });

  test('handles null notificationType gracefully when transitioning to waiting', () => {
    const agents1 = new Map<string, AgentNode>();
    agents1.set('agent-1', makeAgent({ status: 'active' }));
    bridge.sync(makeState(agents1) as any);

    const agents2 = new Map<string, AgentNode>();
    agents2.set('agent-1', makeAgent({
      status: 'waiting',
      notificationType: null,
      notificationMessage: null,
    }));
    bridge.sync(makeState(agents2) as any);

    // Should still call showNotification with fallback values
    expect(sceneMgr.deskManager.showNotificationCalls.length).toBe(1);
  });
});
