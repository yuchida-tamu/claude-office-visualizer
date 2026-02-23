# Desk/Avatar Separation: Pre-rendered Desks with Dynamic Avatars

## Overview

Separate static office furniture (desk, chair, monitor) from dynamic agent avatars. Desks are pre-rendered at all slot positions on scene init and remain permanently visible. Only avatars spawn/despawn with agent lifecycle events.

## Before → After: DeskManager API

```mermaid
flowchart TB
    subgraph Before["Before: Everything coupled to agent lifecycle"]
        direction TB
        B1["addDesk(agentId)"]
        B2["Builds: desk + monitor + chair + avatar + status indicator"]
        B3["Adds group to scene at slot position"]
        B4["removeDesk(agentId)"]
        B5["Removes entire group from scene"]
        B6["Frees slot in SlotBasedLayout"]
        B1 --> B2 --> B3
        B4 --> B5 --> B6
    end

    subgraph After["After: Static desks + dynamic avatars"]
        direction TB
        A1["initDesks(count)"]
        A2["Pre-renders count desks at slot positions"]
        A3["desk + chair + monitor always visible"]
        A4["spawnAvatar(agentId, parentId?)"]
        A5["Assigns agent to next free desk slot"]
        A6["Clones avatar, adds status indicator"]
        A7["despawnAvatar(agentId)"]
        A8["Removes avatar + status indicator"]
        A9["Frees desk for reuse by next agent"]
        A1 --> A2 --> A3
        A4 --> A5 --> A6
        A7 --> A8 --> A9
    end
```

## Data Model Changes

```mermaid
classDiagram
    class PreRenderedDesk {
        +number slotIndex
        +THREE.Group group
        +THREE.Vector3 position
        +THREE.MeshStandardMaterial monitorMaterial
        +string|null assignedAgentId
        +boolean occupied
    }

    class DeskInstance {
        +THREE.Group group (ref to PreRenderedDesk.group)
        +number slotIndex
        +string|null parentId
        +THREE.Mesh statusIndicator
        +THREE.MeshStandardMaterial statusMaterial
        +THREE.MeshStandardMaterial monitorMaterial (ref)
        +THREE.Group|null avatarClone
        +THREE.Line|null parentLine
        +THREE.LineDashedMaterial|null parentLineMaterial
        +AgentStatus status
        +number spawnProgress
        +boolean despawning
        +number despawnProgress
        +number errorFlashTime
        +THREE.Sprite|null notificationSprite
        +boolean notificationVisible
        +number notificationFadeProgress
    }

    class DeskManager {
        -Map~number, PreRenderedDesk~ preRenderedDesks
        -Map~string, DeskInstance~ desks
        +loadModels() void
        +initDesks(count) void
        +spawnAvatar(agentId, parentId?) void
        +despawnAvatar(agentId) void
        +updateDeskState(agentId, status) void
        +getDeskGroup(agentId) THREE.Group|null
        +getDeskPosition(agentId) THREE.Vector3|null
        +setMonitorGlow(agentId, color, intensity) void
        +resetMonitorGlow(agentId) void
        +triggerErrorFlash(agentId) void
        +showNotification(agentId, type, message) void
        +hideNotification(agentId) void
        +getIntersectedDesk(raycaster) string|null
        +dispose() void
    }

    DeskManager --> PreRenderedDesk : preRenderedDesks
    DeskManager --> DeskInstance : desks (by agentId)
    DeskInstance --> PreRenderedDesk : references slot
```

## Initialization Sequence

```mermaid
sequenceDiagram
    participant SM as SceneManager
    participant DM as DeskManager
    participant GL as GLTFLoader
    participant S as Scene

    SM->>DM: new DeskManager(scene)
    SM->>DM: loadModels()
    DM->>GL: loadAsync(desk.glb, monitor.glb, chair.glb, avatar.glb)
    GL-->>DM: templates loaded

    SM->>DM: initDesks(20)
    loop For each slot 0..19
        DM->>DM: Clone desk + chair + monitor templates
        DM->>DM: Position at slot[i] from SlotBasedLayout
        DM->>S: scene.add(furnitureGroup)
    end
    Note over DM: 20 desks now permanently in scene
```

## Agent Spawn/Despawn Flow

```mermaid
sequenceDiagram
    participant SB as SceneBridge
    participant DM as DeskManager
    participant S as Scene

    Note over SB: Agent appears in store

    SB->>DM: spawnAvatar(agentId, parentId?)
    DM->>DM: Find first free PreRenderedDesk
    DM->>DM: Mark desk as occupied (assignedAgentId = agentId)
    DM->>DM: Clone avatarTemplate
    DM->>DM: Create status indicator sphere
    DM->>DM: Add avatar + indicator to desk group
    DM->>DM: Create DeskInstance referencing the PreRenderedDesk
    DM->>DM: Avatar starts at scale 0, animates to 1

    Note over SB: Agent removed from store

    SB->>DM: despawnAvatar(agentId)
    DM->>DM: Start despawn animation on avatar only
    DM->>DM: On animation complete:
    DM->>DM: Remove avatar + indicator from desk group
    DM->>DM: Remove parent line from scene
    DM->>DM: Mark PreRenderedDesk as free
    DM->>DM: Delete DeskInstance
```

## SceneBridge Changes

```mermaid
flowchart TB
    subgraph BeforeBridge["Before: SceneBridge.syncAgents()"]
        direction TB
        BB1["New agent → deskManager.addDesk(id, parentId)"]
        BB2["Removed agent → deskManager.removeDesk(id)"]
    end

    subgraph AfterBridge["After: SceneBridge.syncAgents()"]
        direction TB
        AB1["New agent → deskManager.spawnAvatar(id, parentId)"]
        AB2["Removed agent → deskManager.despawnAvatar(id)"]
    end
```

## SceneManager Changes

```mermaid
flowchart TB
    subgraph BeforeSM["Before: SceneManager.init()"]
        direction TB
        SM1["officeEnvironment.init()"]
        SM2["deskManager.loadModels()"]
        SM3["toolAnimationManager.loadModels()"]
    end

    subgraph AfterSM["After: SceneManager.init()"]
        direction TB
        SM4["officeEnvironment.init()"]
        SM5["deskManager.loadModels()"]
        SM6["deskManager.initDesks(20)"]
        SM7["toolAnimationManager.loadModels()"]
        SM5 --> SM6
    end
```

## Key Design Decisions

| Aspect | Decision |
|--------|----------|
| Pre-rendered count | 20 desks (slot 0 center + ring 1 (8) + ring 2 first 11) — configurable via `initDesks(count)` |
| Desk occupancy | PreRenderedDesk tracks `assignedAgentId` and `occupied` flag |
| Avatar animation | Only avatar + status indicator animate on spawn/despawn, desk furniture stays at full scale |
| Slot assignment | Uses SlotBasedLayout internally — agent→slot mapping for avatars only |
| Monitor glow | Works per-desk via PreRenderedDesk.monitorMaterial — same API, but referenced through DeskInstance |
| Backward compat | `addDesk`/`removeDesk` deprecated in favor of `spawnAvatar`/`despawnAvatar` |
| Click detection | `getIntersectedDesk` checks all pre-rendered desk groups but only returns agentId for occupied desks |
| Dispose | Pre-rendered desks are cleaned up in `dispose()` along with any active agent instances |
