import * as THREE from 'three';
import type { MessageInFlight } from '../store/useVisualizerStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Particles per flow trail. */
const PARTICLES_PER_FLOW = 6;

/** Max concurrent flows supported by the pool. */
const MAX_FLOWS = 20;

/** Total pooled particle meshes. */
const POOL_SIZE = MAX_FLOWS * PARTICLES_PER_FLOW;

/** Total pooled point lights (one per flow lead particle). */
const LIGHT_POOL_SIZE = MAX_FLOWS;

/** Spread of trail behind the leading particle (fraction of curve length). */
const TRAIL_SPREAD = 0.12;

/** Default arc lift above the XZ plane. */
const ARC_LIFT = 2.0;

/** Wider arc for broadcast messages. */
const BROADCAST_ARC_LIFT = 3.5;

/** Position for "external" user input origin (above the scene). */
const EXTERNAL_ORIGIN = new THREE.Vector3(0, 10, 12);

// ---------------------------------------------------------------------------
// Color + size config by message type
// ---------------------------------------------------------------------------

interface FlowStyle {
  color: THREE.Color;
  hex: number;
  radius: number;
  arcLift: number;
}

const FLOW_STYLES: Record<MessageInFlight['messageType'], FlowStyle> = {
  task:        { color: new THREE.Color(0x60a5fa), hex: 0x60a5fa, radius: 0.06, arcLift: ARC_LIFT },
  message:     { color: new THREE.Color(0x4ade80), hex: 0x4ade80, radius: 0.05, arcLift: ARC_LIFT },
  broadcast:   { color: new THREE.Color(0xa78bfa), hex: 0xa78bfa, radius: 0.05, arcLift: BROADCAST_ARC_LIFT },
  user_prompt: { color: new THREE.Color(0xfbbf24), hex: 0xfbbf24, radius: 0.05, arcLift: ARC_LIFT },
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** A pooled sphere mesh ready for reuse. */
interface PooledParticle {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  inUse: boolean;
}

/** A pooled point light for the lead particle. */
interface PooledLight {
  light: THREE.PointLight;
  inUse: boolean;
}

/** An active message flow being animated. */
interface ActiveFlow {
  id: string;
  curve: THREE.CubicBezierCurve3;
  style: FlowStyle;
  particles: PooledParticle[];
  leadLight: PooledLight | null;
  progress: number;
}

// ---------------------------------------------------------------------------
// ParticleSystem
// ---------------------------------------------------------------------------

/**
 * ParticleSystem — glowing sphere particles traveling along cubic Bezier arcs.
 *
 * Uses object pooling: sphere meshes and point lights are pre-allocated and
 * recycled across flows. MeshStandardMaterial with high emissiveIntensity
 * triggers the existing UnrealBloomPass for glow.
 */
export class ParticleSystem {
  private scene: THREE.Scene;

  // Object pools
  private particlePool: PooledParticle[] = [];
  private lightPool: PooledLight[] = [];

  // Shared geometry — one sphere, instanced via pool
  private sharedGeo: THREE.SphereGeometry;

  // Active flows keyed by message ID
  private flows = new Map<string, ActiveFlow>();

  // Position resolver
  private positionResolver: ((agentId: string) => THREE.Vector3 | null) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sharedGeo = new THREE.SphereGeometry(0.05, 12, 12);

    // Pre-allocate particle mesh pool
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 2.0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sharedGeo, mat);
      mesh.visible = false;
      mesh.castShadow = false;
      scene.add(mesh);
      this.particlePool.push({ mesh, inUse: false });
    }

    // Pre-allocate point light pool
    for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
      const light = new THREE.PointLight(0xffffff, 0.3, 2);
      light.visible = false;
      scene.add(light);
      this.lightPool.push({ light, inUse: false });
    }
  }

  /** Set the function used to resolve agentId → 3D position. */
  setPositionResolver(resolver: (agentId: string) => THREE.Vector3 | null): void {
    this.positionResolver = resolver;
  }

  /**
   * Spawn a particle flow between two positions.
   * Called when a new MessageInFlight appears.
   */
  spawnFlow(message: MessageInFlight, fromPos: THREE.Vector3, toPos: THREE.Vector3): void {
    if (this.flows.has(message.id)) return;

    const style = FLOW_STYLES[message.messageType] ?? FLOW_STYLES.message;
    const curve = this.buildCurve(fromPos, toPos, style.arcLift);

    // Acquire particles from pool
    const particles = this.acquireParticles(PARTICLES_PER_FLOW);
    if (particles.length === 0) return;

    // Configure each particle's material for this flow
    for (const p of particles) {
      const mat = p.mesh.material;
      mat.color.copy(style.color);
      mat.emissive.copy(style.color);
      mat.emissiveIntensity = 2.0;
      mat.opacity = 0;
      p.mesh.scale.setScalar(style.radius / 0.05); // scale relative to shared geo radius
      p.mesh.visible = true;
    }

    // Acquire lead point light
    const leadLight = this.acquireLight();
    if (leadLight) {
      leadLight.light.color.copy(style.color);
      leadLight.light.intensity = 0.3;
      leadLight.light.visible = true;
    }

    this.flows.set(message.id, {
      id: message.id,
      curve,
      style,
      particles,
      leadLight,
      progress: message.progress,
    });
  }

  /**
   * Update all active flows. Call each frame.
   * Syncs with the current activeMessages list: spawns new flows, updates
   * existing ones, and cleans up completed flows.
   */
  update(_deltaTime: number, activeMessages: MessageInFlight[]): void {
    const activeIds = new Set<string>();

    for (const msg of activeMessages) {
      activeIds.add(msg.id);

      // Spawn new flows
      if (!this.flows.has(msg.id)) {
        const fromPos = this.resolvePosition(msg.fromAgentId);
        const toPos = this.resolvePosition(msg.toAgentId);
        if (fromPos && toPos) {
          this.spawnFlow(msg, fromPos, toPos);
        }
      }

      // Update progress
      const flow = this.flows.get(msg.id);
      if (flow) {
        flow.progress = msg.progress;
        this.updateFlow(flow);
      }
    }

    // Clean up flows no longer active
    for (const [id, flow] of this.flows) {
      if (!activeIds.has(id)) {
        this.releaseFlow(flow);
        this.flows.delete(id);
      }
    }
  }

  dispose(): void {
    // Release all active flows
    for (const flow of this.flows.values()) {
      this.releaseFlow(flow);
    }
    this.flows.clear();

    // Remove and dispose pooled objects
    for (const p of this.particlePool) {
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
    }
    for (const l of this.lightPool) {
      this.scene.remove(l.light);
      l.light.dispose();
    }
    this.particlePool = [];
    this.lightPool = [];

    this.sharedGeo.dispose();
  }

  // -------------------------------------------------------------------------
  // Private — curve construction
  // -------------------------------------------------------------------------

  private buildCurve(
    from: THREE.Vector3,
    to: THREE.Vector3,
    arcLift: number,
  ): THREE.CubicBezierCurve3 {
    // Start/end slightly above desk surface
    const p0 = new THREE.Vector3(from.x, from.y + 1.2, from.z);
    const p3 = new THREE.Vector3(to.x, to.y + 1.2, to.z);

    // Control points at 1/3 and 2/3 along path, lifted by arcLift
    const p1 = new THREE.Vector3().lerpVectors(p0, p3, 0.33);
    p1.y += arcLift;
    const p2 = new THREE.Vector3().lerpVectors(p0, p3, 0.66);
    p2.y += arcLift;

    return new THREE.CubicBezierCurve3(p0, p1, p2, p3);
  }

  // -------------------------------------------------------------------------
  // Private — per-frame flow update
  // -------------------------------------------------------------------------

  private updateFlow(flow: ActiveFlow): void {
    const { curve, particles, leadLight, progress } = flow;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Distribute trail behind leading edge
      const trailOffset = (i / particles.length) * TRAIL_SPREAD;
      const t = Math.max(0, Math.min(1, progress - trailOffset));

      if (t <= 0) {
        p.mesh.visible = false;
        continue;
      }

      // Position along curve
      const point = curve.getPointAt(t);
      p.mesh.position.copy(point);
      p.mesh.visible = true;

      // Opacity: fade in over first 10%, fade out over last 10%
      let opacity = 1;
      if (progress < 0.1) {
        opacity = progress / 0.1;
      } else if (progress > 0.9) {
        opacity = (1 - progress) / 0.1;
      }
      // Trail particles slightly dimmer
      const trailFade = 1 - (i / particles.length) * 0.5;
      p.mesh.material.opacity = Math.max(0, opacity * trailFade);

      // Lead particle gets the point light
      if (i === 0 && leadLight) {
        leadLight.light.position.copy(point);
        leadLight.light.visible = opacity > 0.1;
        leadLight.light.intensity = 0.3 * opacity;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private — flow lifecycle
  // -------------------------------------------------------------------------

  private releaseFlow(flow: ActiveFlow): void {
    for (const p of flow.particles) {
      p.mesh.visible = false;
      p.mesh.material.opacity = 0;
      p.inUse = false;
    }
    if (flow.leadLight) {
      flow.leadLight.light.visible = false;
      flow.leadLight.inUse = false;
    }
  }

  // -------------------------------------------------------------------------
  // Private — object pool management
  // -------------------------------------------------------------------------

  private acquireParticles(count: number): PooledParticle[] {
    const result: PooledParticle[] = [];
    for (const p of this.particlePool) {
      if (!p.inUse) {
        p.inUse = true;
        result.push(p);
        if (result.length >= count) break;
      }
    }
    return result;
  }

  private acquireLight(): PooledLight | null {
    for (const l of this.lightPool) {
      if (!l.inUse) {
        l.inUse = true;
        return l;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Private — position resolution
  // -------------------------------------------------------------------------

  private resolvePosition(agentId: string): THREE.Vector3 | null {
    if (agentId === 'external') {
      return EXTERNAL_ORIGIN.clone();
    }
    if (this.positionResolver) {
      return this.positionResolver(agentId);
    }
    return null;
  }
}
