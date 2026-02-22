import * as THREE from 'three';

/**
 * OfficeEnvironment – procedural floor, walls, and ambient lighting.
 * Monument Valley-inspired color palette: warm muted tones, clean geometry, soft lighting.
 */
export class OfficeEnvironment {
  private scene: THREE.Scene;
  private meshes: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  init(): void {
    this.createFloor();
    this.createGridOverlay();
    this.createWalls();
    this.createLighting();
  }

  private createFloor(): void {
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xc4956a,
      roughness: 0.8,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.meshes.push(floor);
  }

  private createGridOverlay(): void {
    const grid = new THREE.GridHelper(30, 30, 0x000000, 0x000000);
    grid.material.opacity = 0.1;
    grid.material.transparent = true;
    grid.position.y = 0.01; // Slightly above floor to avoid z-fighting
    this.scene.add(grid);
    this.meshes.push(grid);
  }

  private createWalls(): void {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xe8e8e8,
      roughness: 0.9,
      metalness: 0.0,
    });

    const wallHeight = 4;
    const wallThickness = 0.15;
    const wallLength = 30;

    // Back wall
    const backWallGeo = new THREE.BoxGeometry(wallLength, wallHeight, wallThickness);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, wallHeight / 2, -wallLength / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    this.scene.add(backWall);
    this.meshes.push(backWall);

    // Left wall
    const leftWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, wallLength);
    const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-wallLength / 2, wallHeight / 2, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);
    this.meshes.push(leftWall);

    // Right wall
    const rightWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, wallLength);
    const rightWall = new THREE.Mesh(rightWallGeo, wallMat);
    rightWall.position.set(wallLength / 2, wallHeight / 2, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);
    this.meshes.push(rightWall);
  }

  private createLighting(): void {
    // Ambient light — warm white base
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.4);
    this.scene.add(ambient);
    this.meshes.push(ambient);

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
    this.meshes.push(directional);

    // Hemisphere light — natural sky/ground blend
    const hemisphere = new THREE.HemisphereLight(0x87ceeb, 0xc4956a, 0.3);
    this.scene.add(hemisphere);
    this.meshes.push(hemisphere);
  }

  dispose(): void {
    for (const obj of this.meshes) {
      this.scene.remove(obj);
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
    this.meshes = [];
  }
}
