// ---------------------------------------------------------------------------
// Slot-based layout for agent desk positioning
// ---------------------------------------------------------------------------
// Slot 0: leader desk at the front-center.
// Remaining slots: grid rows behind the leader, evenly spaced.
// Agents are assigned to the next available slot on spawn, and slots are
// freed on removal.
// ---------------------------------------------------------------------------

const DESK_SPACING_X = 7; // horizontal distance between desks
const DESK_SPACING_Z = 6; // depth distance between rows
const DESKS_PER_ROW = 5;  // desks per grid row
const LEADER_Z = -12;     // leader desk z position (front)
const GRID_START_Z = -4;  // first grid row z position (behind leader)

export interface SlotPosition {
  x: number;
  y: number;
  z: number;
}

interface Slot {
  index: number;
  position: SlotPosition;
}

export class SlotBasedLayout {
  private slots: Slot[] = [];
  private assignments = new Map<string, number>(); // agentId → slotIndex
  private occupiedSlots = new Set<number>();
  private nextRowIndex = 0; // tracks how many grid rows have been generated

  constructor() {
    this.generateSlots();
  }

  private generateSlots(): void {
    // Slot 0: leader desk at front-center
    this.slots.push({ index: 0, position: { x: 0, y: 0, z: LEADER_Z } });

    // Grid rows behind the leader
    this.addGridRows(4); // 4 rows × 5 desks = 20 worker slots
  }

  private addGridRows(rowCount: number): void {
    for (let r = 0; r < rowCount; r++) {
      const z = GRID_START_Z + this.nextRowIndex * DESK_SPACING_Z;
      const totalWidth = (DESKS_PER_ROW - 1) * DESK_SPACING_X;
      const startX = -totalWidth / 2;

      for (let col = 0; col < DESKS_PER_ROW; col++) {
        const x = startX + col * DESK_SPACING_X;
        this.slots.push({
          index: this.slots.length,
          position: { x, y: 0, z },
        });
      }

      this.nextRowIndex++;
    }
  }

  addNode(id: string): SlotPosition {
    // Idempotent: if already assigned, return existing position
    const existing = this.assignments.get(id);
    if (existing !== undefined) {
      const p = this.slots[existing].position;
      return { x: p.x, y: p.y, z: p.z };
    }

    // Find first unoccupied slot
    for (const slot of this.slots) {
      if (!this.occupiedSlots.has(slot.index)) {
        this.assignments.set(id, slot.index);
        this.occupiedSlots.add(slot.index);
        const p = slot.position;
        return { x: p.x, y: p.y, z: p.z };
      }
    }

    // All pre-defined slots full — generate overflow row
    this.addGridRows(1);

    const newSlot = this.slots[this.slots.length - DESKS_PER_ROW];
    this.assignments.set(id, newSlot.index);
    this.occupiedSlots.add(newSlot.index);
    const p = newSlot.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  removeNode(id: string): void {
    const slotIndex = this.assignments.get(id);
    if (slotIndex === undefined) return;
    this.occupiedSlots.delete(slotIndex);
    this.assignments.delete(id);
  }

  getPosition(id: string): SlotPosition | null {
    const slotIndex = this.assignments.get(id);
    if (slotIndex === undefined) return null;
    const p = this.slots[slotIndex].position;
    return { x: p.x, y: p.y, z: p.z };
  }
}
