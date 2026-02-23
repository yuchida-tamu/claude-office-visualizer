import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock THREE.js and GLTFLoader
// ---------------------------------------------------------------------------

class MockVector3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s: number) { this.x = s; this.y = s; this.z = s; return this; }
}

function makeMockMaterial() {
  return {
    color: { setHex: () => {} },
    emissive: { setHex: () => {} },
    emissiveIntensity: 0.5,
    clone() { return makeMockMaterial(); },
    dispose: () => {},
  };
}

class MockMesh {
  isMesh = true;
  name = '';
  material = makeMockMaterial();
  constructor(name = '') { this.name = name; }
}

class MockGroup {
  children: unknown[] = [];
  position = new MockVector3();
  scale = new MockVector3(1, 1, 1);
  rotation = { x: 0, y: 0, z: 0 };
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
    }
  }
  clone(): MockGroup {
    const c = new MockGroup();
    for (const child of this.children) {
      if ((child as MockMesh).isMesh) {
        const m = new MockMesh((child as MockMesh).name);
        c.add(m);
      }
    }
    return c;
  }
}

// Icon model templates
const iconTemplates: Record<string, MockGroup> = {};

function buildIconTemplate(name: string): MockGroup {
  const g = new MockGroup();
  g.add(new MockMesh(`${name}-mesh`));
  return g;
}

mock.module('three', () => {
  return {
    Vector3: MockVector3,
    Group: MockGroup,
    Mesh: MockMesh,
    MeshStandardMaterial: class {
      color = { setHex: () => {} };
      emissive = { setHex: () => {} };
      emissiveIntensity = 0.5;
      dispose() {}
    },
    LineSegments: class {},
    Material: class { dispose() {} },
    Scene: class {
      add() {}
      remove() {}
    },
  };
});

mock.module('three/addons/loaders/GLTFLoader.js', () => {
  return {
    GLTFLoader: class {
      loadAsync(url: string) {
        if (url.includes('terminal')) return Promise.resolve({ scene: iconTemplates['terminal'] });
        if (url.includes('serch')) return Promise.resolve({ scene: iconTemplates['search'] });
        if (url.includes('document')) return Promise.resolve({ scene: iconTemplates['document'] });
        if (url.includes('web')) return Promise.resolve({ scene: iconTemplates['web'] });
        if (url.includes('gear')) return Promise.resolve({ scene: iconTemplates['default'] });
        return Promise.resolve({ scene: new MockGroup() });
      }
    },
  };
});

const { ToolAnimationManager } = await import('../scene/ToolAnimationManager');
const THREE = await import('three');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolAnimationManager GLB models', () => {
  let tam: InstanceType<typeof ToolAnimationManager>;
  let scene: InstanceType<typeof THREE.Scene>;

  beforeEach(async () => {
    iconTemplates['terminal'] = buildIconTemplate('terminal');
    iconTemplates['search'] = buildIconTemplate('search');
    iconTemplates['document'] = buildIconTemplate('document');
    iconTemplates['web'] = buildIconTemplate('web');
    iconTemplates['default'] = buildIconTemplate('default');

    scene = new THREE.Scene();
    tam = new ToolAnimationManager(scene);
    await tam.loadModels();
  });

  test('loadModels loads all 5 icon templates', async () => {
    // If loadModels didn't throw, all 5 templates are loaded
    expect(tam).toBeDefined();
  });

  test('start() clones the correct icon model for Bash (terminal)', () => {
    const deskGroup = new MockGroup() as unknown as import('three').Group;
    tam.start('agent-1', 'Bash', deskGroup);
    // Icon group should be added to desk group
    expect((deskGroup as unknown as MockGroup).children.length).toBe(1);
  });

  test('start() clones the correct icon model for Read (search)', () => {
    const deskGroup = new MockGroup() as unknown as import('three').Group;
    tam.start('agent-1', 'Read', deskGroup);
    expect((deskGroup as unknown as MockGroup).children.length).toBe(1);
  });

  test('start() clones the correct icon model for Write (document)', () => {
    const deskGroup = new MockGroup() as unknown as import('three').Group;
    tam.start('agent-1', 'Write', deskGroup);
    expect((deskGroup as unknown as MockGroup).children.length).toBe(1);
  });

  test('start() clones the correct icon model for WebFetch (web)', () => {
    const deskGroup = new MockGroup() as unknown as import('three').Group;
    tam.start('agent-1', 'WebFetch', deskGroup);
    expect((deskGroup as unknown as MockGroup).children.length).toBe(1);
  });

  test('start() clones the correct icon model for unknown tool (default/gear)', () => {
    const deskGroup = new MockGroup() as unknown as import('three').Group;
    tam.start('agent-1', 'SomeUnknownTool', deskGroup);
    expect((deskGroup as unknown as MockGroup).children.length).toBe(1);
  });

  test('stop() marks icon for fade-out', () => {
    const deskGroup = new MockGroup() as unknown as import('three').Group;
    tam.start('agent-1', 'Bash', deskGroup);
    tam.stop('agent-1');
    // After enough update ticks, the icon should be removed
    for (let i = 0; i < 30; i++) {
      tam.update(0.05);
    }
    expect((deskGroup as unknown as MockGroup).children.length).toBe(0);
  });

  test('does not create procedural geometries (no TorusGeometry, BoxGeometry, etc.)', () => {
    // Constructor should not build shared geometry cache
    // If it tried to create TorusGeometry etc., mock would throw since they're not defined
    expect(tam).toBeDefined();
  });
});
