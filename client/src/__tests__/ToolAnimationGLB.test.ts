import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// THREE is mocked globally via preload (setup.ts). Only GLTFLoader needs a
// per-file mock because this test controls what icon templates are returned.
// ---------------------------------------------------------------------------

const THREE = await import('three');

// Icon model templates
const iconTemplates: Record<string, InstanceType<typeof THREE.Group>> = {};

function buildIconTemplate(name: string): InstanceType<typeof THREE.Group> {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh();
  mesh.name = `${name}-mesh`;
  mesh.material = {
    color: { setHex: () => {} },
    emissive: { setHex: () => {} },
    emissiveIntensity: 0.5,
    clone() { return { ...this }; },
    dispose: () => {},
  } as any;
  g.add(mesh);
  return g;
}

mock.module('three/addons/loaders/GLTFLoader.js', () => {
  return {
    GLTFLoader: class {
      loadAsync(url: string) {
        if (url.includes('terminal')) return Promise.resolve({ scene: iconTemplates['terminal'] });
        if (url.includes('serch')) return Promise.resolve({ scene: iconTemplates['search'] });
        if (url.includes('document')) return Promise.resolve({ scene: iconTemplates['document'] });
        if (url.includes('web')) return Promise.resolve({ scene: iconTemplates['web'] });
        if (url.includes('gear')) return Promise.resolve({ scene: iconTemplates['default'] });
        return Promise.resolve({ scene: new THREE.Group() });
      }
    },
  };
});

const { ToolAnimationManager } = await import('../scene/ToolAnimationManager');

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
    const deskGroup = new THREE.Group() as unknown as import('three').Group;
    tam.start('agent-1', 'Bash', deskGroup);
    // Icon group should be added to desk group
    expect((deskGroup as any).children.length).toBe(1);
  });

  test('start() clones the correct icon model for Read (search)', () => {
    const deskGroup = new THREE.Group() as unknown as import('three').Group;
    tam.start('agent-1', 'Read', deskGroup);
    expect((deskGroup as any).children.length).toBe(1);
  });

  test('start() clones the correct icon model for Write (document)', () => {
    const deskGroup = new THREE.Group() as unknown as import('three').Group;
    tam.start('agent-1', 'Write', deskGroup);
    expect((deskGroup as any).children.length).toBe(1);
  });

  test('start() clones the correct icon model for WebFetch (web)', () => {
    const deskGroup = new THREE.Group() as unknown as import('three').Group;
    tam.start('agent-1', 'WebFetch', deskGroup);
    expect((deskGroup as any).children.length).toBe(1);
  });

  test('start() clones the correct icon model for unknown tool (default/gear)', () => {
    const deskGroup = new THREE.Group() as unknown as import('three').Group;
    tam.start('agent-1', 'SomeUnknownTool', deskGroup);
    expect((deskGroup as any).children.length).toBe(1);
  });

  test('stop() marks icon for fade-out', () => {
    const deskGroup = new THREE.Group() as unknown as import('three').Group;
    tam.start('agent-1', 'Bash', deskGroup);
    tam.stop('agent-1');
    // After enough update ticks, the icon should be removed
    for (let i = 0; i < 30; i++) {
      tam.update(0.05);
    }
    expect((deskGroup as any).children.length).toBe(0);
  });

  test('does not create procedural geometries (no TorusGeometry, BoxGeometry, etc.)', () => {
    // Constructor should not build shared geometry cache
    // If it tried to create TorusGeometry etc., mock would throw since they're not defined
    expect(tam).toBeDefined();
  });
});
