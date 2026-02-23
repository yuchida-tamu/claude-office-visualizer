import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

const CATEGORY_MODEL_URLS: Record<ToolCategory, string> = {
  terminal: '/models/icon_terminal.glb',
  search: '/models/icon_serch.glb',
  document: '/models/icon_document.glb',
  web: '/models/icon_web.glb',
  default: '/models/icon_gear.glb',
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
 * Each tool category gets a distinct GLB model icon:
 * - Terminal (Bash): icon_terminal.glb
 * - Search (Read/Grep/Glob): icon_serch.glb
 * - Document (Write/Edit): icon_document.glb
 * - Web (WebFetch/WebSearch): icon_web.glb
 * - Default: icon_gear.glb
 *
 * Icons fade in on tool start, bob gently, and fade out on completion.
 */
export class ToolAnimationManager {
  private icons = new Map<string, ToolIconInstance>();
  private elapsedTime = 0;

  // GLB model templates — loaded once, cloned per tool icon
  private modelTemplates = new Map<ToolCategory, THREE.Group>();

  constructor(_scene: THREE.Scene) {}

  /** Load GLB model templates. Must be called before start(). */
  async loadModels(): Promise<void> {
    const loader = new GLTFLoader();
    const categories: ToolCategory[] = ['terminal', 'search', 'document', 'web', 'default'];

    const results = await Promise.all(
      categories.map((cat) => loader.loadAsync(CATEGORY_MODEL_URLS[cat])),
    );

    for (let i = 0; i < categories.length; i++) {
      this.modelTemplates.set(categories[i], results[i].scene);
    }
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
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          materials.push(...mat);
        } else {
          materials.push(mat as THREE.Material);
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
    this.modelTemplates.clear();
  }

  // ---------------------------------------------------------------------------
  // Private — icon builders
  // ---------------------------------------------------------------------------

  private buildIcon(category: ToolCategory, color: number): THREE.Group {
    const template = this.modelTemplates.get(category) ?? this.modelTemplates.get('default');

    if (template) {
      const clone = template.clone();
      // Apply category color as emissive to all meshes
      clone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if ((mesh.material as THREE.MeshStandardMaterial).emissive) {
            const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
            mat.emissive.setHex(color);
            mat.emissiveIntensity = 0.5;
            mat.side = THREE.DoubleSide;
            mesh.material = mat;
          }
        }
      });
      return clone;
    }

    // Fallback: empty group if models aren't loaded
    return new THREE.Group();
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
