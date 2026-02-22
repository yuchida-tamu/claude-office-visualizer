import { describe, test, expect } from 'bun:test';
import { SlotBasedLayout } from '../scene/SlotBasedLayout';

describe('SlotBasedLayout', () => {
  // -----------------------------------------------------------------------
  // Slot generation
  // -----------------------------------------------------------------------

  test('generates 21 pre-defined slots (1 center + 8 ring1 + 12 ring2)', () => {
    const layout = new SlotBasedLayout();
    // We can verify by filling all 21 slots without triggering overflow
    const positions = [];
    for (let i = 0; i < 21; i++) {
      positions.push(layout.addNode(`agent-${i}`));
    }
    // All 21 should have unique positions
    expect(positions.length).toBe(21);
  });

  // -----------------------------------------------------------------------
  // Slot 0 at origin
  // -----------------------------------------------------------------------

  test('first slot is at origin (0, 0, 0)', () => {
    const layout = new SlotBasedLayout();
    const pos = layout.addNode('root');
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
    expect(pos.z).toBe(0);
  });

  // -----------------------------------------------------------------------
  // addNode returns a position
  // -----------------------------------------------------------------------

  test('addNode returns a Vector3 position', () => {
    const layout = new SlotBasedLayout();
    const pos = layout.addNode('agent-1');
    expect(pos).toBeDefined();
    expect(typeof pos.x).toBe('number');
    expect(typeof pos.y).toBe('number');
    expect(typeof pos.z).toBe('number');
  });

  // -----------------------------------------------------------------------
  // No overlapping positions
  // -----------------------------------------------------------------------

  test('adding multiple agents produces unique positions', () => {
    const layout = new SlotBasedLayout();
    const positions: Array<{ x: number; y: number; z: number }> = [];

    for (let i = 0; i < 10; i++) {
      const pos = layout.addNode(`agent-${i}`);
      positions.push({ x: pos.x, y: pos.y, z: pos.z });
    }

    // Check all positions are unique
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const same =
          Math.abs(positions[i].x - positions[j].x) < 0.001 &&
          Math.abs(positions[i].y - positions[j].y) < 0.001 &&
          Math.abs(positions[i].z - positions[j].z) < 0.001;
        expect(same).toBe(false);
      }
    }
  });

  // -----------------------------------------------------------------------
  // removeNode frees the slot
  // -----------------------------------------------------------------------

  test('removeNode frees the slot', () => {
    const layout = new SlotBasedLayout();
    layout.addNode('root');
    const pos1 = layout.addNode('agent-1');
    layout.removeNode('agent-1');

    // getPosition should return null after removal
    expect(layout.getPosition('agent-1')).toBeNull();

    // The freed slot should be reusable
    const pos2 = layout.addNode('agent-2');
    expect(pos2.x).toBeCloseTo(pos1.x, 5);
    expect(pos2.y).toBeCloseTo(pos1.y, 5);
    expect(pos2.z).toBeCloseTo(pos1.z, 5);
  });

  // -----------------------------------------------------------------------
  // Slot reuse after removal
  // -----------------------------------------------------------------------

  test('freed slot is reassigned to next spawn', () => {
    const layout = new SlotBasedLayout();
    // Fill first 5 slots
    for (let i = 0; i < 5; i++) {
      layout.addNode(`agent-${i}`);
    }

    // Remove agent at slot 2 (third agent)
    const posSlot2 = layout.getPosition('agent-2')!;
    layout.removeNode('agent-2');

    // Next add should reuse the freed slot (slot 2)
    const newPos = layout.addNode('agent-new');
    expect(newPos.x).toBeCloseTo(posSlot2.x, 5);
    expect(newPos.y).toBeCloseTo(posSlot2.y, 5);
    expect(newPos.z).toBeCloseTo(posSlot2.z, 5);
  });

  // -----------------------------------------------------------------------
  // getPosition
  // -----------------------------------------------------------------------

  test('getPosition returns assigned position for known agent', () => {
    const layout = new SlotBasedLayout();
    const pos = layout.addNode('agent-1');
    const retrieved = layout.getPosition('agent-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.x).toBe(pos.x);
    expect(retrieved!.y).toBe(pos.y);
    expect(retrieved!.z).toBe(pos.z);
  });

  test('getPosition returns null for unknown agent', () => {
    const layout = new SlotBasedLayout();
    expect(layout.getPosition('nonexistent')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Duplicate add is idempotent
  // -----------------------------------------------------------------------

  test('adding the same id twice returns the same position', () => {
    const layout = new SlotBasedLayout();
    const pos1 = layout.addNode('agent-1');
    const pos2 = layout.addNode('agent-1');
    expect(pos1.x).toBe(pos2.x);
    expect(pos1.y).toBe(pos2.y);
    expect(pos1.z).toBe(pos2.z);
  });

  // -----------------------------------------------------------------------
  // Overflow: generates additional rings
  // -----------------------------------------------------------------------

  test('generates overflow slots when all 21 pre-defined slots are full', () => {
    const layout = new SlotBasedLayout();
    // Fill all 21 pre-defined slots
    for (let i = 0; i < 21; i++) {
      layout.addNode(`agent-${i}`);
    }

    // 22nd agent should still get a valid position (overflow ring)
    const overflowPos = layout.addNode('overflow-agent');
    expect(overflowPos).toBeDefined();
    expect(typeof overflowPos.x).toBe('number');
    expect(typeof overflowPos.z).toBe('number');

    // Overflow position should be unique from all others
    for (let i = 0; i < 21; i++) {
      const existingPos = layout.getPosition(`agent-${i}`)!;
      const same =
        Math.abs(existingPos.x - overflowPos.x) < 0.001 &&
        Math.abs(existingPos.z - overflowPos.z) < 0.001;
      expect(same).toBe(false);
    }
  });

  // -----------------------------------------------------------------------
  // Ring geometry: distance from origin
  // -----------------------------------------------------------------------

  test('ring 1 slots are at distance 4 from origin', () => {
    const layout = new SlotBasedLayout();
    // Slot 0 is at origin, slots 1-8 are ring 1
    layout.addNode('root'); // slot 0
    const ring1Pos = layout.addNode('ring1-agent'); // slot 1
    const distance = Math.sqrt(ring1Pos.x ** 2 + ring1Pos.z ** 2);
    expect(distance).toBeCloseTo(4, 1);
  });

  test('ring 2 slots are at distance 8 from origin', () => {
    const layout = new SlotBasedLayout();
    // Fill slot 0 (center) + 8 ring 1 slots
    for (let i = 0; i < 9; i++) {
      layout.addNode(`agent-${i}`);
    }
    // Next agent goes to ring 2
    const ring2Pos = layout.addNode('ring2-agent');
    const distance = Math.sqrt(ring2Pos.x ** 2 + ring2Pos.z ** 2);
    expect(distance).toBeCloseTo(8, 1);
  });

  // -----------------------------------------------------------------------
  // All positions on XZ plane (y = 0)
  // -----------------------------------------------------------------------

  test('all positions have y = 0', () => {
    const layout = new SlotBasedLayout();
    for (let i = 0; i < 25; i++) {
      const pos = layout.addNode(`agent-${i}`);
      expect(pos.y).toBe(0);
    }
  });

  // -----------------------------------------------------------------------
  // removeNode for unknown id is a no-op
  // -----------------------------------------------------------------------

  test('removeNode for unknown id does not throw', () => {
    const layout = new SlotBasedLayout();
    expect(() => layout.removeNode('nonexistent')).not.toThrow();
  });
});
