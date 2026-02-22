import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * PostProcessing – bloom for glowing status indicators and particles.
 * Kept subtle: bloom only visible on emissive materials.
 */
export class PostProcessing {
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(renderer.domElement.clientWidth, renderer.domElement.clientHeight),
      0.4,  // strength
      0.3,  // radius
      0.8   // threshold
    );
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  render(): void {
    this.composer.render();
  }

  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
