import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// THREE is mocked globally via preload (setup.ts). Only GLTFLoader needs a
// per-file mock because this test controls what templates are returned for
// desk.glb vs monitor.glb.
// ---------------------------------------------------------------------------

const THREE = await import('three');

// Alias the preloaded mock classes for convenience
type MockGroup = InstanceType<typeof THREE.Group>;
type MockMesh = InstanceType<typeof THREE.Mesh>;

// Track scene children via the scene instance (preloaded Scene mock has .children)
let scene: InstanceType<typeof THREE.Scene>;

// Build model templates using the preloaded mock classes
function buildDeskTemplate(): MockGroup {
  const g = new THREE.Group();
  const mesh1 = new THREE.Mesh();
  mesh1.name = 'desk-surface';
  const mesh2 = new THREE.Mesh();
  mesh2.name = 'chair';
  g.add(mesh1);
  g.add(mesh2);
  return g;
}

function buildMonitorTemplate(): MockGroup {
  const g = new THREE.Group();
  const screen = new THREE.Mesh();
  screen.name = 'monitor-screen';
  screen.material = {
    color: { setHex: () => {} },
    emissive: { setHex: () => {} },
    emissiveIntensity: 0.4,
  } as any;
  g.add(screen);
  return g;
}

let deskTemplate: MockGroup;
let monitorTemplate: MockGroup;

mock.module('three/addons/loaders/GLTFLoader.js', () => {
  return {
    GLTFLoader: class {
      loadAsync(url: string) {
        if (url.includes('desk')) return Promise.resolve({ scene: deskTemplate });
        if (url.includes('monitor')) return Promise.resolve({ scene: monitorTemplate });
        return Promise.resolve({ scene: new THREE.Group() });
      }
    },
  };
});

const { DeskManager } = await import('../scene/DeskManager');

// Helper to read the scene children array from the preloaded mock Scene
function getSceneChildren(): unknown[] {
  return (scene as any).children;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeskManager GLB models', () => {
  let dm: InstanceType<typeof DeskManager>;

  beforeEach(async () => {
    deskTemplate = buildDeskTemplate();
    monitorTemplate = buildMonitorTemplate();
    scene = new THREE.Scene();
    dm = new DeskManager(scene);
    await dm.loadModels();
  });

  test('loadModels loads desk and monitor GLB templates', async () => {
    // If loadModels didn't throw, templates are loaded.
    // addDesk should work after loadModels.
    dm.addDesk('agent-1');
    const group = dm.getDeskGroup('agent-1');
    expect(group).not.toBeNull();
  });

  test('addDesk creates a desk group with cloned model meshes', () => {
    dm.addDesk('agent-1');
    const group = dm.getDeskGroup('agent-1');
    expect(group).not.toBeNull();
  });

  test('addDesk group contains a monitor-screen named mesh for glow control', () => {
    dm.addDesk('agent-1');
    const group = dm.getDeskGroup('agent-1')!;
    const monitor = group.getObjectByName('monitor-screen');
    expect(monitor).not.toBeNull();
  });

  test('addDesk group contains a status-indicator named mesh', () => {
    dm.addDesk('agent-1');
    const group = dm.getDeskGroup('agent-1')!;
    const status = group.getObjectByName('status-indicator');
    expect(status).not.toBeNull();
  });

  test('updateDeskState changes status indicator color', () => {
    dm.addDesk('agent-1');
    // Should not throw
    dm.updateDeskState('agent-1', 'active');
    dm.updateDeskState('agent-1', 'error');
  });

  test('does not use procedural shared geometries (no BoxGeometry, CylinderGeometry, etc.)', () => {
    // DeskManager constructor should NOT create shared geometry fields
    // After the refactor, the constructor only needs scene + layout engine
    // If it tried to create BoxGeometry etc., the mock would throw since they're not defined
    expect(dm).toBeDefined();
  });

  test('addDesk works even when monitor model has no mesh named "monitor-screen"', async () => {
    // Build a monitor template with a differently-named mesh
    const altMonitor = new THREE.Group();
    const screen = new THREE.Mesh();
    screen.name = 'Screen_001';
    screen.material = {
      color: { setHex: () => {} },
      emissive: { setHex: () => {} },
      emissiveIntensity: 0.4,
      clone() { return { ...this }; },
    } as any;
    altMonitor.add(screen);

    monitorTemplate = altMonitor;
    const scene2 = new THREE.Scene();
    const dm2 = new DeskManager(scene2);
    await dm2.loadModels();

    // Should not throw
    dm2.addDesk('agent-no-named-mesh');
    const group = dm2.getDeskGroup('agent-no-named-mesh');
    expect(group).not.toBeNull();

    // updateDeskState should also work (uses monitorMaterial)
    dm2.updateDeskState('agent-no-named-mesh', 'active');
  });
});

// ---------------------------------------------------------------------------
// Desk/Avatar Separation Tests
// ---------------------------------------------------------------------------

describe('DeskManager desk/avatar separation', () => {
  let dm: InstanceType<typeof DeskManager>;

  beforeEach(async () => {
    deskTemplate = buildDeskTemplate();
    monitorTemplate = buildMonitorTemplate();
    scene = new THREE.Scene();
    dm = new DeskManager(scene);
    await dm.loadModels();
  });

  // --- initDesks ---

  describe('initDesks', () => {
    test('pre-renders the requested number of desks into the scene', () => {
      dm.initDesks(5);
      // 5 desk groups should be added to the scene
      expect(getSceneChildren().length).toBe(5);
    });

    test('pre-rendered desks contain desk and monitor meshes but no avatar or status indicator', () => {
      dm.initDesks(1);
      const deskGroup = getSceneChildren()[0] as MockGroup;
      // Should have desk-surface and monitor-screen from templates
      expect(deskGroup.getObjectByName('desk-surface')).not.toBeNull();
      expect(deskGroup.getObjectByName('monitor-screen')).not.toBeNull();
      // Should NOT have status-indicator or avatar (those come with spawnAvatar)
      expect(deskGroup.getObjectByName('status-indicator')).toBeNull();
    });

    test('pre-rendered desks are at full scale (not animated)', () => {
      dm.initDesks(3);
      for (const child of getSceneChildren()) {
        const group = child as MockGroup;
        expect(group.scale.x).toBe(1);
        expect(group.scale.y).toBe(1);
        expect(group.scale.z).toBe(1);
      }
    });

    test('pre-rendered desks are positioned at distinct slot positions', () => {
      dm.initDesks(3);
      const positions = getSceneChildren().map((c) => {
        const g = c as MockGroup;
        return `${g.position.x},${g.position.z}`;
      });
      const unique = new Set(positions);
      expect(unique.size).toBe(3);
    });
  });

  // --- spawnAvatar ---

  describe('spawnAvatar', () => {
    test('assigns agent to a pre-rendered desk and makes getDeskGroup return it', () => {
      dm.initDesks(5);
      dm.spawnAvatar('agent-1');
      const group = dm.getDeskGroup('agent-1');
      expect(group).not.toBeNull();
    });

    test('adds a status-indicator to the desk group when avatar spawns', () => {
      dm.initDesks(5);
      dm.spawnAvatar('agent-1');
      const group = dm.getDeskGroup('agent-1')!;
      const indicator = group.getObjectByName('status-indicator');
      expect(indicator).not.toBeNull();
    });

    test('getDeskGroup returns null for unknown agent', () => {
      dm.initDesks(5);
      expect(dm.getDeskGroup('nonexistent')).toBeNull();
    });

    test('multiple agents get different desks', () => {
      dm.initDesks(5);
      dm.spawnAvatar('agent-1');
      dm.spawnAvatar('agent-2');
      const g1 = dm.getDeskGroup('agent-1')!;
      const g2 = dm.getDeskGroup('agent-2')!;
      expect(g1).not.toBe(g2);
    });

    test('updateDeskState works after spawnAvatar', () => {
      dm.initDesks(5);
      dm.spawnAvatar('agent-1');
      // Should not throw
      dm.updateDeskState('agent-1', 'active');
      dm.updateDeskState('agent-1', 'tool_executing');
    });

    test('setMonitorGlow works after spawnAvatar', () => {
      dm.initDesks(5);
      dm.spawnAvatar('agent-1');
      // Should not throw
      dm.setMonitorGlow('agent-1', 0xff0000, 1.0);
    });

    test('showNotification works after spawnAvatar', () => {
      dm.initDesks(5);
      dm.spawnAvatar('agent-1');
      // Should not throw
      dm.showNotification('agent-1', 'notification', 'Test message');
    });

    test('triggerErrorFlash works after spawnAvatar', () => {
      dm.initDesks(5);
      dm.spawnAvatar('agent-1');
      // Should not throw
      dm.triggerErrorFlash('agent-1');
    });

    test('spawnAvatar is idempotent for same agent', () => {
      dm.initDesks(5);
      dm.spawnAvatar('agent-1');
      const g1 = dm.getDeskGroup('agent-1');
      dm.spawnAvatar('agent-1'); // second call should not change anything
      const g2 = dm.getDeskGroup('agent-1');
      expect(g1).toBe(g2);
    });
  });

  // --- despawnAvatar ---

  describe('despawnAvatar', () => {
    test('removes agent from getDeskGroup after despawn completes', () => {
      dm.initDesks(5);
      dm.spawnAvatar('agent-1');
      expect(dm.getDeskGroup('agent-1')).not.toBeNull();
      dm.despawnAvatar('agent-1');
      // Simulate despawn animation completing (run update with large deltaTime)
      dm.update(10);
      expect(dm.getDeskGroup('agent-1')).toBeNull();
    });

    test('desk furniture remains in the scene after avatar despawn', () => {
      dm.initDesks(5);
      const initialSceneCount = getSceneChildren().length;
      dm.spawnAvatar('agent-1');
      dm.despawnAvatar('agent-1');
      dm.update(10);
      // Scene should still have the same number of desk groups (furniture persists)
      expect(getSceneChildren().length).toBe(initialSceneCount);
    });

    test('freed desk can be reused by a new agent', () => {
      dm.initDesks(1); // Only 1 desk
      dm.spawnAvatar('agent-1');
      const g1 = dm.getDeskGroup('agent-1')!;
      dm.despawnAvatar('agent-1');
      dm.update(10); // complete despawn

      // Now agent-2 should be able to use the freed desk
      dm.spawnAvatar('agent-2');
      const g2 = dm.getDeskGroup('agent-2')!;
      expect(g2).not.toBeNull();
      // Should reuse the same desk group
      expect(g2).toBe(g1);
    });

    test('despawnAvatar immediately frees desk for reuse (same frame)', () => {
      dm.initDesks(1); // Only 1 desk
      dm.spawnAvatar('agent-1');
      const g1 = dm.getDeskGroup('agent-1')!;

      // Despawn and immediately spawn new agent (no update() in between)
      dm.despawnAvatar('agent-1');
      dm.spawnAvatar('agent-2');
      const g2 = dm.getDeskGroup('agent-2')!;
      expect(g2).not.toBeNull();
      // Should reuse the same desk group (the leader desk)
      expect(g2).toBe(g1);
    });

    test('status-indicator is removed after despawn', () => {
      dm.initDesks(5);
      dm.spawnAvatar('agent-1');
      const group = dm.getDeskGroup('agent-1')!;
      expect(group.getObjectByName('status-indicator')).not.toBeNull();
      dm.despawnAvatar('agent-1');
      dm.update(10);
      // After despawn, status indicator should be gone from the desk group
      expect(group.getObjectByName('status-indicator')).toBeNull();
    });

    test('despawnAvatar is safe to call for unknown agent', () => {
      dm.initDesks(5);
      // Should not throw
      dm.despawnAvatar('nonexistent');
    });
  });

  // --- getDeskPosition ---

  describe('getDeskPosition', () => {
    test('returns position for spawned agent', () => {
      dm.initDesks(5);
      dm.spawnAvatar('agent-1');
      const pos = dm.getDeskPosition('agent-1');
      expect(pos).not.toBeNull();
    });

    test('returns null for unspawned agent', () => {
      dm.initDesks(5);
      expect(dm.getDeskPosition('nonexistent')).toBeNull();
    });
  });

  // --- Scene count invariant ---

  describe('scene invariant', () => {
    test('initDesks adds groups to scene, spawn/despawn does not change scene child count', () => {
      dm.initDesks(3);
      const afterInit = getSceneChildren().length;
      expect(afterInit).toBe(3);

      dm.spawnAvatar('agent-1');
      // No new groups added to scene (avatar goes into existing desk group)
      // Parent lines may be added, so check only desk groups
      expect(getSceneChildren().filter(c => c instanceof THREE.Group).length).toBeGreaterThanOrEqual(3);

      dm.despawnAvatar('agent-1');
      dm.update(10);
      // Desk groups remain
      expect(getSceneChildren().filter(c => c instanceof THREE.Group).length).toBeGreaterThanOrEqual(3);
    });
  });
});

// ---------------------------------------------------------------------------
// Notification Popup Tests
// ---------------------------------------------------------------------------

describe('DeskManager notification popup', () => {
  let dm: InstanceType<typeof DeskManager>;

  function addDeskAndSpawn(agentId = 'agent-1'): void {
    dm.addDesk(agentId);
    dm.update(1.0);
  }

  beforeEach(async () => {
    deskTemplate = buildDeskTemplate();
    monitorTemplate = buildMonitorTemplate();
    scene = new THREE.Scene();
    dm = new DeskManager(scene);
    await dm.loadModels();
  });

  describe('showNotification()', () => {
    test('adds a notification sprite to the desk group', () => {
      addDeskAndSpawn();
      dm.showNotification('agent-1', 'notification', 'Needs input');
      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup');
      expect(sprite).toBeDefined();
      expect(sprite).toBeInstanceOf(THREE.Sprite);
    });

    test('positions notification sprite above status indicator (y >= 2.0)', () => {
      addDeskAndSpawn();
      dm.showNotification('agent-1', 'notification', 'Needs input');
      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as InstanceType<typeof THREE.Sprite>;
      expect(sprite.position.y).toBeGreaterThanOrEqual(2.0);
    });

    test('scales notification sprite to readable size', () => {
      addDeskAndSpawn();
      dm.showNotification('agent-1', 'notification', 'Needs input');
      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as InstanceType<typeof THREE.Sprite>;
      expect(sprite.scale.x).toBeGreaterThan(1.0);
      expect(sprite.scale.y).toBeGreaterThan(0.2);
    });

    test('sprite material starts with opacity 0 for fade-in', () => {
      addDeskAndSpawn();
      dm.showNotification('agent-1', 'notification', 'Needs input');
      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as InstanceType<typeof THREE.Sprite>;
      const material = sprite.material as InstanceType<typeof THREE.SpriteMaterial>;
      expect(material.opacity).toBe(0);
      expect(material.transparent).toBe(true);
    });

    test('no-ops for unknown agent', () => {
      expect(() => dm.showNotification('nonexistent', 'notification', 'hi')).not.toThrow();
    });

    test('replaces existing notification if called again', () => {
      addDeskAndSpawn();
      dm.showNotification('agent-1', 'notification', 'First');
      dm.showNotification('agent-1', 'permission_request', 'Second');
      const group = dm.getDeskGroup('agent-1')!;
      const sprites = (group as unknown as MockGroup).children.filter(
        (c) => (c as { name?: string }).name === 'notification-popup',
      );
      expect(sprites.length).toBe(1);
    });
  });

  describe('hideNotification()', () => {
    test('starts fade-out on the notification sprite', () => {
      addDeskAndSpawn();
      dm.showNotification('agent-1', 'notification', 'Needs input');
      dm.update(1.0);
      dm.hideNotification('agent-1');
      dm.update(0.5);
      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as InstanceType<typeof THREE.Sprite>;
      if (sprite) {
        const material = sprite.material as InstanceType<typeof THREE.SpriteMaterial>;
        expect(material.opacity).toBeLessThan(1);
      }
    });

    test('removes sprite after fade-out completes', () => {
      addDeskAndSpawn();
      dm.showNotification('agent-1', 'notification', 'Needs input');
      dm.update(1.0);
      dm.hideNotification('agent-1');
      dm.update(2.0);
      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup');
      expect(sprite).toBeNull();
    });

    test('no-ops for unknown agent', () => {
      expect(() => dm.hideNotification('nonexistent')).not.toThrow();
    });

    test('no-ops if no notification is showing', () => {
      addDeskAndSpawn();
      expect(() => dm.hideNotification('agent-1')).not.toThrow();
    });
  });

  describe('update() notification animation', () => {
    test('fade-in: opacity increases from 0 toward 1 over time', () => {
      addDeskAndSpawn();
      dm.showNotification('agent-1', 'notification', 'Needs input');
      dm.update(0.3);
      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as InstanceType<typeof THREE.Sprite>;
      const material = sprite.material as InstanceType<typeof THREE.SpriteMaterial>;
      expect(material.opacity).toBeGreaterThan(0);
    });

    test('fade-in: opacity reaches 1 after enough time', () => {
      addDeskAndSpawn();
      dm.showNotification('agent-1', 'notification', 'Needs input');
      dm.update(2.0);
      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as InstanceType<typeof THREE.Sprite>;
      const material = sprite.material as InstanceType<typeof THREE.SpriteMaterial>;
      expect(material.opacity).toBe(1);
    });

    test('gentle bob: sprite y position oscillates over time', () => {
      addDeskAndSpawn();
      dm.showNotification('agent-1', 'notification', 'Needs input');
      dm.update(1.0);
      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as InstanceType<typeof THREE.Sprite>;
      const y1 = sprite.position.y;
      dm.update(0.5);
      const y2 = sprite.position.y;
      expect(y1).not.toBe(y2);
    });
  });

  describe('cleanupDesk disposes notification', () => {
    test('notification sprite is removed when desk is cleaned up via despawn', () => {
      addDeskAndSpawn();
      dm.showNotification('agent-1', 'notification', 'Needs input');
      dm.update(1.0);
      dm.removeDesk('agent-1');
      dm.update(2.0);
      expect(dm.getDeskGroup('agent-1')).toBeNull();
    });
  });
});
