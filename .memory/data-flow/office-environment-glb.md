# Office Environment: GLB Model Replacement

## Before (Procedural Geometry)

```mermaid
flowchart TB
    subgraph OfficeEnvironment["OfficeEnvironment.init()"]
        direction TB
        floor["createFloor()\nPlaneGeometry(30,30)\ncolor: 0xc4956a"]
        grid["createGridOverlay()\nGridHelper(30,30)\nopacity: 0.1"]
        walls["createWalls()\n3x BoxGeometry\nback/left/right"]
        lighting["createLighting()\nAmbientLight\nDirectionalLight (shadows)\nHemisphereLight"]
    end

    OfficeEnvironment --> scene["THREE.Scene"]
```

## After (GLB Model + Procedural Lighting)

```mermaid
flowchart TB
    subgraph OfficeEnvironment["OfficeEnvironment.init() — async"]
        direction TB
        loadModel["loadModel()\nGLTFLoader → assets/models/office.glb\nTraverse meshes:\n  - receiveShadow = true\n  - castShadow = true"]
        lighting["createLighting()\nAmbientLight (0xfff5e6, 0.4)\nDirectionalLight (0xfff0d6, 0.8)\n  pos: (8,12,5), shadow 2048px\nHemisphereLight (0x87ceeb, 0xc4956a, 0.3)"]
    end

    glb["assets/models/office.glb\n(floor, walls, props)"] --> loadModel
    loadModel --> scene["THREE.Scene"]
    lighting --> scene
```

## Changes

| Component | Before | After |
|-----------|--------|-------|
| Floor | `PlaneGeometry(30,30)` procedural | Part of `office.glb` |
| Grid overlay | `GridHelper(30,30)` | Removed (part of model or not needed) |
| Walls (3x) | `BoxGeometry` procedural | Part of `office.glb` |
| Lighting | Procedural (3 lights) | **Kept as-is** (model has no lights) |
| `init()` return | `void` (sync) | `Promise<void>` (async GLB load) |
| Dispose | Dispose geometries + materials | Traverse and dispose GLB scene graph |

## Key decisions
- `init()` becomes async — `SceneManager.init()` already returns `Promise<void>`, so awaiting is natural
- Shadow settings applied by traversing all meshes in the loaded model
- GLB is imported as a static asset URL via Vite (`import modelUrl from '...'` or URL string)
- Lighting remains procedural — the model does not include lights
