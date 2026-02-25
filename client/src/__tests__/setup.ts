import { mock } from 'bun:test';

// ---------------------------------------------------------------------------
// Global THREE.js mock for all test files
// ---------------------------------------------------------------------------
// This preload script ensures a consistent THREE.js mock is available
// across all test files, preventing Bun module cache contamination.
// ---------------------------------------------------------------------------

class MockVector3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  copy(v: MockVector3) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new MockVector3(this.x, this.y, this.z); }
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(s: number) { this.x = s; this.y = s; this.z = s; return this; }
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
      if ((child as { name?: string }).name === name) return child;
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
      if ((child as { isMesh?: boolean }).isMesh) {
        const m = new MockMesh((child as { name: string }).name);
        const mat = {
          color: { setHex: () => {} },
          emissive: { setHex: () => {} },
          emissiveIntensity: 0.5,
          clone() { return { ...mat, clone: mat.clone, dispose: mat.dispose }; },
          dispose() {},
        };
        m.material = mat;
        c.add(m);
      } else if ((child as MockGroup).clone) {
        c.add((child as MockGroup).clone());
      }
    }
    return c;
  }
}

class MockMesh {
  isMesh = true;
  position = new MockVector3();
  name = '';
  material: Record<string, unknown> = {};
  castShadow = false;
  receiveShadow = false;
  visible = true;
  geometry = { dispose: () => {} };
  constructor(name = '') { this.name = name; }
}

mock.module('three', () => ({
  Vector3: MockVector3,
  Group: MockGroup,
  Color: class { setHSL() { return this; } getHex() { return 0xffffff; } },
  SphereGeometry: class { dispose() {} },
  RingGeometry: class { dispose() {} },
  Clock: class {
    private _calls = 0;
    getElapsedTime() { return this._calls++ * 0.5; }
  },
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
    side = 0;
    clone() {
      return new (this.constructor as new () => typeof this)();
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
  SpriteMaterial: class {
    map: unknown = null;
    opacity = 1;
    transparent = false;
    depthTest = true;
    constructor(opts?: Record<string, unknown>) {
      if (opts) {
        if (opts.map !== undefined) this.map = opts.map;
        if (opts.opacity !== undefined) this.opacity = opts.opacity as number;
        if (opts.transparent !== undefined) this.transparent = opts.transparent as boolean;
        if (opts.depthTest !== undefined) this.depthTest = opts.depthTest as boolean;
      }
    }
    dispose() {}
  },
  Sprite: class {
    material: Record<string, unknown>;
    position = new MockVector3();
    scale = new MockVector3();
    name = '';
    constructor(mat?: unknown) {
      this.material = (mat ?? { map: null, opacity: 1, transparent: false, dispose: () => {} }) as Record<string, unknown>;
    }
  },
  DataTexture: class { needsUpdate = false; dispose() {} },
  CanvasTexture: class { needsUpdate = false; dispose() {} },
  RGBAFormat: 0,
  Material: class { dispose() {} },
  DoubleSide: 2,
  AmbientLight: class {
    constructor(public color: number, public intensity: number) {}
  },
  DirectionalLight: class {
    position = { set: () => {} };
    castShadow = false;
    shadow = {
      mapSize: { width: 0, height: 0 },
      camera: { near: 0, far: 0, left: 0, right: 0, top: 0, bottom: 0 },
      bias: 0,
    };
    constructor(public color: number, public intensity: number) {}
  },
  HemisphereLight: class {
    constructor(public skyColor: number, public groundColor: number, public intensity: number) {}
  },
  PointLight: class {
    position = { set: () => {} };
    castShadow = false;
    constructor(public color: number, public intensity: number, public distance?: number, public decay?: number) {}
  },
  Scene: class {
    children: unknown[] = [];
    add(obj: unknown) { this.children.push(obj); }
    remove(obj: unknown) {
      const idx = this.children.indexOf(obj);
      if (idx >= 0) this.children.splice(idx, 1);
    }
  },
}));

// NOTE: GLTFLoader is NOT mocked here. Individual test files that need custom
// GLTFLoader behavior (e.g., returning specific desk/monitor/icon templates)
// provide their own mock.module('three/addons/loaders/GLTFLoader.js', ...).
