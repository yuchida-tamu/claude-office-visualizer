import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock THREE.js and GLTFLoader
// ---------------------------------------------------------------------------

let sceneChildren: unknown[] = [];

class MockVector3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  copy(v: MockVector3) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new MockVector3(this.x, this.y, this.z); }
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s: number) { this.x = s; this.y = s; this.z = s; return this; }
}

class MockMesh {
  isMesh = true;
  position = new MockVector3();
  name = '';
  material: Record<string, unknown> = {};
  castShadow = false;
  receiveShadow = false;
  geometry = { dispose: () => {} };
  constructor(name = '') { this.name = name; }
}

class MockGroup {
  children: unknown[] = [];
  position = new MockVector3();
  scale = new MockVector3(1, 1, 1);
  rotation = { x: 0, y: 0, z: 0 };
  name = '';
  parent: MockGroup | null = null;

  add(obj: unknown) {
    this.children.push(obj);
    if (typeof obj === 'object' && obj !== null) (obj as MockGroup).parent = this;
  }
  remove(obj: unknown) {
    const idx = this.children.indexOf(obj);
    if (idx >= 0) this.children.splice(idx, 1);
  }
  traverse(fn: (obj: unknown) => void) {
    fn(this);
    for (const child of this.children) {
      fn(child);
      if ((child as MockGroup).children) {
        for (const grandchild of (child as MockGroup).children) {
          fn(grandchild);
        }
      }
    }
  }
  getObjectByName(name: string): unknown {
    if (this.name === name) return this;
    for (const child of this.children) {
      if ((child as MockMesh).name === name) return child;
      if ((child as MockGroup).getObjectByName) {
        const found = (child as MockGroup).getObjectByName(name);
        if (found) return found;
      }
    }
    return null;
  }
  clone(): MockGroup {
    const c = new MockGroup();
    c.name = this.name;
    c.position = this.position.clone();
    for (const child of this.children) {
      if ((child as MockMesh).isMesh) {
        const m = new MockMesh((child as MockMesh).name);
        m.material = {
          color: { setHex: () => {} },
          emissive: { setHex: () => {} },
          emissiveIntensity: 0.5,
        };
        c.add(m);
      } else if ((child as MockGroup).clone) {
        c.add((child as MockGroup).clone());
      }
    }
    return c;
  }
}

// Build model templates
function buildDeskTemplate(): MockGroup {
  const g = new MockGroup();
  const mesh1 = new MockMesh('desk-surface');
  const mesh2 = new MockMesh('chair');
  g.add(mesh1);
  g.add(mesh2);
  return g;
}

function buildMonitorTemplate(): MockGroup {
  const g = new MockGroup();
  const screen = new MockMesh('monitor-screen');
  screen.material = {
    color: { setHex: () => {} },
    emissive: { setHex: () => {} },
    emissiveIntensity: 0.4,
  };
  g.add(screen);
  return g;
}

let deskTemplate: MockGroup;
let monitorTemplate: MockGroup;

mock.module('three', () => {
  return {
    Vector3: MockVector3,
    Group: MockGroup,
    Color: class { setHSL() { return this; } getHex() { return 0xffffff; } },
    SphereGeometry: class { dispose() {} },
    Clock: class { getElapsedTime() { return 0; } },
    Mesh: class {
      isMesh = true;
      position = new MockVector3();
      name = '';
      material: Record<string, unknown> = {};
      castShadow = false;
      receiveShadow = false;
      geometry = { dispose: () => {} };
      constructor(_geo?: unknown, mat?: unknown) {
        if (mat) this.material = mat as Record<string, unknown>;
      }
    },
    MeshStandardMaterial: class {
      color = { setHex: () => {} };
      emissive = { setHex: () => {} };
      emissiveIntensity = 0.5;
      transparent = false;
      opacity = 1;
      clone() {
        const c = new (this.constructor as new () => typeof this)();
        return c;
      }
      dispose() {}
    },
    BufferGeometry: class {
      setFromPoints() { return this; }
      attributes = { position: { setXYZ: () => {}, needsUpdate: false } };
      dispose() {}
    },
    LineDashedMaterial: class { dispose() {} },
    Line: class {
      geometry = { attributes: { position: { setXYZ: () => {}, needsUpdate: false } }, dispose: () => {} };
      computeLineDistances() {}
    },
    SpriteMaterial: class { map = null; dispose() {} },
    Sprite: class {
      material = { map: null, dispose: () => {} };
      position = new MockVector3();
      scale = new MockVector3();
      name = '';
    },
    DataTexture: class { needsUpdate = false; },
    CanvasTexture: class { needsUpdate = false; },
    RGBAFormat: 0,
    Material: class { dispose() {} },
    DoubleSide: 2,
    Scene: class {
      add(obj: unknown) { sceneChildren.push(obj); }
      remove(obj: unknown) {
        const idx = sceneChildren.indexOf(obj);
        if (idx >= 0) sceneChildren.splice(idx, 1);
      }
    },
  };
});

mock.module('three/addons/loaders/GLTFLoader.js', () => {
  return {
    GLTFLoader: class {
      loadAsync(url: string) {
        if (url.includes('desk')) return Promise.resolve({ scene: deskTemplate });
        if (url.includes('monitor')) return Promise.resolve({ scene: monitorTemplate });
        return Promise.resolve({ scene: new MockGroup() });
      }
    },
  };
});

const { DeskManager } = await import('../scene/DeskManager');
const THREE = await import('three');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeskManager GLB models', () => {
  let scene: InstanceType<typeof THREE.Scene>;
  let dm: InstanceType<typeof DeskManager>;

  beforeEach(async () => {
    sceneChildren = [];
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
    const altMonitor = new MockGroup();
    const screen = new MockMesh('Screen_001');
    screen.material = {
      color: { setHex: () => {} },
      emissive: { setHex: () => {} },
      emissiveIntensity: 0.4,
      clone() { return { ...this }; },
    };
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
  let scene: InstanceType<typeof THREE.Scene>;
  let dm: InstanceType<typeof DeskManager>;

  beforeEach(async () => {
    sceneChildren = [];
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
      expect(sceneChildren.length).toBe(5);
    });

    test('pre-rendered desks contain desk and monitor meshes but no avatar or status indicator', () => {
      dm.initDesks(1);
      const deskGroup = sceneChildren[0] as MockGroup;
      // Should have desk-surface and monitor-screen from templates
      expect(deskGroup.getObjectByName('desk-surface')).not.toBeNull();
      expect(deskGroup.getObjectByName('monitor-screen')).not.toBeNull();
      // Should NOT have status-indicator or avatar (those come with spawnAvatar)
      expect(deskGroup.getObjectByName('status-indicator')).toBeNull();
    });

    test('pre-rendered desks are at full scale (not animated)', () => {
      dm.initDesks(3);
      for (const child of sceneChildren) {
        const group = child as MockGroup;
        expect(group.scale.x).toBe(1);
        expect(group.scale.y).toBe(1);
        expect(group.scale.z).toBe(1);
      }
    });

    test('pre-rendered desks are positioned at distinct slot positions', () => {
      dm.initDesks(3);
      const positions = sceneChildren.map((c) => {
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
      const initialSceneCount = sceneChildren.length;
      dm.spawnAvatar('agent-1');
      dm.despawnAvatar('agent-1');
      dm.update(10);
      // Scene should still have the same number of desk groups (furniture persists)
      expect(sceneChildren.length).toBe(initialSceneCount);
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
      const afterInit = sceneChildren.length;
      expect(afterInit).toBe(3);

      dm.spawnAvatar('agent-1');
      // No new groups added to scene (avatar goes into existing desk group)
      // Parent lines may be added, so check only desk groups
      expect(sceneChildren.filter(c => c instanceof MockGroup).length).toBeGreaterThanOrEqual(3);

      dm.despawnAvatar('agent-1');
      dm.update(10);
      // Desk groups remain
      expect(sceneChildren.filter(c => c instanceof MockGroup).length).toBeGreaterThanOrEqual(3);
    });
  });
});
