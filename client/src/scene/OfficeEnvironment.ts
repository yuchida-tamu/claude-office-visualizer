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
    // Ambient light — warm white base
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.4);
    this.scene.add(ambient);
    this.objects.push(ambient);

    // Directional light — upper-right, warm tint, casts shadows
    const directional = new THREE.DirectionalLight(0xfff0d6, 0.8);
    directional.position.set(8, 12, 5);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 50;
    directional.shadow.camera.left = -15;
    directional.shadow.camera.right = 15;
    directional.shadow.camera.top = 15;
    directional.shadow.camera.bottom = -15;
    directional.shadow.bias = -0.001;
    this.scene.add(directional);
    this.objects.push(directional);

    // Hemisphere light — natural sky/ground blend
    const hemisphere = new THREE.HemisphereLight(0x87ceeb, 0xc4956a, 0.3);
    this.scene.add(hemisphere);
    this.objects.push(hemisphere);
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
