# Desk & Tool Icons: GLB Model Replacement

## DeskManager — Before (Procedural) → After (GLB)

```mermaid
flowchart TB
    subgraph Before["Before: buildDeskGroup()"]
        direction TB
        B1["8 shared geometries\n(Box, Cylinder, Capsule, Sphere)"]
        B2["Per-desk materials\n(surface, legs, monitor, chair, avatar, status)"]
        B1 --> B3["Procedural desk assembly\nvia THREE.Mesh"]
    end

    subgraph After["After: GLB models + status indicator"]
        direction TB
        A1["GLTFLoader.loadAsync()\n  desk.glb — table + chair + avatar\n  monitor.glb — monitor with screen"]
        A2["Clone per desk:\n  deskModel.scene.clone()\n  monitorModel.scene.clone()"]
        A3["Find named mesh:\n  'monitor-screen' for glow control"]
        A4["Status indicator\n  (kept procedural — SphereGeometry)"]
        A1 --> A2 --> A3
        A2 --> A4
    end
```

## Model Loading Strategy

```mermaid
sequenceDiagram
    participant SM as SceneManager
    participant DM as DeskManager
    participant GL as GLTFLoader

    SM->>DM: new DeskManager(scene)
    SM->>DM: loadModels() — async, before first addDesk
    DM->>GL: loadAsync('/models/desk.glb')
    GL-->>DM: deskGLTF.scene (template)
    DM->>GL: loadAsync('/models/monitor.glb')
    GL-->>DM: monitorGLTF.scene (template)
    DM-->>SM: models ready

    Note over DM: On addDesk(agentId):
    DM->>DM: deskTemplate.clone()
    DM->>DM: monitorTemplate.clone()
    DM->>DM: Find 'monitor-screen' mesh
    DM->>DM: Add status indicator sphere
    DM->>DM: Assemble into group
```

## ToolAnimationManager — Before (Procedural) → After (GLB)

```mermaid
flowchart TB
    subgraph BeforeTools["Before: buildSharedGeometries()"]
        direction TB
        T1["terminal: BoxGeometry × 2"]
        T2["search: TorusGeometry + CylinderGeometry"]
        T3["document: PlaneGeometry + CylinderGeometry"]
        T4["web: SphereGeometry × 2"]
        T5["default: TorusGeometry"]
    end

    subgraph AfterTools["After: Pre-loaded GLB templates"]
        direction TB
        G1["icon_terminal.glb"]
        G2["icon_serch.glb"]
        G3["icon_document.glb"]
        G4["icon_web.glb"]
        G5["icon_gear.glb"]
        G1 --> C["Clone on start()\nApply category color\nto all MeshStandardMaterials"]
        G2 --> C
        G3 --> C
        G4 --> C
        G5 --> C
    end
```

## Key Decisions

| Aspect | Decision |
|--------|----------|
| Loading | Models loaded once via async `loadModels()`, called from `SceneManager.init()` |
| Cloning | `gltf.scene.clone()` per desk / per tool icon start |
| Monitor screen | The GLB `monitor.glb` must have a mesh named `monitor-screen` for emissive glow control |
| Status indicator | Kept as procedural SphereGeometry (needs dynamic color/emissive per frame) |
| Desk shared geometries | Removed — no more BoxGeometry, CylinderGeometry, CapsuleGeometry |
| Tool shared geometries | Removed — no more procedural icon construction |
| Shadows | Traverse cloned models, set receiveShadow/castShadow on all meshes |
| Color application | Tool icons: traverse meshes, set emissive to category color |
| Dispose | Traverse clones and dispose geometries + materials |
