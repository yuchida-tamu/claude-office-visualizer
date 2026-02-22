import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * CameraController – orbit, zoom, and click-to-focus camera controls.
 */
export class CameraController {
  controls: OrbitControls;
  private camera: THREE.PerspectiveCamera;

  // Lerp animation state
  private isAnimating = false;
  private animStart = 0;
  private animDuration = 1;
  private startPosition = new THREE.Vector3();
  private endPosition = new THREE.Vector3();
  private startTarget = new THREE.Vector3();
  private endTarget = new THREE.Vector3();

  private static readonly DEFAULT_POSITION = new THREE.Vector3(8, 10, 8);
  private static readonly DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);

    // Damping for smooth feel
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // Vertical rotation limits — don't go underground
    this.controls.minPolarAngle = 0.2;
    this.controls.maxPolarAngle = Math.PI / 2.2;

    // Zoom limits
    this.controls.minDistance = 3;
    this.controls.maxDistance = 30;

    // Set initial camera position
    camera.position.copy(CameraController.DEFAULT_POSITION);
    this.controls.target.copy(CameraController.DEFAULT_TARGET);
    this.controls.update();
  }

  /** Smoothly transition camera to focus on a specific position. */
  focusOn(position: THREE.Vector3, duration = 1): void {
    this.isAnimating = true;
    this.animStart = performance.now() / 1000;
    this.animDuration = duration;

    this.startPosition.copy(this.camera.position);
    this.startTarget.copy(this.controls.target);

    // Position camera offset from target for good viewing angle
    this.endTarget.copy(position);
    this.endPosition.set(
      position.x + 3,
      position.y + 4,
      position.z + 3,
    );
  }

  /** Reset to default overview position. */
  resetView(): void {
    this.focusOn(CameraController.DEFAULT_TARGET, 1.2);
    this.endPosition.copy(CameraController.DEFAULT_POSITION);
  }

  update(): void {
    if (this.isAnimating) {
      const now = performance.now() / 1000;
      const elapsed = now - this.animStart;
      let t = Math.min(elapsed / this.animDuration, 1);

      // Ease-out cubic
      t = 1 - Math.pow(1 - t, 3);

      this.camera.position.lerpVectors(this.startPosition, this.endPosition, t);
      this.controls.target.lerpVectors(this.startTarget, this.endTarget, t);

      if (t >= 1) {
        this.isAnimating = false;
      }
    }

    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
