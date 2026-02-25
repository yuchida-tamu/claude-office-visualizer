#!/usr/bin/env bash
set -euo pipefail

REPO="yuchida-tamu/claude-office-visualizer"
PROJECT_NUMBER=5

echo "=== Migrating Linear issues to GitHub ==="

# Helper: create issue, optionally close, add to project
create_issue() {
  local title="$1"
  local labels="$2"
  local body="$3"
  local close="$4"

  echo "Creating: $title"
  local url
  url=$(gh issue create -R "$REPO" --title "$title" --label "$labels" --body "$body" 2>&1)
  local number
  number=$(echo "$url" | grep -o '[0-9]*$')
  echo "  Created #$number"

  if [ "$close" = "yes" ]; then
    gh issue close "$number" -R "$REPO" --reason completed 2>&1 > /dev/null
    echo "  Closed #$number"
  fi

  # Add to project
  gh project item-add "$PROJECT_NUMBER" --owner yuchida-tamu --url "$url" 2>&1 > /dev/null
  echo "  Added to project"
}

# YUC-88
create_issue \
  "Project scaffold: Vite + TS + Three.js + React + Zustand" \
  "priority:critical,enhancement" \
  "> Migrated from Linear: YUC-88

Set up the initial project structure with Vite, TypeScript, Three.js, React 19, and Zustand 5. Configure Bun workspaces with four packages: shared, client, server, and hooks." \
  "yes"

# YUC-89
create_issue \
  "Hooks-based event ingestion (all 12 hook events)" \
  "priority:critical,enhancement" \
  "> Migrated from Linear: YUC-89

Implement all 12 Claude Code hook scripts as TypeScript files executed via Bun. Each hook captures event data from stdin (JSON) and POSTs to the local event server. Fire-and-forget with 5s timeout.

Hook events: SessionStart, SessionEnd, SubagentStart, SubagentStop, PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit, Stop, Notification, PermissionRequest, PreCompact." \
  "yes"

# YUC-90
create_issue \
  "Event server: Bun + SQLite + WebSocket bridge" \
  "priority:critical,enhancement" \
  "> Migrated from Linear: YUC-90

Build the Bun HTTP server that validates incoming events, persists them to SQLite with WAL mode, and broadcasts to WebSocket clients. On client subscribe, send up to 500 historical events in chronological order." \
  "yes"

# YUC-91
create_issue \
  "3D scene: office environment, desk layout, camera controls" \
  "priority:critical,enhancement" \
  "> Migrated from Linear: YUC-91

Implement the Three.js 3D scene with:
- Dark midnight office environment with 13-light setup
- Slot-based grid desk layout (SlotBasedLayout)
- Orbit/zoom/focus camera controls (CameraController)
- SceneBridge to connect React/Zustand state to Three.js rendering" \
  "yes"

# YUC-92
create_issue \
  "Agent lifecycle visualization: spawn/despawn + tool call animations" \
  "priority:critical,enhancement" \
  "> Migrated from Linear: YUC-92

Visualize agent lifecycle in the 3D scene:
- Agent spawn: desk materializes with avatar at assigned grid slot
- Agent despawn: avatar fades out after completion animation
- Tool calls: tool-type-specific icons appear above active desks
- Status colors: spawning (blue), active (green), thinking (purple), tool_executing (cyan), waiting (orange), completed (gray)" \
  "yes"

# YUC-93
create_issue \
  "Message flow particles (inter-agent communication)" \
  "priority:critical,enhancement" \
  "> Migrated from Linear: YUC-93

Implement ParticleSystem for visualizing inter-agent communication. Messages between agents (via Task/SendMessage tool calls) are rendered as glowing particles traveling along arced paths between desks." \
  "yes"

# YUC-94
create_issue \
  "Zustand state manager: event correlation, timing, world state" \
  "priority:critical,enhancement" \
  "> Migrated from Linear: YUC-94

Build the Zustand store as single source of truth:
- WebSocket connection management with stale connection guards
- Event processing with history replay vs live event distinction
- Agent tree construction from events
- Thinking state inference (3s idle threshold)
- Connection epoch for invalidating orphaned timers
- cleanupStaleAgents for post-replay cleanup" \
  "yes"

# YUC-95
create_issue \
  "HTML overlay panel with agent details" \
  "priority:high,enhancement" \
  "> Migrated from Linear: YUC-95

Add React-rendered HTML overlay panels:
- GlobalHUD: session statistics, active agent count, event throughput
- AgentDetailPanel: detailed view of selected agent (status, tool calls, task description)" \
  "yes"

# YUC-96
create_issue \
  'Root agent shows "Thinking" instead of "Waiting" after reload' \
  "priority:medium,bug" \
  '> Migrated from Linear: YUC-96

After page reload, the root agent incorrectly shows "Thinking" status instead of "Waiting". The thinking timer compares against stale historical timestamps from replay events. Fix: reset lastEventTimeByAgent timestamps to Date.now() after history replay completes.' \
  "yes"

# YUC-97
create_issue \
  "Subagent spawn location broken: parent_session_id always null" \
  "priority:high,bug" \
  "> Migrated from Linear: YUC-97

Sub-agents spawn at incorrect positions because \`parent_session_id\` is always null in hook data. Claude Code does not provide this field. Fix: derive parent from \`data.parent_session_id ?? data.session_id\` in the subagent-start hook, and use \`event.parent_session_id ?? event.session_id\` as parent lookup in the store." \
  "yes"

# YUC-98 (DO NOT CLOSE)
create_issue \
  "WebGL fallback for browsers without WebGPU support" \
  "priority:low,enhancement" \
  "> Migrated from Linear: YUC-98

Ensure the application gracefully handles browsers that do not support WebGPU by falling back to WebGL. Currently the renderer uses WebGLRenderer which provides broad compatibility, but this issue tracks adding explicit detection and user-facing messaging." \
  "no"

# YUC-99
create_issue \
  "Create Blender model: Agent desk workstation" \
  "priority:high,enhancement" \
  "> Migrated from Linear: YUC-99

Design and create a custom Blender GLB model for the agent desk workstation. Low-poly stylized geometry with dark midnight aesthetic. Includes desk surface, monitor, and keyboard." \
  "yes"

# YUC-100
create_issue \
  "Create Blender model: Agent avatar character" \
  "priority:high,enhancement" \
  "> Migrated from Linear: YUC-100

Design and create a custom Blender GLB model for the agent avatar character. Low-poly stylized humanoid that spawns/despawns with agent lifecycle. Should visually communicate agent status through material/color changes." \
  "yes"

# YUC-101
create_issue \
  "Create Blender models: Tool category icons (5 types)" \
  "priority:medium,enhancement" \
  "> Migrated from Linear: YUC-101

Create 5 custom Blender GLB tool icon models for different tool categories:
- File operations (Read, Write, Edit)
- Terminal (Bash)
- Search (Grep, Glob)
- Communication (Task, SendMessage)
- Other/default

Icons appear above agent desks during active tool calls." \
  "yes"

# YUC-102
create_issue \
  "Create Blender model: Office environment (floor, walls)" \
  "priority:low,enhancement" \
  "> Migrated from Linear: YUC-102

Create the custom Blender GLB model for the office environment shell: floor plane, walls, and architectural elements. Dark midnight aesthetic with emissive accent edges." \
  "yes"

# YUC-103
create_issue \
  "Import and replace desk primitives with Blender glb model" \
  "priority:high,enhancement" \
  "> Migrated from Linear: YUC-103

Replace the placeholder primitive geometry for desks with the custom Blender GLB model (from YUC-99). Update DeskManager to load via GLTFLoader and position at grid slots." \
  "yes"

# YUC-104
create_issue \
  "Import and replace agent avatar with Blender glb model" \
  "priority:high,enhancement" \
  "> Migrated from Linear: YUC-104

Replace placeholder avatar geometry with the custom Blender GLB model (from YUC-100). Update DeskManager to spawn/despawn the GLB avatar model with agent lifecycle animations." \
  "yes"

# YUC-105
create_issue \
  "Import and replace tool icons with Blender glb models" \
  "priority:medium,enhancement" \
  "> Migrated from Linear: YUC-105

Replace placeholder tool icon sprites with the 5 custom Blender GLB models (from YUC-101). Update ToolAnimationManager to load and display the correct icon model based on tool category." \
  "yes"

# YUC-106
create_issue \
  "Import and replace office environment with Blender glb model" \
  "priority:low,enhancement" \
  "> Migrated from Linear: YUC-106

Replace the procedurally generated office environment with the custom Blender GLB model (from YUC-102). Update OfficeEnvironment module to load the GLB and configure the 13-light setup to match." \
  "yes"

# YUC-107
create_issue \
  "Package as npm CLI + Claude Code plugin for distribution" \
  "priority:high,enhancement" \
  "> Migrated from Linear: YUC-107

Package the visualizer for portable distribution via two channels:
1. **npm package** (\`claude-visualizer\`): Server, pre-built client assets, CLI with start/stop/status
2. **Claude Code plugin** (\`claude-office-visualizer\`): Pre-bundled hook scripts with \${CLAUDE_PLUGIN_ROOT} paths

See ADR-001 for full architectural decision record." \
  "yes"

# YUC-110
create_issue \
  "Pre-publish polish: fix broken scripts, add README, metadata" \
  "priority:high,bug" \
  "> Migrated from Linear: YUC-110

Pre-publish polish pass:
- Fix broken build and dev scripts
- Add comprehensive README.md
- Complete package.json metadata (description, keywords, repository, license)
- Verify all npm scripts work end-to-end" \
  "yes"

echo ""
echo "=== All 21 issues created ==="
echo ""

# Step 4: Create and pin PRD issue
echo "=== Creating PRD issue ==="

PRD_URL=$(gh issue create -R "$REPO" --title "PRD: Claude Code Visualizer (v0.3)" --label "documentation" --body "$(cat <<'PRDEOF'
> Migrated from Linear document: Claude Code Visualizer — Product Requirements Document

| Field | Value |
| -- | -- |
| **Author** | Yuta Uchida |
| **Date** | February 20, 2026 |
| **Version** | 0.3 (Updated to reflect implementation) |
| **Status** | MVP Feature-Complete |
| **GitHub Project** | Claude Code Visualizer |

---

## 1. Executive Summary

Claude Code Visualizer is a companion application that provides a real-time, 3D visualization of Claude Code's internal agent orchestration. When Claude Code works on complex tasks, it spawns sub-agents, issues tool calls, reads and writes files, and coordinates results across an agent tree. Today, this activity is only observable through terminal logs or 2D dashboards. This product renders those interactions as an animated 3D office scene powered by Three.js (WebGL), where each agent is represented as a worker at a desk, messages flow as visual arcs between workers, and tool executions produce contextual animations.

The primary goal is developer insight: understanding how Claude Code decomposes problems, how agents communicate, where bottlenecks occur, and how the overall task progresses. Secondary goals include education, debugging, and shareability (exporting sessions as replays or recordings).

**Prior Art:** disler/claude-code-hooks-multi-agent-observability (1.1k stars on GitHub) provides a 2D Vue dashboard for Claude Code agent monitoring using the hooks API. Our project extends this concept into an immersive 3D experience with spatial understanding of agent hierarchies, while reusing the same proven hooks-based ingestion pattern.

---

## 2. Problem Statement

Claude Code's multi-agent orchestration is opaque. Developers face several challenges:

* **No spatial understanding:** Terminal logs and 2D timelines are linear, but agent activity is hierarchical and concurrent. It's difficult to see which sub-agent is handling which part of a task.
* **Timing is invisible:** There's no sense of how long each agent spends thinking vs. executing tools, or where the pipeline stalls.
* **Communication patterns are hidden:** The data passed between parent and child agents via Task and SendMessage is buried in structured tool-use messages.
* **No post-hoc analysis:** Once a session ends, there's no way to replay and spatially study how agents collaborated.

---

## 3. Target Users

* **Primary:** Developers actively using Claude Code for multi-step coding tasks (especially Agent Teams) who want spatial understanding of their agent workflows.
* **Secondary:** Developer advocates, educators, and content creators who want to demonstrate AI agent orchestration in a visually compelling, shareable way.
* **Tertiary:** Anthropic and tool developers who need rich observability into Claude Code's behavior for testing and evaluation.

---

## 4. Product Vision

The application renders a stylized dark midnight 3D office environment using custom Blender GLB models. Each Claude Code agent occupies a workstation. When Claude Code begins a task:

* A primary agent appears at the central desk and begins working.
* When it spawns a sub-agent via the Task tool, a new desk materializes at a pre-assigned grid slot with a visual parent-child link.
* Tool calls (Bash, Write, Edit, Read, etc.) trigger desk-specific animations: tool-type icons appear above the desk (wrench, file, terminal, etc.), rendered as custom GLB models.
* Messages between agents (SendMessage) are visualized as glowing particles traveling along paths between desks.
* Completed agents fade out and their avatar despawns, while the desk furniture remains pre-rendered in the scene.

The office layout uses a **slot-based grid system**: a leader desk at the front-center and worker desks arranged in rows behind it. Camera controls allow orbit, zoom, and focus on specific agents. An overlay panel shows real-time details: current tool call, active agents, and session statistics.

---

## 5. System Architecture

### 5.1 High-Level Data Flow

```
Claude Code Agents → Hook Scripts (TS) → HTTP POST → Event Server → SQLite + WebSocket → 3D Renderer
```

### 5.2 Event Ingestion Layer (Hooks-Based)

Claude Code provides a comprehensive hooks API with 12 event types that fire at every stage of the agent lifecycle. Our plugin uses command-type hooks implemented as TypeScript scripts executed via Bun. Each hook captures event data from stdin (JSON) and forwards it to our local event server via HTTP POST.

**Available Hook Events (all 12 supported):**

* **SessionStart / SessionEnd:** Agent session lifecycle. Triggers desk creation/destruction.
* **SubagentStart / SubagentStop:** Sub-agent lifecycle. Triggers child desk spawn/despawn animations.
* **PreToolUse:** Fires before any tool executes. Triggers tool animation at the agent's desk.
* **PostToolUse:** Fires after successful tool execution. Triggers "completed" animation.
* **PostToolUseFailure:** Tool execution failed. Triggers error animation (red flash).
* **UserPromptSubmit:** User sends a prompt.
* **Stop:** Main agent considers stopping.
* **Notification:** Claude needs user attention. Triggers floating notification popup.
* **PermissionRequest:** Tool permission dialog. Triggers permission request popup.
* **PreCompact:** Context compaction event.

### 5.3 Event Server

Bun HTTP server that validates events, persists to SQLite (WAL mode), and broadcasts to WebSocket clients. On client connection, sends up to 500 most recent events for history replay.

### 5.4 State Manager

Zustand store that consumes WebSocket events and maintains 3D world state. Key features:

* **History replay vs live**: History events skip animation timers; live events trigger full animations.
* **Auto-recovery**: `ensureAgentExists` auto-creates a root agent when events reference an unknown `session_id`.
* **Thinking inference**: After 3 seconds of inactivity, agent status is inferred as "thinking".
* **Connection epoch guards**: Counter invalidates orphaned `setTimeout` callbacks from stale WebSocket connections.

### 5.5 3D Renderer

Three.js application using **WebGLRenderer**. Key subsystems:

* **OfficeEnvironment**: Custom Blender office GLB with dark midnight aesthetic. 13-light setup: 1 ambient, 1 hemisphere, 2 directional, 9 point lights.
* **DeskManager**: Pre-rendered desk furniture (desk + monitor + chair GLB) at all grid slots. Dynamic avatar GLB models spawn/despawn with agent lifecycle.
* **SlotBasedLayout**: Grid-based positions — leader at `(0, 0, -12)`, workers in rows of 5 behind. Overflow rows generated on demand.
* **ToolAnimationManager**: Tool-type-specific GLB icons above active desks.
* **ParticleSystem**: Message flow particles between agents.
* **CameraController**: Orbit, zoom, and focus controls.
* **SceneBridge**: Bridges React/Zustand and Three.js via requestAnimationFrame diff-and-update loop.

### 5.6 Event Schema

| Event Type | Hook Source | Key Visualization Data |
| -- | -- | -- |
| AgentSpawned | SubagentStart | agent_id, parent session, task description |
| AgentCompleted | SubagentStop | agent_id, transcript path, result |
| ToolCallStarted | PreToolUse | tool_name, tool_input, tool emoji mapping |
| ToolCallCompleted | PostToolUse | tool_name, tool_response, duration |
| ToolCallFailed | PostToolUseFailure | tool_name, error, interrupt status |
| MessageSent | PostToolUse (Task/SendMessage) | from/to agent, content preview |
| SessionStarted | SessionStart | agent_type, model, source |
| SessionEnded | SessionEnd/Stop | reason, summary, transcript |
| UserPrompt | UserPromptSubmit | prompt text, timestamp |
| WaitingForUser | Notification/PermissionRequest | notification_type, message |

---

## 6. Technical Specifications

### 6.1 Rendering Stack

* **Engine:** Three.js (r170+) with WebGLRenderer.
* **Art Style:** Dark midnight office with custom Blender GLB models for all elements. Low-poly stylized geometry with emissive accents and warm point lighting.
* **Text Rendering:** HTML overlay panels via React (GlobalHUD, AgentDetailPanel).
* **3D Assets:** All models authored in Blender, exported as GLB, loaded via GLTFLoader.

### 6.2 Communication Protocol

* **Transport:** WebSocket for real-time event streaming.
* **Persistence:** SQLite (WAL mode) for session replay.
* **Serialization:** JSON with typed event discriminators.

### 6.3 Performance Targets

* 60fps with up to 20 concurrent agents.
* Event ingestion latency under 50ms.
* Initial scene load under 2 seconds.

### 6.4 Browser Support

WebGL 2.0 required (all modern browsers). No WebGPU dependency.

---

## 7. Feature Breakdown and Status

| Feature | Phase | Priority | Status |
| -- | -- | -- | -- |
| Real-time agent spawn/despawn | MVP | P0 | Done |
| Tool call animations (GLB icons) | MVP | P0 | Done |
| Message flow particles | MVP | P0 | Done |
| Orbit/zoom/focus camera | MVP | P0 | Done |
| Hooks-based event ingestion (12 events) | MVP | P0 | Done |
| WebSocket bridge + event server | MVP | P0 | Done |
| Custom Blender GLB models (all elements) | MVP | P0 | Done |
| Dark midnight lighting (13 lights) | MVP | P0 | Done |
| Slot-based grid desk layout | MVP | P0 | Done |
| Desk/avatar separation | MVP | P0 | Done |
| Notification popup for waiting agents | MVP | P0 | Done |
| Auto-recovery for missed events | MVP | P0 | Done |
| History replay with stale agent cleanup | MVP | P0 | Done |
| HTML overlay panel with agent details | MVP | P1 | Done |
| Centralized test infrastructure | MVP | P1 | Done |
| Session replay UI (scrubber) | v1.1 | P1 | Not started |
| Time scaling / playback speed | v1.1 | P1 | Not started |
| Token usage heatmap | v1.1 | P2 | Not started |
| Export session as video/GIF | v2.0 | P2 | Not started |
| Custom office themes | v2.0 | P3 | Not started |
| Multi-user shared viewing | v2.0 | P3 | Not started |

---

## 8. Key Technical Challenges and Resolutions

### 8.1 Thinking State Inference

**Resolved.** Store infers "thinking" status after 3 seconds of inactivity. Root agent shows "waiting" (orange) when idle between turns.

### 8.2 Desk Layout Stability

**Resolved.** Slot-based grid layout (`SlotBasedLayout`) with deterministic positions. Leader at `(0, 0, -12)`, workers in rows of 5. No force-directed physics needed.

### 8.3 Hook Event Ordering

**Resolved.** State manager correlates events using `tool_use_id`. `ensureAgentExists` handles missed events. `AgentCompleted` auto-creates sub-agents when `AgentSpawned` was missed.

### 8.4 History Replay vs Live

**Resolved.** `processEvent(event, eventTime?)` distinguishes replay from live. History replay skips timers. `cleanupStaleAgents()` removes completed sub-agents and orphaned tool calls after replay.

### 8.5 React StrictMode

**Resolved.** `connectionEpoch` counter invalidates orphaned callbacks. Stale WebSocket guards on all handlers.

### 8.6 Bun Test Mock Contamination

**Resolved.** Decoupled `SlotBasedLayout` from THREE.js (uses plain `SlotPosition` interface). Centralized THREE mock via `bunfig.toml` preload. GLTFLoader mocked per-file only.

---

## 9. Design Decisions

### 9.1 Hooks API

All 12 hook events as TypeScript scripts via Bun. Fire-and-forget POST to `localhost:3333/api/events` with 5s timeout.

### 9.2 WebGLRenderer

Broad browser support, sufficient for low-poly scene complexity. No WebGPU dependency.

### 9.3 Custom Blender Pipeline

All scene elements are custom Blender GLB models for cohesive dark midnight aesthetic.

### 9.4 Slot-Based Grid Layout

Deterministic positions eliminate layout instability. Pre-rendered furniture; only avatars animate.

### 9.5 Desk/Avatar Separation

Furniture placed at all grid slots on init. Only avatar models spawn/despawn with agent lifecycle.

### 9.6 MIT License

Open-source from day one. Compatible with Three.js and all asset licenses.

---

## 10. Technology Stack

| Layer | Technology |
| -- | -- |
| 3D Engine | Three.js r170+ with WebGLRenderer |
| Frontend | React 19 + Zustand 5 |
| Event Server | Bun + TypeScript + SQLite (WAL) |
| Hook Scripts | TypeScript via Bun |
| Transport | WebSocket |
| Build | Vite + TypeScript (Bun workspaces) |
| 3D Assets | Custom Blender GLB models |
| Tests | Bun test (centralized THREE mock) |
| Distribution | Claude Code Plugin |
| License | MIT |

---

## 11. Next Steps (Post-MVP)

* Polish: post-processing effects (bloom, ambient occlusion).
* Session replay UI: timeline scrubber, playback speed controls.
* Token usage / context window pressure heatmap.
* Export session as video/GIF.
* Publish to Claude Code plugin registry.
* Community contribution guidelines for custom themes.
PRDEOF
)" 2>&1)

PRD_NUMBER=$(echo "$PRD_URL" | grep -o '[0-9]*$')
echo "Created PRD issue #$PRD_NUMBER"

# Add PRD to project
gh project item-add "$PROJECT_NUMBER" --owner yuchida-tamu --url "$PRD_URL" 2>&1 > /dev/null
echo "Added PRD to project"

# Pin the PRD issue
gh issue pin "$PRD_NUMBER" -R "$REPO" 2>&1
echo "Pinned PRD issue #$PRD_NUMBER"

echo ""
echo "=== Migration complete ==="
