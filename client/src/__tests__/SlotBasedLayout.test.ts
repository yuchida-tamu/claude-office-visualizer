import { describe, test, expect } from 'bun:test';
import { SlotBasedLayout } from '../scene/SlotBasedLayout';

describe('SlotBasedLayout', () => {
  // -----------------------------------------------------------------------
  // Slot generation
  // -----------------------------------------------------------------------

  test('generates 21 pre-defined slots (1 leader + 4 rows × 5)', () => {
    const layout = new SlotBasedLayout();
    const positions = [];
    for (let i = 0; i < 21; i++) {
      positions.push(layout.addNode(`agent-${i}`));
    }
    expect(positions.length).toBe(21);
  });

  // -----------------------------------------------------------------------
  // Slot 0: leader at front-center
  // -----------------------------------------------------------------------

  test('first slot (leader) is at front-center (0, 0, -12)', () => {
    const layout = new SlotBasedLayout();
    const pos = layout.addNode('root');
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
    expect(pos.z).toBe(-12);
  });

  // -----------------------------------------------------------------------
  // addNode returns a position
  // -----------------------------------------------------------------------

  test('addNode returns a position object with x, y, z', () => {
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

    expect(layout.getPosition('agent-1')).toBeNull();

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
    for (let i = 0; i < 5; i++) {
      layout.addNode(`agent-${i}`);
    }

    const posSlot2 = layout.getPosition('agent-2')!;
    layout.removeNode('agent-2');

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
  // Overflow: generates additional rows
  // -----------------------------------------------------------------------

  test('generates overflow slots when all 21 pre-defined slots are full', () => {
    const layout = new SlotBasedLayout();
    for (let i = 0; i < 21; i++) {
      layout.addNode(`agent-${i}`);
    }

    const overflowPos = layout.addNode('overflow-agent');
    expect(overflowPos).toBeDefined();
    expect(typeof overflowPos.x).toBe('number');
    expect(typeof overflowPos.z).toBe('number');

    for (let i = 0; i < 21; i++) {
      const existingPos = layout.getPosition(`agent-${i}`)!;
      const same =
        Math.abs(existingPos.x - overflowPos.x) < 0.001 &&
        Math.abs(existingPos.z - overflowPos.z) < 0.001;
      expect(same).toBe(false);
    }
  });

  // -----------------------------------------------------------------------
  // Grid geometry
  // -----------------------------------------------------------------------

  test('grid row 1 slots are behind the leader (z > leader z)', () => {
    const layout = new SlotBasedLayout();
    const leaderPos = layout.addNode('root'); // slot 0 (leader)
    const row1Pos = layout.addNode('row1-agent'); // slot 1
    expect(row1Pos.z).toBeGreaterThan(leaderPos.z);
  });

  test('grid rows are spaced evenly in z', () => {
    const layout = new SlotBasedLayout();
    // Fill leader + first row (5 desks)
    for (let i = 0; i < 6; i++) {
      layout.addNode(`agent-${i}`);
    }
    // Next agent is in row 2
    const row2Pos = layout.addNode('row2-agent');
    const row1Pos = layout.getPosition('agent-1')!; // first grid row
    expect(row2Pos.z).toBeGreaterThan(row1Pos.z);
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
