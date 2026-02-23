import * as THREE from 'three';
import { OfficeEnvironment } from './OfficeEnvironment';
import { DeskManager } from './DeskManager';
import { CameraController } from './CameraController';
import { PostProcessing } from './PostProcessing';
import { ParticleSystem } from './ParticleSystem';
import { ToolAnimationManager } from './ToolAnimationManager';
import { useVisualizerStore } from '../store/useVisualizerStore';

/**
 * SceneManager – owns the Three.js Scene, Renderer, and Camera.
 * Coordinates the render loop, resize handling, and click-to-focus.
 */
export class SceneManager {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  readonly officeEnvironment: OfficeEnvironment;
  readonly deskManager: DeskManager;
  readonly cameraController: CameraController;
  readonly particleSystem: ParticleSystem;
  readonly toolAnimationManager: ToolAnimationManager;
  private postProcessing: PostProcessing;

  private animationFrameId = 0;
  private clock = new THREE.Clock();
  private resizeObserver: ResizeObserver | null = null;
  private container: HTMLElement;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private onClickBound: (e: MouseEvent) => void;
  private frameCallback: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.container = canvas.parentElement ?? canvas;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000,
    );

    // Renderer — WebGLRenderer with good defaults
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;
    this.renderer.setClearColor(0x05050a, 1); // Dark midnight background

    // Sub-modules
    this.officeEnvironment = new OfficeEnvironment(this.scene);
    this.deskManager = new DeskManager(this.scene);
    this.particleSystem = new ParticleSystem(this.scene);
    this.toolAnimationManager = new ToolAnimationManager(this.scene);
    this.cameraController = new CameraController(this.camera, this.renderer.domElement);
    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);

    // Wire particle system to resolve positions from desk manager
    this.particleSystem.setPositionResolver((agentId) =>
      this.deskManager.getDeskPosition(agentId),
    );

    // Click handler
    this.onClickBound = this.onClick.bind(this);
  }

  /** Initialize scene contents and start the render loop. */
  async init(): Promise<void> {
    await Promise.all([
      this.officeEnvironment.init(),
      this.deskManager.loadModels(),
      this.toolAnimationManager.loadModels(),
    ]);

    // Pre-render 20 desks at slot positions (always visible)
    this.deskManager.initDesks(20);

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);

    // Click-to-focus
    this.renderer.domElement.addEventListener('click', this.onClickBound);

    // Start animation loop
    this.clock.start();
    this.animate();
  }

  /** Register a callback to run each frame (before rendering). */
  setFrameCallback(cb: () => void): void {
    this.frameCallback = cb;
  }

  /** Handle window/container resize. */
  resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.postProcessing.resize(width, height);
  }

  /** Cleanup all resources. */
  dispose(): void {
    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver?.disconnect();
    this.renderer.domElement.removeEventListener('click', this.onClickBound);

    this.cameraController.dispose();
    this.officeEnvironment.dispose();
    this.deskManager.dispose();
    this.toolAnimationManager.dispose();
    this.particleSystem.dispose();
    this.postProcessing.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();

    // Drive store → scene bridge every frame (advances animations, syncs particles)
    this.frameCallback?.();

    this.deskManager.update(delta);
    this.toolAnimationManager.update(delta);
    this.cameraController.update();

    // Render through post-processing pipeline
    this.postProcessing.render();
  };

  private onClick(event: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const clickedAgentId = this.deskManager.getIntersectedDesk(this.raycaster);

    useVisualizerStore.getState().focusAgent(clickedAgentId ?? null);
  }
}
