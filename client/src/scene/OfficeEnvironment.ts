import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = '/models/office.glb';

/**
 * OfficeEnvironment – loads a GLB model for the office (floor, walls, props)
 * and sets up lighting. The model does not include lights, so those are
 * created procedurally.
 */
export class OfficeEnvironment {
  private scene: THREE.Scene;
  private objects: THREE.Object3D[] = [];
  private modelScene: THREE.Group | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    await this.loadModel();
    this.createLighting();
  }

  private async loadModel(): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(MODEL_URL);
    this.modelScene = gltf.scene;

    // Enable shadows on all meshes in the model
    this.modelScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });

    this.scene.add(this.modelScene);
    this.objects.push(this.modelScene);
  }

  private createLighting(): void {
    // Ambient light — ensures nothing is fully black (walls, ceiling, props)
    const ambient = new THREE.AmbientLight(0x1a1a2e, 1.5);
    this.scene.add(ambient);
    this.objects.push(ambient);

    // Hemisphere light — cool ceiling / warm floor fill
    const hemisphere = new THREE.HemisphereLight(0x2a2a4a, 0x1a1510, 1.0);
    this.scene.add(hemisphere);
    this.objects.push(hemisphere);

    // Main directional — slightly angled, casts shadows across full office
    const main = new THREE.DirectionalLight(0xffe4b5, 2.5);
    main.position.set(3, 15, 3);
    main.castShadow = true;
    main.shadow.mapSize.width = 4096;
    main.shadow.mapSize.height = 4096;
    main.shadow.camera.near = 0.5;
    main.shadow.camera.far = 80;
    main.shadow.camera.left = -50;
    main.shadow.camera.right = 50;
    main.shadow.camera.top = 50;
    main.shadow.camera.bottom = -50;
    main.shadow.bias = -0.001;
    this.scene.add(main);
    this.objects.push(main);

    // Fill directional — opposite angle to reduce harsh shadows on walls
    const fill = new THREE.DirectionalLight(0x6688bb, 1.2);
    fill.position.set(-5, 8, -5);
    fill.castShadow = false;
    this.scene.add(fill);
    this.objects.push(fill);

    // Point lights spread across the office for localized warm pools
    const pointPositions = [
      [0, 4, 0],
      [-12, 4, 0],
      [12, 4, 0],
      [0, 4, -12],
      [0, 4, 12],
      [-12, 4, -12],
      [12, 4, -12],
      [-12, 4, 12],
      [12, 4, 12],
    ];
    for (const [x, y, z] of pointPositions) {
      const pl = new THREE.PointLight(0xffe4b5, 20, 18, 2);
      pl.position.set(x, y, z);
      pl.castShadow = false;
      this.scene.add(pl);
      this.objects.push(pl);
    }
  }

  dispose(): void {
    if (this.modelScene) {
      this.modelScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            (mesh.material as THREE.Material).dispose();
          }
        }
      });
    }

    for (const obj of this.objects) {
      this.scene.remove(obj);
    }
    this.objects = [];
    this.modelScene = null;
  }
}
