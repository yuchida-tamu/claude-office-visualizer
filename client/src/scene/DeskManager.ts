import * as THREE from 'three';
import type { AgentStatus } from '@shared/agent';
import { SlotBasedLayout } from './SlotBasedLayout';

// ---------------------------------------------------------------------------
// Status indicator colors
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<AgentStatus, number> = {
  active: 0x4ade80,
  thinking: 0x60a5fa,
  tool_executing: 0xfbbf24,
  waiting: 0xfb923c,
  error: 0xef4444,
  completed: 0x9ca3af,
  spawning: 0x4ade80,
};

// ---------------------------------------------------------------------------
// Desk instance
// ---------------------------------------------------------------------------

interface DeskInstance {
  group: THREE.Group;
  parentId: string | null;
  statusIndicator: THREE.Mesh;
  statusMaterial: THREE.MeshStandardMaterial;
  monitorMaterial: THREE.MeshStandardMaterial;
  parentLine: THREE.Line | null;
  parentLineMaterial: THREE.LineDashedMaterial | null;
  status: AgentStatus;
  spawnProgress: number; // 0..1
  despawning: boolean;
  despawnProgress: number; // 0..1
  // Error flash state
  errorFlashTime: number; // remaining flash time in seconds
  // Notification popup state
  notificationSprite: THREE.Sprite | null;
  notificationVisible: boolean;
  notificationFadeProgress: number; // 0=hidden, 1=fully visible
}

// ---------------------------------------------------------------------------
// DeskManager
// ---------------------------------------------------------------------------

/**
 * DeskManager – creates and animates desks representing agents.
 * Uses force-directed layout for procedural placement.
 */
export class DeskManager {
  private scene: THREE.Scene;
  private desks = new Map<string, DeskInstance>();
  private layoutEngine = new SlotBasedLayout();
  private clock = new THREE.Clock();

  // Shared geometries — created once, reused per desk
  private deskSurfaceGeo: THREE.BoxGeometry;
  private legGeo: THREE.CylinderGeometry;
  private monitorGeo: THREE.BoxGeometry;
  private monitorStandGeo: THREE.CylinderGeometry;
  private chairSeatGeo: THREE.BoxGeometry;
  private chairBackGeo: THREE.BoxGeometry;
  private avatarGeo: THREE.CapsuleGeometry;
  private statusGeo: THREE.SphereGeometry;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Pre-create shared geometries
    this.deskSurfaceGeo = new THREE.BoxGeometry(1.6, 0.05, 0.8);
    this.legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8);
    this.monitorGeo = new THREE.BoxGeometry(0.6, 0.4, 0.03);
    this.monitorStandGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8);
    this.chairSeatGeo = new THREE.BoxGeometry(0.45, 0.05, 0.45);
    this.chairBackGeo = new THREE.BoxGeometry(0.45, 0.4, 0.05);
    this.avatarGeo = new THREE.CapsuleGeometry(0.12, 0.2, 8, 16);
    this.statusGeo = new THREE.SphereGeometry(0.08, 16, 16);
  }

  /** Add a new desk for an agent. */
  addDesk(agentId: string, parentId?: string): void {
    // If desk exists and is despawning, cancel the despawn and re-spawn
    const existing = this.desks.get(agentId);
    if (existing) {
      if (existing.despawning) {
        console.warn('[DeskMgr] addDesk: cancelling despawn for', agentId);
        existing.despawning = false;
        existing.despawnProgress = 0;
        existing.spawnProgress = 1; // Already at full scale
        existing.group.scale.setScalar(1);
      }
      return;
    }
    console.warn('[DeskMgr] addDesk: creating new desk for', agentId);

    const pos = this.layoutEngine.addNode(agentId);
    const group = this.buildDeskGroup(agentId);
    group.position.copy(pos);
    group.scale.set(0, 0, 0); // Start at 0 for spawn animation

    this.scene.add(group);

    // Named meshes
    const statusMesh = group.getObjectByName('status-indicator') as THREE.Mesh;
    const statusMat = statusMesh.material as THREE.MeshStandardMaterial;
    const monitorMesh = group.getObjectByName('monitor-screen') as THREE.Mesh;
    const monitorMat = monitorMesh.material as THREE.MeshStandardMaterial;

    // Parent-child line
    let parentLine: THREE.Line | null = null;
    let parentLineMaterial: THREE.LineDashedMaterial | null = null;
    if (parentId && this.desks.has(parentId)) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        group.position.clone(),
        this.desks.get(parentId)!.group.position.clone(),
      ]);
      parentLineMaterial = new THREE.LineDashedMaterial({
        color: 0x60a5fa,
        dashSize: 0.1,
        gapSize: 0.05,
        transparent: true,
        opacity: 0.6,
      });
      parentLine = new THREE.Line(lineGeo, parentLineMaterial);
      parentLine.computeLineDistances();
      this.scene.add(parentLine);
    }

    this.desks.set(agentId, {
      group,
      parentId: parentId ?? null,
      statusIndicator: statusMesh,
      statusMaterial: statusMat,
      monitorMaterial: monitorMat,
      parentLine,
      parentLineMaterial,
      status: 'spawning',
      spawnProgress: 0,
      despawning: false,
      despawnProgress: 0,
      errorFlashTime: 0,
      notificationSprite: null,
      notificationVisible: false,
      notificationFadeProgress: 0,
    });
  }

  /** Remove a desk with fade-out animation. */
  removeDesk(agentId: string): void {
    const desk = this.desks.get(agentId);
    if (!desk || desk.despawning) return;
    console.warn('[DeskMgr] removeDesk: starting despawn for', agentId);
    desk.despawning = true;
    desk.despawnProgress = 0;
  }

  /** Update desk state (status indicator). */
  updateDeskState(agentId: string, status: AgentStatus): void {
    const desk = this.desks.get(agentId);
    if (!desk) return;
    desk.status = status;
    desk.statusMaterial.color.setHex(STATUS_COLORS[status]);
    desk.statusMaterial.emissive.setHex(STATUS_COLORS[status]);
  }

  /** Set monitor screen glow color (used by ToolAnimationManager). */
  setMonitorGlow(agentId: string, color: number, intensity: number): void {
    const desk = this.desks.get(agentId);
    if (!desk) return;
    desk.monitorMaterial.emissive.setHex(color);
    desk.monitorMaterial.emissiveIntensity = intensity;
  }

  /** Reset monitor to default idle glow. */
  resetMonitorGlow(agentId: string): void {
    const desk = this.desks.get(agentId);
    if (!desk) return;
    desk.monitorMaterial.emissive.setHex(0x1a3a5c);
    desk.monitorMaterial.emissiveIntensity = 0.4;
  }

  /** Get the desk THREE.Group for attaching child objects (e.g. tool icons). */
  getDeskGroup(agentId: string): THREE.Group | null {
    return this.desks.get(agentId)?.group ?? null;
  }

  /** Trigger a brief red flash on the desk for error state. */
  triggerErrorFlash(agentId: string): void {
    const desk = this.desks.get(agentId);
    if (!desk) return;
    desk.errorFlashTime = 0.8; // seconds
  }

  /** Show a notification popup above the desk. */
  showNotification(agentId: string, type: 'notification' | 'permission_request' | null, message: string | null): void {
    const desk = this.desks.get(agentId);
    if (!desk) return;

    // Remove existing notification sprite if present
    if (desk.notificationSprite) {
      desk.group.remove(desk.notificationSprite);
      (desk.notificationSprite.material as THREE.SpriteMaterial).map?.dispose();
      (desk.notificationSprite.material as THREE.SpriteMaterial).dispose();
      desk.notificationSprite = null;
    }

    const sprite = this.buildNotificationSprite(type, message);
    sprite.position.set(0, 2.2, 0);
    sprite.scale.set(1.5, 0.375, 1);
    sprite.name = 'notification-popup';
    desk.group.add(sprite);

    desk.notificationSprite = sprite;
    desk.notificationVisible = true;
    desk.notificationFadeProgress = 0;
  }

  /** Hide the notification popup with fade-out animation. */
  hideNotification(agentId: string): void {
    const desk = this.desks.get(agentId);
    if (!desk || !desk.notificationSprite) return;
    desk.notificationVisible = false;
  }

  /** Called each frame. */
  update(deltaTime: number): void {
    const time = this.clock.getElapsedTime();

    for (const [agentId, desk] of this.desks.entries()) {
      // Update position from layout engine
      const layoutPos = this.layoutEngine.getPosition(agentId);
      if (layoutPos) {
        desk.group.position.x = layoutPos.x;
        desk.group.position.z = layoutPos.z;
      }

      // Spawn animation
      if (desk.spawnProgress < 1) {
        desk.spawnProgress = Math.min(desk.spawnProgress + deltaTime * 2, 1);
        // Ease-out cubic
        const t = 1 - Math.pow(1 - desk.spawnProgress, 3);
        desk.group.scale.setScalar(t);
      }

      // Despawn animation
      if (desk.despawning) {
        desk.despawnProgress = Math.min(desk.despawnProgress + deltaTime * 2, 1);
        const t = 1 - desk.despawnProgress;
        desk.group.scale.setScalar(t);

        if (desk.despawnProgress >= 1) {
          this.cleanupDesk(agentId, desk);
          continue;
        }
      }

      // Pulsing status indicator for 'thinking' status
      if (desk.status === 'thinking') {
        const pulse = (Math.sin(time * 3) + 1) * 0.5; // 0..1
        desk.statusMaterial.emissiveIntensity = 0.3 + pulse * 0.7;
      } else {
        desk.statusMaterial.emissiveIntensity = 0.5;
      }

      // Error flash animation — briefly redden the monitor screen
      if (desk.errorFlashTime > 0) {
        desk.errorFlashTime -= deltaTime;
        const flashIntensity = Math.max(0, desk.errorFlashTime / 0.8);
        desk.monitorMaterial.emissive.setHex(0xef4444);
        desk.monitorMaterial.emissiveIntensity = 0.4 + flashIntensity * 0.8;
        if (desk.errorFlashTime <= 0) {
          desk.monitorMaterial.emissive.setHex(0x1a3a5c);
          desk.monitorMaterial.emissiveIntensity = 0.4;
        }
      }

      // Notification popup fade and bob animation
      if (desk.notificationSprite) {
        const FADE_SPEED = 3; // progress units per second
        if (desk.notificationVisible) {
          desk.notificationFadeProgress = Math.min(desk.notificationFadeProgress + deltaTime * FADE_SPEED, 1);
        } else {
          desk.notificationFadeProgress = Math.max(desk.notificationFadeProgress - deltaTime * FADE_SPEED, 0);
          if (desk.notificationFadeProgress <= 0) {
            // Fade-out complete — remove sprite
            desk.group.remove(desk.notificationSprite);
            (desk.notificationSprite.material as THREE.SpriteMaterial).map?.dispose();
            (desk.notificationSprite.material as THREE.SpriteMaterial).dispose();
            desk.notificationSprite = null;
            desk.notificationFadeProgress = 0;
          }
        }

        if (desk.notificationSprite) {
          const mat = desk.notificationSprite.material as THREE.SpriteMaterial;
          mat.opacity = desk.notificationFadeProgress;
          // Gentle bob animation
          const baseY = 2.2;
          desk.notificationSprite.position.y = baseY + Math.sin(time * 2) * 0.05;
        }
      }

      // Update parent-child line positions
      if (desk.parentLine) {
        const parentDesk = this.findParentDesk(agentId);
        if (parentDesk) {
          const positions = desk.parentLine.geometry.attributes.position as THREE.BufferAttribute;
          positions.setXYZ(0, desk.group.position.x, 0.1, desk.group.position.z);
          positions.setXYZ(1, parentDesk.group.position.x, 0.1, parentDesk.group.position.z);
          positions.needsUpdate = true;
          desk.parentLine.computeLineDistances();
        }
      }
    }
  }

  /** Get desk position for external use (e.g. particle targeting). */
  getDeskPosition(agentId: string): THREE.Vector3 | null {
    const desk = this.desks.get(agentId);
    return desk ? desk.group.position.clone() : null;
  }

  /** Raycasting for click detection. */
  getIntersectedDesk(raycaster: THREE.Raycaster): string | null {
    for (const [agentId, desk] of this.desks.entries()) {
      const intersects = raycaster.intersectObject(desk.group, true);
      if (intersects.length > 0) {
        return agentId;
      }
    }
    return null;
  }

  dispose(): void {
    console.warn('[DeskMgr] dispose: cleaning up', this.desks.size, 'desks');
    for (const [agentId, desk] of this.desks.entries()) {
      this.cleanupDesk(agentId, desk);
    }

    // Dispose shared geometries
    this.deskSurfaceGeo.dispose();
    this.legGeo.dispose();
    this.monitorGeo.dispose();
    this.monitorStandGeo.dispose();
    this.chairSeatGeo.dispose();
    this.chairBackGeo.dispose();
    this.avatarGeo.dispose();
    this.statusGeo.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private buildDeskGroup(agentId: string): THREE.Group {
    const group = new THREE.Group();
    const agentColor = this.hashColor(agentId);

    // Desk surface
    const surfaceMat = new THREE.MeshStandardMaterial({
      color: 0xb08860,
      roughness: 0.7,
      metalness: 0.05,
    });
    const surface = new THREE.Mesh(this.deskSurfaceGeo, surfaceMat);
    surface.position.y = 0.75;
    surface.castShadow = true;
    surface.receiveShadow = true;
    group.add(surface);

    // Desk legs
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.6,
      metalness: 0.3,
    });
    const legOffsets = [
      [-0.7, -0.3],
      [0.7, -0.3],
      [-0.7, 0.3],
      [0.7, 0.3],
    ];
    for (const [lx, lz] of legOffsets) {
      const leg = new THREE.Mesh(this.legGeo, legMat);
      leg.position.set(lx, 0.35, lz);
      leg.castShadow = true;
      group.add(leg);
    }

    // Monitor stand
    const standMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.5,
      metalness: 0.4,
    });
    const stand = new THREE.Mesh(this.monitorStandGeo, standMat);
    stand.position.set(0, 0.855, -0.25);
    group.add(stand);

    // Monitor
    const monitorMat = new THREE.MeshStandardMaterial({
      color: 0x0a1628,
      roughness: 0.3,
      metalness: 0.1,
      emissive: 0x1a3a5c,
      emissiveIntensity: 0.4,
    });
    const monitor = new THREE.Mesh(this.monitorGeo, monitorMat);
    monitor.position.set(0, 1.13, -0.25);
    monitor.castShadow = true;
    monitor.name = 'monitor-screen';
    group.add(monitor);

    // Chair seat
    const chairMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.8,
      metalness: 0.1,
    });
    const seat = new THREE.Mesh(this.chairSeatGeo, chairMat);
    seat.position.set(0, 0.5, 0.5);
    seat.castShadow = true;
    group.add(seat);

    // Chair back
    const back = new THREE.Mesh(this.chairBackGeo, chairMat);
    back.position.set(0, 0.72, 0.72);
    back.castShadow = true;
    group.add(back);

    // Agent avatar (capsule on chair)
    const avatarMat = new THREE.MeshStandardMaterial({
      color: agentColor,
      roughness: 0.5,
      metalness: 0.2,
    });
    const avatar = new THREE.Mesh(this.avatarGeo, avatarMat);
    avatar.position.set(0, 0.75, 0.5);
    avatar.castShadow = true;
    group.add(avatar);

    // Status indicator (floating sphere above desk)
    const statusMat = new THREE.MeshStandardMaterial({
      color: STATUS_COLORS.spawning,
      emissive: STATUS_COLORS.spawning,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9,
    });
    const statusSphere = new THREE.Mesh(this.statusGeo, statusMat);
    statusSphere.position.set(0, 1.6, 0);
    statusSphere.name = 'status-indicator';
    group.add(statusSphere);

    return group;
  }

  private hashColor(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    // Generate a pleasant hue with decent saturation
    const h = ((hash & 0xff) / 255) * 360;
    const s = 0.5 + ((hash >> 8) & 0xff) / 510; // 0.5-1.0
    const l = 0.4 + ((hash >> 16) & 0xff) / 850; // 0.4-0.7
    const color = new THREE.Color();
    color.setHSL(h / 360, s, l);
    return color.getHex();
  }

  private findParentDesk(agentId: string): DeskInstance | null {
    const desk = this.desks.get(agentId);
    if (!desk?.parentId) return null;
    return this.desks.get(desk.parentId) ?? null;
  }

  private buildNotificationSprite(
    type: 'notification' | 'permission_request' | null,
    message: string | null,
  ): THREE.Sprite {
    const texture = this.renderNotificationTexture(type, message);

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });

    return new THREE.Sprite(material);
  }

  private renderNotificationTexture(
    type: 'notification' | 'permission_request' | null,
    message: string | null,
  ): THREE.Texture {
    // In headless environments (tests), fall back to a 1x1 data texture
    if (typeof document === 'undefined') {
      const data = new Uint8Array([255, 255, 255, 255]);
      const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
      tex.needsUpdate = true;
      return tex;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Dark semi-transparent background with rounded corners
    const radius = 8;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(256 - radius, 0);
    ctx.quadraticCurveTo(256, 0, 256, radius);
    ctx.lineTo(256, 64 - radius);
    ctx.quadraticCurveTo(256, 64, 256 - radius, 64);
    ctx.lineTo(radius, 64);
    ctx.quadraticCurveTo(0, 64, 0, 64 - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(15, 15, 25, 0.85)';
    ctx.fill();

    // Colored left accent bar
    const accentColor = type === 'permission_request' ? '#ef4444' : '#fb923c';
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(6, 0);
    ctx.lineTo(6, 64);
    ctx.lineTo(radius, 64);
    ctx.quadraticCurveTo(0, 64, 0, 64 - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();

    // Label text
    const label = type === 'permission_request' ? 'Permission Required' : 'Needs Input';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, 16, 26);

    // Truncated message text
    if (message) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#9ca3af';
      const truncated = message.length > 35 ? message.slice(0, 32) + '...' : message;
      ctx.fillText(truncated, 16, 48);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private cleanupDesk(agentId: string, desk: DeskInstance): void {
    console.warn('[DeskMgr] cleanupDesk: fully removing', agentId);

    // Dispose notification sprite if present
    if (desk.notificationSprite) {
      desk.group.remove(desk.notificationSprite);
      (desk.notificationSprite.material as THREE.SpriteMaterial).map?.dispose();
      (desk.notificationSprite.material as THREE.SpriteMaterial).dispose();
      desk.notificationSprite = null;
    }

    this.scene.remove(desk.group);

    // Dispose desk-specific materials
    desk.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });

    if (desk.parentLine) {
      this.scene.remove(desk.parentLine);
      desk.parentLine.geometry.dispose();
      desk.parentLineMaterial?.dispose();
    }

    this.layoutEngine.removeNode(agentId);
    this.desks.delete(agentId);
  }
}
