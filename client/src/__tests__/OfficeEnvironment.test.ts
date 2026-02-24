import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// THREE is mocked globally via preload (setup.ts). Only GLTFLoader needs a
// per-file mock because this test controls what model scene is returned.
// ---------------------------------------------------------------------------

const THREE = await import('three');

// Simple mock mesh for shadow traversal testing
class MockMesh {
  isMesh = true;
  receiveShadow = false;
  castShadow = false;
  geometry = { dispose: () => {} };
  material = { dispose: () => {} };
}

// Simple mock group for the loaded model (needs removeFromParent for dispose)
class MockModelGroup {
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
let mockModelScene: MockModelGroup;

mock.module('three/addons/loaders/GLTFLoader.js', () => {
  return {
    GLTFLoader: class {
      loadAsync(_url: string) {
        return Promise.resolve({ scene: mockModelScene });
      }
    },
  };
});

// Must import after mocks are registered
const { OfficeEnvironment } = await import('../scene/OfficeEnvironment');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OfficeEnvironment', () => {
  let scene: InstanceType<typeof THREE.Scene>;
  let sceneChildren: unknown[];
  let env: InstanceType<typeof OfficeEnvironment>;

  beforeEach(() => {
    // Create a mock model with 2 meshes
    mockModelScene = new MockModelGroup();
    const mesh1 = new MockMesh();
    const mesh2 = new MockMesh();
    mockModelScene.children = [mesh1, mesh2];

    scene = new THREE.Scene();
    sceneChildren = (scene as any).children;
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

  test('init creates 13 lights (ambient, hemisphere, 2 directional, 9 point)', async () => {
    await env.init();

    const lights = sceneChildren.filter(
      (c) =>
        c instanceof THREE.AmbientLight ||
        c instanceof THREE.DirectionalLight ||
        c instanceof THREE.HemisphereLight ||
        c instanceof THREE.PointLight,
    );
    expect(lights.length).toBe(13);
  });

  test('does not create procedural floor, grid, or wall geometry', async () => {
    await env.init();

    // The only non-light objects should be the model scene itself
    const nonLights = sceneChildren.filter(
      (c) =>
        !(c instanceof THREE.AmbientLight) &&
        !(c instanceof THREE.DirectionalLight) &&
        !(c instanceof THREE.HemisphereLight) &&
        !(c instanceof THREE.PointLight),
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
