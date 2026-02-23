import * as THREE from 'three';

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

interface Slot {
  index: number;
  position: THREE.Vector3;
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
    this.slots.push({ index: 0, position: new THREE.Vector3(0, 0, LEADER_Z) });

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
          position: new THREE.Vector3(x, 0, z),
        });
      }

      this.nextRowIndex++;
    }
  }

  addNode(id: string): THREE.Vector3 {
    // Idempotent: if already assigned, return existing position
    const existing = this.assignments.get(id);
    if (existing !== undefined) {
      return this.slots[existing].position.clone();
    }

    // Find first unoccupied slot
    for (const slot of this.slots) {
      if (!this.occupiedSlots.has(slot.index)) {
        this.assignments.set(id, slot.index);
        this.occupiedSlots.add(slot.index);
        return slot.position.clone();
      }
    }

    // All pre-defined slots full — generate overflow row
    this.addGridRows(1);

    const newSlot = this.slots[this.slots.length - DESKS_PER_ROW];
    this.assignments.set(id, newSlot.index);
    this.occupiedSlots.add(newSlot.index);
    return newSlot.position.clone();
  }

  removeNode(id: string): void {
    const slotIndex = this.assignments.get(id);
    if (slotIndex === undefined) return;
    this.occupiedSlots.delete(slotIndex);
    this.assignments.delete(id);
  }

  getPosition(id: string): THREE.Vector3 | null {
    const slotIndex = this.assignments.get(id);
    if (slotIndex === undefined) return null;
    return this.slots[slotIndex].position.clone();
  }
}
