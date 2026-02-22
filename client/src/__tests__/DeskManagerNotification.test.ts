import { describe, test, expect, beforeEach } from 'bun:test';
import * as THREE from 'three';
import { DeskManager } from '../scene/DeskManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDeskManager(): { scene: THREE.Scene; dm: DeskManager } {
  const scene = new THREE.Scene();
  const dm = new DeskManager(scene);
  return { scene, dm };
}

function addDeskAndSpawn(dm: DeskManager, agentId = 'agent-1'): void {
  dm.addDesk(agentId);
  // Advance spawn animation to completion so desk is fully visible
  dm.update(1.0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeskManager notification popup', () => {
  let scene: THREE.Scene;
  let dm: DeskManager;

  beforeEach(() => {
    ({ scene, dm } = createDeskManager());
  });

  // =========================================================================
  // showNotification
  // =========================================================================

  describe('showNotification()', () => {
    test('adds a notification sprite to the desk group', () => {
      addDeskAndSpawn(dm);
      dm.showNotification('agent-1', 'notification', 'Needs input');

      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup');
      expect(sprite).toBeDefined();
      expect(sprite).toBeInstanceOf(THREE.Sprite);
    });

    test('positions notification sprite above status indicator (y >= 2.0)', () => {
      addDeskAndSpawn(dm);
      dm.showNotification('agent-1', 'notification', 'Needs input');

      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as THREE.Sprite;
      expect(sprite.position.y).toBeGreaterThanOrEqual(2.0);
    });

    test('scales notification sprite to readable size', () => {
      addDeskAndSpawn(dm);
      dm.showNotification('agent-1', 'notification', 'Needs input');

      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as THREE.Sprite;
      expect(sprite.scale.x).toBeGreaterThan(1.0);
      expect(sprite.scale.y).toBeGreaterThan(0.2);
    });

    test('sprite material starts with opacity 0 for fade-in', () => {
      addDeskAndSpawn(dm);
      dm.showNotification('agent-1', 'notification', 'Needs input');

      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as THREE.Sprite;
      const material = sprite.material as THREE.SpriteMaterial;
      expect(material.opacity).toBe(0);
      expect(material.transparent).toBe(true);
    });

    test('no-ops for unknown agent', () => {
      expect(() => dm.showNotification('nonexistent', 'notification', 'hi')).not.toThrow();
    });

    test('replaces existing notification if called again', () => {
      addDeskAndSpawn(dm);
      dm.showNotification('agent-1', 'notification', 'First');
      dm.showNotification('agent-1', 'permission_request', 'Second');

      const group = dm.getDeskGroup('agent-1')!;
      const sprites = group.children.filter((c) => c.name === 'notification-popup');
      expect(sprites.length).toBe(1);
    });
  });

  // =========================================================================
  // hideNotification
  // =========================================================================

  describe('hideNotification()', () => {
    test('starts fade-out on the notification sprite', () => {
      addDeskAndSpawn(dm);
      dm.showNotification('agent-1', 'notification', 'Needs input');
      // Advance animation to fully visible
      dm.update(1.0);

      dm.hideNotification('agent-1');
      // After hide is called, the fade progress should start decreasing on next update
      dm.update(0.5);

      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as THREE.Sprite;
      if (sprite) {
        const material = sprite.material as THREE.SpriteMaterial;
        expect(material.opacity).toBeLessThan(1);
      }
    });

    test('removes sprite after fade-out completes', () => {
      addDeskAndSpawn(dm);
      dm.showNotification('agent-1', 'notification', 'Needs input');
      dm.update(1.0); // fade in complete

      dm.hideNotification('agent-1');
      dm.update(2.0); // enough time for fade-out to complete

      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup');
      expect(sprite).toBeUndefined();
    });

    test('no-ops for unknown agent', () => {
      expect(() => dm.hideNotification('nonexistent')).not.toThrow();
    });

    test('no-ops if no notification is showing', () => {
      addDeskAndSpawn(dm);
      expect(() => dm.hideNotification('agent-1')).not.toThrow();
    });
  });

  // =========================================================================
  // update() — notification animation
  // =========================================================================

  describe('update() notification animation', () => {
    test('fade-in: opacity increases from 0 toward 1 over time', () => {
      addDeskAndSpawn(dm);
      dm.showNotification('agent-1', 'notification', 'Needs input');

      dm.update(0.3);

      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as THREE.Sprite;
      const material = sprite.material as THREE.SpriteMaterial;
      expect(material.opacity).toBeGreaterThan(0);
    });

    test('fade-in: opacity reaches 1 after enough time', () => {
      addDeskAndSpawn(dm);
      dm.showNotification('agent-1', 'notification', 'Needs input');

      dm.update(2.0); // plenty of time

      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as THREE.Sprite;
      const material = sprite.material as THREE.SpriteMaterial;
      expect(material.opacity).toBe(1);
    });

    test('gentle bob: sprite y position oscillates over time', () => {
      addDeskAndSpawn(dm);
      dm.showNotification('agent-1', 'notification', 'Needs input');
      dm.update(1.0); // fade in

      const group = dm.getDeskGroup('agent-1')!;
      const sprite = group.getObjectByName('notification-popup') as THREE.Sprite;
      const y1 = sprite.position.y;

      dm.update(0.5); // advance time
      const y2 = sprite.position.y;

      // y should differ due to bob animation
      expect(y1).not.toBe(y2);
    });
  });

  // =========================================================================
  // cleanupDesk disposes notification
  // =========================================================================

  describe('cleanupDesk disposes notification', () => {
    test('notification sprite is removed when desk is cleaned up via despawn', () => {
      addDeskAndSpawn(dm);
      dm.showNotification('agent-1', 'notification', 'Needs input');
      dm.update(1.0); // fade in

      // Trigger despawn
      dm.removeDesk('agent-1');
      dm.update(2.0); // complete despawn animation

      // Desk should be fully gone
      expect(dm.getDeskGroup('agent-1')).toBeNull();
    });
  });
});
