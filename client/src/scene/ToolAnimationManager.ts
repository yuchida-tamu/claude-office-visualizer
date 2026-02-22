import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tool category mapping
// ---------------------------------------------------------------------------

type ToolCategory = 'terminal' | 'search' | 'document' | 'web' | 'default';

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  Bash: 'terminal',
  Read: 'search',
  Grep: 'search',
  Glob: 'search',
  Write: 'document',
  Edit: 'document',
  NotebookEdit: 'document',
  WebFetch: 'web',
  WebSearch: 'web',
};

const CATEGORY_COLORS: Record<ToolCategory, number> = {
  terminal: 0x00ff41,  // Matrix green
  search: 0x60a5fa,    // Blue
  document: 0xfbbf24,  // Amber
  web: 0x38bdf8,       // Cyan
  default: 0x9ca3af,   // Gray
};

function getCategory(toolName: string): ToolCategory {
  return TOOL_CATEGORIES[toolName] ?? 'default';
}

// ---------------------------------------------------------------------------
// Active animation instance
// ---------------------------------------------------------------------------

interface ToolIconInstance {
  group: THREE.Group;
  materials: THREE.Material[];
  category: ToolCategory;
  scaleProgress: number;  // 0→1 fade-in, or 1→0 fade-out
  fading: 'in' | 'out' | 'none';
  errorFlash: boolean;
}

// ---------------------------------------------------------------------------
// ToolAnimationManager
// ---------------------------------------------------------------------------

/**
 * ToolAnimationManager — renders tool-specific 3D icons above active desks.
 *
 * Each tool category gets a distinct geometric icon:
 * - Terminal (Bash): screen with green glow
 * - Search (Read/Grep/Glob): magnifying glass
 * - Document (Write/Edit): paper with pencil
 * - Web (WebFetch/WebSearch): wireframe globe
 * - Default: spinning gear
 *
 * Icons fade in on tool start, bob gently, and fade out on completion.
 */
export class ToolAnimationManager {
  private icons = new Map<string, ToolIconInstance>();
  private elapsedTime = 0;

  // Shared geometries per category — built once
  private geoCache = new Map<ToolCategory, THREE.BufferGeometry[]>();

  constructor(_scene: THREE.Scene) {
    this.buildSharedGeometries();
  }

  /** Start a tool icon animation above a desk group. */
  start(agentId: string, toolName: string, deskGroup: THREE.Group): void {
    // Clean up any existing icon for this agent
    this.stop(agentId);

    const category = getCategory(toolName);
    const color = CATEGORY_COLORS[category];

    const group = this.buildIcon(category, color);
    group.position.set(0.4, 1.5, -0.25);
    group.scale.setScalar(0); // Start invisible for fade-in
    deskGroup.add(group);

    const materials: THREE.Material[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        const mat = child.material;
        if (Array.isArray(mat)) {
          materials.push(...mat);
        } else {
          materials.push(mat);
        }
      }
    });

    this.icons.set(agentId, {
      group,
      materials,
      category,
      scaleProgress: 0,
      fading: 'in',
      errorFlash: false,
    });
  }

  /** Fade out and remove the tool icon. If failed=true, flash red first. */
  stop(agentId: string, failed = false): void {
    const icon = this.icons.get(agentId);
    if (!icon) return;

    if (failed) {
      icon.errorFlash = true;
      // Flash red then fade out
      for (const mat of icon.materials) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissive.setHex(0xef4444);
          mat.emissiveIntensity = 1.0;
        }
      }
    }

    icon.fading = 'out';
  }

  /** Called each frame. */
  update(deltaTime: number): void {
    this.elapsedTime += deltaTime;

    for (const [agentId, icon] of this.icons) {
      // Fade-in animation
      if (icon.fading === 'in') {
        icon.scaleProgress = Math.min(icon.scaleProgress + deltaTime / 0.3, 1);
        const t = easeOutCubic(icon.scaleProgress);
        icon.group.scale.setScalar(t);
        if (icon.scaleProgress >= 1) {
          icon.fading = 'none';
        }
      }

      // Fade-out animation
      if (icon.fading === 'out') {
        icon.scaleProgress = Math.max(icon.scaleProgress - deltaTime / 0.3, 0);
        const t = easeOutCubic(icon.scaleProgress);
        icon.group.scale.setScalar(t);
        if (icon.scaleProgress <= 0) {
          this.removeIcon(agentId, icon);
          continue;
        }
      }

      // Bobbing animation (sin wave, amplitude 0.1)
      icon.group.position.y = 1.5 + Math.sin(this.elapsedTime * 2) * 0.1;

      // Gentle rotation
      icon.group.rotation.y += deltaTime * 1.5;
    }
  }

  dispose(): void {
    for (const [agentId, icon] of this.icons) {
      this.removeIcon(agentId, icon);
    }
    for (const geos of this.geoCache.values()) {
      for (const geo of geos) {
        geo.dispose();
      }
    }
    this.geoCache.clear();
  }

  // ---------------------------------------------------------------------------
  // Private — icon builders
  // ---------------------------------------------------------------------------

  private buildSharedGeometries(): void {
    // Terminal: screen box + frame
    this.geoCache.set('terminal', [
      new THREE.BoxGeometry(0.22, 0.16, 0.02),    // screen
      new THREE.BoxGeometry(0.26, 0.20, 0.01),    // frame (behind screen)
    ]);

    // Search: torus lens + cylinder handle
    this.geoCache.set('search', [
      new THREE.TorusGeometry(0.08, 0.015, 8, 16), // lens ring
      new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8), // handle
    ]);

    // Document: plane page + cylinder pencil
    this.geoCache.set('document', [
      new THREE.PlaneGeometry(0.16, 0.22),          // page
      new THREE.CylinderGeometry(0.01, 0.01, 0.14, 6), // pencil
    ]);

    // Web: sphere with wireframe
    this.geoCache.set('web', [
      new THREE.SphereGeometry(0.1, 12, 8),         // globe
      new THREE.SphereGeometry(0.105, 8, 6),         // wireframe overlay
    ]);

    // Default: torus gear
    this.geoCache.set('default', [
      new THREE.TorusGeometry(0.09, 0.025, 6, 8),   // gear ring
    ]);
  }

  private buildIcon(category: ToolCategory, color: number): THREE.Group {
    const group = new THREE.Group();
    const geos = this.geoCache.get(category) ?? this.geoCache.get('default')!;

    switch (category) {
      case 'terminal':
        this.buildTerminalIcon(group, geos, color);
        break;
      case 'search':
        this.buildSearchIcon(group, geos, color);
        break;
      case 'document':
        this.buildDocumentIcon(group, geos, color);
        break;
      case 'web':
        this.buildWebIcon(group, geos, color);
        break;
      default:
        this.buildDefaultIcon(group, geos, color);
        break;
    }

    return group;
  }

  private buildTerminalIcon(group: THREE.Group, geos: THREE.BufferGeometry[], color: number): void {
    // Frame (dark border)
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.5,
      metalness: 0.3,
    });
    const frame = new THREE.Mesh(geos[1], frameMat);
    group.add(frame);

    // Screen (emissive green)
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x0a1a0a,
      emissive: color,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    const screen = new THREE.Mesh(geos[0], screenMat);
    screen.position.z = 0.01;
    group.add(screen);
  }

  private buildSearchIcon(group: THREE.Group, geos: THREE.BufferGeometry[], color: number): void {
    // Lens ring
    const lensMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.4,
    });
    const lens = new THREE.Mesh(geos[0], lensMat);
    group.add(lens);

    // Handle
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x8b6914,
      roughness: 0.6,
      metalness: 0.2,
    });
    const handle = new THREE.Mesh(geos[1], handleMat);
    handle.position.set(0.06, -0.08, 0);
    handle.rotation.z = Math.PI / 4;
    group.add(handle);
  }

  private buildDocumentIcon(group: THREE.Group, geos: THREE.BufferGeometry[], color: number): void {
    // Page
    const pageMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f0,
      emissive: color,
      emissiveIntensity: 0.15,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const page = new THREE.Mesh(geos[0], pageMat);
    group.add(page);

    // Pencil (diagonal across page)
    const pencilMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4,
      roughness: 0.5,
    });
    const pencil = new THREE.Mesh(geos[1], pencilMat);
    pencil.position.set(0.04, -0.04, 0.02);
    pencil.rotation.z = -Math.PI / 4;
    group.add(pencil);
  }

  private buildWebIcon(group: THREE.Group, geos: THREE.BufferGeometry[], color: number): void {
    // Solid globe
    const globeMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a5c,
      emissive: color,
      emissiveIntensity: 0.3,
      roughness: 0.4,
      transparent: true,
      opacity: 0.7,
    });
    const globe = new THREE.Mesh(geos[0], globeMat);
    group.add(globe);

    // Wireframe overlay
    const wireMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      wireframe: true,
    });
    const wireframe = new THREE.Mesh(geos[1], wireMat);
    group.add(wireframe);
  }

  private buildDefaultIcon(group: THREE.Group, geos: THREE.BufferGeometry[], color: number): void {
    // Gear ring
    const gearMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.5,
    });
    const gear = new THREE.Mesh(geos[0], gearMat);
    group.add(gear);
  }

  private removeIcon(agentId: string, icon: ToolIconInstance): void {
    // Remove from parent (desk group)
    icon.group.parent?.remove(icon.group);
    for (const mat of icon.materials) {
      mat.dispose();
    }
    this.icons.delete(agentId);
  }
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
