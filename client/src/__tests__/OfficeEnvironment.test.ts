import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Mock THREE.js and GLTFLoader
// ---------------------------------------------------------------------------

// Track what gets added to the scene
let sceneChildren: unknown[] = [];
let disposeCallCount = 0;

// Mock mesh for traversal
class MockMesh {
  isMesh = true;
  receiveShadow = false;
  castShadow = false;
  geometry = { dispose: () => { disposeCallCount++; } };
  material = { dispose: () => { disposeCallCount++; } };
}

class MockGroup {
  children: unknown[] = [];
  traverse(fn: (obj: unknown) => void) {
    fn(this);
    for (const child of this.children) {
      fn(child);
    }
  }
  removeFromParent() {}
}

// The loaded model scene
let mockModelScene: MockGroup;

mock.module('three', () => {
  const AmbientLight = class {
    constructor(public color: number, public intensity: number) {}
  };
  const DirectionalLight = class {
    position = { set: () => {} };
    castShadow = false;
    shadow = {
      mapSize: { width: 0, height: 0 },
      camera: { near: 0, far: 0, left: 0, right: 0, top: 0, bottom: 0 },
      bias: 0,
    };
    constructor(public color: number, public intensity: number) {}
  };
  const HemisphereLight = class {
    constructor(public skyColor: number, public groundColor: number, public intensity: number) {}
  };

  return {
    Scene: class {
      add(obj: unknown) { sceneChildren.push(obj); }
      remove(obj: unknown) {
        const idx = sceneChildren.indexOf(obj);
        if (idx >= 0) sceneChildren.splice(idx, 1);
      }
    },
    AmbientLight,
    DirectionalLight,
    HemisphereLight,
  };
});

mock.module('three/addons/loaders/GLTFLoader.js', () => {
  return {
    GLTFLoader: class {
      loadAsync(url: string) {
        return Promise.resolve({ scene: mockModelScene });
      }
    },
  };
});

// Must import after mocks are registered
const { OfficeEnvironment } = await import('../scene/OfficeEnvironment');
const THREE = await import('three');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OfficeEnvironment', () => {
  let scene: InstanceType<typeof THREE.Scene>;
  let env: InstanceType<typeof OfficeEnvironment>;

  beforeEach(() => {
    sceneChildren = [];
    disposeCallCount = 0;

    // Create a mock model with 2 meshes
    mockModelScene = new MockGroup();
    const mesh1 = new MockMesh();
    const mesh2 = new MockMesh();
    mockModelScene.children = [mesh1, mesh2];

    scene = new THREE.Scene();
    env = new OfficeEnvironment(scene);
  });

  test('init loads the GLB model and adds it to the scene', async () => {
    await env.init();

    // Should have the model scene + 3 lights = 4 objects added
    const hasModel = sceneChildren.some((c) => c === mockModelScene);
    expect(hasModel).toBe(true);
  });

  test('init enables shadows on all meshes in the loaded model', async () => {
    await env.init();

    const mesh1 = mockModelScene.children[0] as MockMesh;
    const mesh2 = mockModelScene.children[1] as MockMesh;
    expect(mesh1.receiveShadow).toBe(true);
    expect(mesh1.castShadow).toBe(true);
    expect(mesh2.receiveShadow).toBe(true);
    expect(mesh2.castShadow).toBe(true);
  });

  test('init creates 3 lights (ambient, directional, hemisphere)', async () => {
    await env.init();

    const lights = sceneChildren.filter(
      (c) =>
        c instanceof THREE.AmbientLight ||
        c instanceof THREE.DirectionalLight ||
        c instanceof THREE.HemisphereLight,
    );
    expect(lights.length).toBe(3);
  });

  test('does not create procedural floor, grid, or wall geometry', async () => {
    await env.init();

    // The only non-light objects should be the model scene itself
    const nonLights = sceneChildren.filter(
      (c) =>
        !(c instanceof THREE.AmbientLight) &&
        !(c instanceof THREE.DirectionalLight) &&
        !(c instanceof THREE.HemisphereLight),
    );
    expect(nonLights.length).toBe(1); // just the model group
    expect(nonLights[0]).toBe(mockModelScene);
  });

  test('dispose removes all objects from scene', async () => {
    await env.init();
    const countBefore = sceneChildren.length;
    expect(countBefore).toBeGreaterThan(0);

    env.dispose();
    expect(sceneChildren.length).toBe(0);
  });
});
