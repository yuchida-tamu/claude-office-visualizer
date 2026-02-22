import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Slot-based layout for agent desk positioning
// ---------------------------------------------------------------------------
// Pre-defines fixed positions in concentric rings. Agents are assigned to
// the next available slot on spawn, and slots are freed on removal.
// No parent lookup needed → no overlap regardless of hook data quirks.
// ---------------------------------------------------------------------------

interface Slot {
  index: number;
  position: THREE.Vector3;
}

export class SlotBasedLayout {
  private slots: Slot[] = [];
  private assignments = new Map<string, number>(); // agentId → slotIndex
  private occupiedSlots = new Set<number>();

  constructor() {
    this.generateSlots();
  }

  private generateSlots(): void {
    // Slot 0: center
    this.slots.push({ index: 0, position: new THREE.Vector3(0, 0, 0) });

    // Ring 1: 8 slots at radius 4, evenly spaced
    this.addRing(4, 8, 0);

    // Ring 2: 12 slots at radius 8, offset by half-step
    const halfStep = Math.PI / 12; // half of (2π / 12)
    this.addRing(8, 12, halfStep);
  }

  private addRing(radius: number, count: number, angleOffset: number): void {
    for (let i = 0; i < count; i++) {
      const angle = angleOffset + (i * Math.PI * 2) / count;
      this.slots.push({
        index: this.slots.length,
        position: new THREE.Vector3(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius,
        ),
      });
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

    // All pre-defined slots full — generate overflow ring
    const overflowRingRadius = 12 + (this.slots.length - 21) / 16 * 4;
    const overflowCount = 16;
    this.addRing(overflowRingRadius, overflowCount, 0);

    // Assign first new overflow slot
    const newSlot = this.slots[this.slots.length - overflowCount];
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
