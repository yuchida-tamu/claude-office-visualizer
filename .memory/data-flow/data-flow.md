# Claude Office Visualizer — Data Flow

## End-to-End Pipeline

```mermaid
flowchart LR
    subgraph CC["Claude Code"]
        hooks_trigger["Lifecycle Events"]
    end

    subgraph Hooks["Hook Scripts (hooks/src/)"]
        direction TB
        h1["session-start.ts"]
        h2["session-end.ts"]
        h3["prompt-submit.ts"]
        h4["stop.ts"]
        h5["tool-start.ts"]
        h6["tool-end.ts"]
        h7["tool-error.ts"]
        h8["subagent-start.ts"]
        h9["subagent-stop.ts"]
        h10["notification.ts"]
        h11["spawn.ts"]
        h12["shutdown.ts"]
    end

    subgraph Server["Bun Server (server/src/)"]
        direction TB
        routes["routes.ts\nPOST /api/events"]
        validation["validation.ts\nvalidateEvent()"]
        db["database.ts\nSQLite WAL mode"]
        ws["websocket.ts\nbroadcast()"]
    end

    subgraph Client["React Client (client/src/)"]
        direction TB
        store["Zustand Store\nuseVisualizerStore.ts"]
        react["React Components\nGlobalHUD, AgentDetailPanel"]
        scene["3D Scene\nSceneBridge + SceneManager"]
    end

    hooks_trigger --> Hooks
    Hooks -- "HTTP POST JSON\n(fire & forget, 5s timeout)" --> routes
    routes --> validation
    validation --> db
    validation --> ws
    ws -- "WebSocket\n{type:'event', data}" --> store
    db -- "WebSocket subscribe\n{type:'history', data:[...]}" --> store
    store -- "Zustand selectors\n(useShallow)" --> react
    store -- "SceneBridge.sync()\nevery RAF frame" --> scene
```

## Event Type Mapping

```mermaid
flowchart LR
    subgraph HookScripts["Hook → Event Type"]
        direction TB
        A1["session-start.ts → SessionStarted"]
        A2["session-end.ts → SessionEnded"]
        A3["prompt-submit.ts → UserPrompt"]
        A4["stop.ts → SessionEnded (reason:'stop')"]
        A5["tool-start.ts → ToolCallStarted"]
        A6["tool-end.ts → ToolCallCompleted"]
        A7["tool-error.ts → ToolCallFailed"]
        A8["subagent-start.ts → AgentSpawned"]
        A9["subagent-stop.ts → AgentCompleted"]
        A10["notification.ts → WaitingForUser"]
        A11["spawn.ts → SpawnEvent"]
        A12["shutdown.ts → ShutdownEvent"]
    end
```

## Hook Script Data Flow (stdin → HTTP POST)

```mermaid
flowchart TB
    stdin["stdin JSON\n(Claude Code hook data)"]
    parse["JSON.parse(stdin)"]
    normalize["Normalize to VisualizerEvent\n- extract session_id\n- extract agent_id\n- map tool names\n- set timestamp"]
    post["HTTP POST to\nlocalhost:3333/api/events"]

    stdin --> parse --> normalize --> post

    subgraph quirks["Data Quirks"]
        direction TB
        Q1["session_id in subagent hooks\n= PARENT session ID"]
        Q2["agent_id in subagent hooks\n= sub-agent's own ID"]
        Q3["parent_session_id not provided\nby Claude Code — derived as\ndata.parent_session_id ?? data.session_id"]
        Q4["stop hook emits SessionEnded\nwith reason:'stop'\n(agent waiting, not finished)"]
    end
```

## Server Processing

```mermaid
flowchart TB
    req["POST /api/events\nJSON body"]
    validate["validateEvent(body)\nZod-like validation\n11 event types"]

    req --> validate
    validate -->|valid| persist["db.insertEvent(event)\nSQLite WAL mode"]
    validate -->|invalid| err400["400 Bad Request"]
    persist --> broadcast["ws.broadcast(event)\nto all connected clients"]

    subgraph WSProtocol["WebSocket Protocol"]
        direction TB
        connect["Client connects"]
        subscribe["Client sends\n{type:'subscribe'}"]
        history["Server responds\n{type:'history', data:[...500 events]}"]
        live["Server broadcasts\n{type:'event', data: VisualizerEvent}"]

        connect --> subscribe --> history
        live
    end

    subgraph DBSchema["SQLite Schema"]
        direction TB
        events_table["events table:\n- id (INTEGER PK)\n- type (TEXT)\n- session_id (TEXT)\n- timestamp (TEXT)\n- data (TEXT JSON)"]
    end
```

## Zustand Store Event Processing

```mermaid
flowchart TB
    event["Incoming VisualizerEvent\nprocessEvent(event, eventTime?)"]

    event --> isReplay{eventTime\nprovided?}
    isReplay -->|yes| replay["History Replay Mode\n- No setTimeout timers\n- Instant state transitions"]
    isReplay -->|no| live["Live Mode\n- Animation timers active\n- connectionEpoch guards"]

    replay --> process
    live --> process

    process["Event Type Switch"]

    process --> SS["SessionStarted\n→ Create root AgentNode\n→ Set rootAgentId\n→ Reset state"]
    process --> SE["SessionEnded\n→ ensureAgentExists()\n→ reason='stop' → waiting\n→ reason=other → completed\n→ Preserve notifications on stop"]
    process --> UP["UserPrompt\n→ ensureAgentExists()\n→ Root → active\n→ Clear thinking timer"]
    process --> TCS["ToolCallStarted\n→ ensureAgentExists()\n→ Agent → tool_executing\n→ Track activeToolCall"]
    process --> TCC["ToolCallCompleted\n→ ensureAgentExists()\n→ Agent → active\n→ Clear activeToolCall\n→ Create message particle"]
    process --> TCF["ToolCallFailed\n→ ensureAgentExists()\n→ Agent → error\n→ Timer: error→active (1500ms)"]
    process --> AS["AgentSpawned\n→ Create sub-agent AgentNode\n→ parent = event.parent_session_id\n  ?? event.session_id\n→ Timer: spawning→active (300ms)"]
    process --> AC["AgentCompleted\n→ Auto-create if missing\n→ Agent → completed\n→ Timer: remove after 500ms"]
    process --> WFU["WaitingForUser\n→ ensureAgentExists()\n→ Agent → waiting\n→ Set notificationMessage\n→ Set notificationType"]

    process --> cleanup["After History Replay:\ncleanupStaleAgents()\n→ Remove completed sub-agents\n→ Remove parent children refs\n→ Clear orphaned activeToolCalls\n→ Remove stale (>60s) non-root agents\n→ Reset timestamps to Date.now()"]
```

## Agent State Lifecycle

```mermaid
stateDiagram-v2
    [*] --> spawning: AgentSpawned
    spawning --> active: Timer 300ms

    active --> tool_executing: ToolCallStarted
    active --> thinking: Client-side inference (3s idle)
    active --> completed: AgentCompleted
    active --> waiting: WaitingForUser

    tool_executing --> active: ToolCallCompleted
    tool_executing --> error: ToolCallFailed

    thinking --> tool_executing: ToolCallStarted
    thinking --> active: UserPrompt
    thinking --> completed: AgentCompleted
    thinking --> waiting: WaitingForUser

    error --> active: Timer 1500ms

    waiting --> active: UserPrompt
    waiting --> tool_executing: ToolCallStarted

    completed --> [*]: Timer 500ms (remove sub-agent)

    note right of thinking
        Client-side only.
        No server event.
        Inferred after 3s
        of no activity.
    end note

    note right of waiting
        Root agent only.
        Set by WaitingForUser event
        or SessionEnded(stop).
        Shows notification popup.
    end note
```

## Client Rendering Pipeline

```mermaid
flowchart TB
    subgraph ZustandStore["Zustand Store (State)"]
        agents["agents: Map<string, AgentNode>"]
        rootId["rootAgentId: string | null"]
        messages["messages: MessageParticle[]"]
        activeTools["activeToolCalls: Map<string, ToolCallInfo>"]
        stats["Stats: agentCount, activeTools,\nmessageCount, eventCount"]
    end

    subgraph ReactLayer["React Layer (HTML Overlays)"]
        hud["GlobalHUD\n- Agent/tool/message/event counts\n- useShallow selectors (prevent 60fps re-renders)"]
        panel["AgentDetailPanel\n- Identity, Status, Tool Call\n- Notification message\n- Task description\n- Parent/Children relationships"]
    end

    subgraph SceneLayer["Three.js Scene (Imperative)"]
        bridge["SceneBridge.sync()\n- Called every RAF frame\n- Diffs Zustand state\n- Imperatively updates scene modules"]

        desk["DeskManager\n- Creates/removes desk groups\n- Updates status indicator color\n- Shows/hides notification sprites\n- 8 shared geometries"]

        tools["ToolAnimationManager\n- 5 tool categories:\n  terminal (cylinder, green)\n  search (cone, blue)\n  document (box, purple)\n  web (sphere, orange)\n  default (octahedron, gray)\n- Spin animation at desk"]

        particles["ParticleSystem\n- Message flow trails\n- Pooled particles (max 200)\n- Bezier curve paths\n- parent→child direction"]

        camera["CameraController\n- Focus on clicked agent\n- Orbit controls\n- Smooth transitions"]

        layout["SlotBasedLayout\n- Slot 0: center (root)\n- Ring 1: 8 slots, radius 4\n- Ring 2: 12 slots, radius 8\n- Overflow: 16 slots/ring"]

        env["OfficeEnvironment\n- Floor, walls, grid\n- Ambient + directional light"]
    end

    agents --> hud
    agents --> panel
    agents --> bridge
    messages --> bridge
    activeTools --> bridge

    bridge --> desk
    bridge --> tools
    bridge --> particles
    bridge --> camera
    layout --> desk
    env
```

## AgentNode Data Model

```mermaid
classDiagram
    class AgentNode {
        +string id
        +string|null parentId
        +string[] children
        +AgentStatus status
        +string agentType
        +string model
        +string|null taskDescription
        +Position position
        +ToolCallInfo|null activeToolCall
        +string|null notificationMessage
        +NotificationType|null notificationType
    }

    class AgentStatus {
        <<enumeration>>
        spawning
        active
        thinking
        tool_executing
        waiting
        error
        completed
    }

    class NotificationType {
        <<enumeration>>
        notification
        permission_request
    }

    class ToolCallInfo {
        +string tool_name
        +string started_at
    }

    class Position {
        +number x
        +number y
        +number z
    }

    AgentNode --> AgentStatus
    AgentNode --> NotificationType
    AgentNode --> ToolCallInfo
    AgentNode --> Position
```

## Key Resilience Patterns

```mermaid
flowchart TB
    subgraph AutoCreate["Auto-Create Missing Agents"]
        E1["Event references unknown session_id"]
        E1 --> ensure["ensureAgentExists()"]
        ensure --> create["Create root AgentNode\nstatus: active\nagentType: unknown"]
        ensure --> setRoot["Set rootAgentId\nif none exists"]
    end

    subgraph StaleGuards["Stale Connection Guards"]
        G1["connectionEpoch counter\ninvalidates orphaned timers"]
        G2["WebSocket guards:\nif (get().websocket !== ws) return"]
        G3["React StrictMode:\ndouble-mount safe"]
    end

    subgraph CleanupPatterns["Cleanup After Replay"]
        C1["Remove completed sub-agents"]
        C2["Clean parent children arrays"]
        C3["Clear orphaned activeToolCalls"]
        C4["Remove stale >60s non-root agents"]
        C5["Reset timestamps to Date.now()"]
    end
```
