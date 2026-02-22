# Claude Code Visualizer — Architecture Plan

## Executive Summary

Claude Code Visualizer is a companion application that provides real-time 3D visualization of Claude Code's internal agent orchestration. The system uses Claude Code's hook system to capture events, pipes them through a lightweight Bun server with SQLite persistence, and renders an animated 3D office scene in the browser using Three.js with WebGPU.

## Architecture Overview

```
Claude Code Agents
       │
       ▼
Hook Scripts (12 hooks, Bun runtime)
       │ HTTP POST /api/events
       ▼
Event Server (Bun + SQLite WAL)
       │ WebSocket broadcast
       ▼
3D Renderer (Vite + React + Three.js + Zustand)
```

### Data Flow

1. **Hook Capture**: Claude Code fires lifecycle hooks (session, agent, tool, message events)
2. **Event Normalisation**: Hook scripts read stdin JSON, map to typed `VisualizerEvent`, POST to server
3. **Persistence + Broadcast**: Server validates, stores in SQLite (WAL mode), broadcasts via WebSocket
4. **State Derivation**: Client Zustand store receives events, builds agent tree and animation queues
5. **3D Rendering**: Three.js scene renders desks per agent, particle arcs per message, status animations

## Component Breakdown

### shared/ — Type Definitions
- `events.ts`: Discriminated union of 11 event types with a common `EventBase` (id, type, timestamp, session_id)
- `agent.ts`: `AgentNode`, `AgentStatus`, `AgentTree`, `Position3D`, `ActiveToolCall`
- `messages.ts`: `ServerMessage` / `ClientMessage` WebSocket protocol types

### hooks/ — Event Capture (12 scripts)
Each script: reads stdin → constructs typed event → POSTs to server.
- session-start, session-end, stop
- subagent-start, subagent-stop
- pre-tool-use, post-tool-use, post-tool-use-failure
- user-prompt-submit
- notification, permission-request
- pre-compact

### server/ — Event Server
- `index.ts`: Bun.serve with HTTP + WebSocket
- `database.ts`: SQLite WAL, events table, insert/query
- `websocket.ts`: Client tracking, broadcast
- `routes.ts`: POST /api/events, GET /api/health
- `validation.ts`: Runtime event validation

### client/ — 3D Visualizer
- **Scene modules**: SceneManager, OfficeEnvironment, DeskManager, ParticleSystem, CameraController, PostProcessing
- **State**: Zustand store with event ingestion + derived selectors
- **React**: Minimal shell (App → VisualizerCanvas)

## Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| Runtime (server/hooks) | Bun | Fast startup for hooks, native SQLite, native TS |
| Database | SQLite (WAL) | Zero-config, WAL for concurrent reads, bun:sqlite built-in |
| Client bundler | Vite | Fast HMR, React plugin, proxy for dev |
| 3D renderer | Three.js (^0.170) | Mature, WebGPU support, large ecosystem |
| UI framework | React 19 | Minimal shell, potential for HUD overlays |
| State management | Zustand 5 | Lightweight, works outside React for imperative 3D code |
| Transport | WebSocket | Real-time push, low overhead |

## Implementation Phases

### Phase 1: Foundation (Current — Tasks #1, #2)
- Shared type definitions
- Full project scaffold with all directories and stubs
- Dependency installation

### Phase 2: Event Pipeline (Tasks #3, #4)
- Hook scripts with real event mapping
- Event server with SQLite + WebSocket

### Phase 3: State & Scene (Tasks #5, #6)
- Zustand store with event correlation and agent tree derivation
- 3D office scene with procedural desk layout

### Phase 4: Visualisation (Tasks #7, #8)
- Agent lifecycle animations (spawn, status changes, completion)
- Message flow particle system

### Phase 5: Polish (Task #9)
- Integration testing
- Post-processing effects
- Performance optimisation

## Phase 6: HTML Overlay Panels

### Overview

Add HTML overlay panels rendered on top of the Three.js canvas to display:
1. **GlobalHUD** -- always-visible stats bar showing connection status, active agent count, tool call count, messages in flight, and total events processed.
2. **AgentDetailPanel** -- a slide-in panel that appears when a user clicks on an agent's desk, showing that agent's details (id, type, model, status, task description, active tool call, child agents).

### Architecture Decisions

#### Rendering approach: HTML over Canvas (not Three.js text/sprites)
- **Decision**: Use standard React components with CSS positioned absolutely over the `<canvas>` element, rather than Three.js text geometry or HTML-in-CSS3D.
- **Rationale**: HTML/CSS provides superior text rendering, accessibility, responsiveness, and ease of styling. The overlay does not need to be part of the 3D scene graph. Glassmorphism effects (backdrop-filter) work natively in CSS.

#### State flow: Zustand selectors drive React components
- **Decision**: Overlay components subscribe to the existing Zustand store via selectors. No new store is needed.
- **Rationale**: The store already contains all needed data (agents map, focusedAgentId, connectionStatus, active tool calls, active messages). Adding derived selectors keeps the architecture consistent with the existing pattern in `selectors.ts`.

#### Click-to-focus wiring fix
- **Decision**: Modify `SceneManager.onClick()` to call `useVisualizerStore.getState().focusAgent(clickedAgentId)` in addition to (or instead of) directly calling `cameraController.focusOn()`. The `SceneBridge.syncFocus()` already handles camera movement from the store's `focusedAgentId`, so direct camera control in onClick is redundant.
- **Rationale**: Currently `SceneManager.onClick()` moves the camera directly but never updates `focusedAgentId` in the store. The overlay panel needs `focusedAgentId` to know which agent to display. By routing through the store, both camera and panel stay in sync.

#### Close panel behavior
- **Decision**: Clicking the same agent again, clicking empty space, or clicking a close button on the panel all call `focusAgent(null)` to deselect. The `SceneBridge.syncFocus` already calls `cameraController.resetView()` when focusedAgentId becomes null.
- **Rationale**: Consistent UX -- user can dismiss the panel and return to overview.

### Component Structure

```
App.tsx
  +-- VisualizerCanvas (existing -- the <canvas>)
  +-- GlobalHUD (new -- top bar overlay)
  +-- AgentDetailPanel (new -- right-side slide-in overlay)
```

Both overlay components are siblings of `VisualizerCanvas` inside a shared container div. They use `position: absolute` / `pointer-events: none` (with `pointer-events: auto` on interactive elements) so they float over the canvas without intercepting 3D mouse events.

### File Plan

| File | Action | Description |
|---|---|---|
| `client/src/store/selectors.ts` | MODIFY | Add `selectGlobalHUDData` and `selectAgentDetailData` selectors |
| `client/src/components/GlobalHUD.tsx` | CREATE | Top stats bar component |
| `client/src/components/AgentDetailPanel.tsx` | CREATE | Right-side agent detail panel |
| `client/src/components/overlay.css` | CREATE | Shared overlay styles (glassmorphism, layout, animations) |
| `client/src/App.tsx` | MODIFY | Import overlay CSS, wrap canvas + overlays in container div |
| `client/src/scene/SceneManager.ts` | MODIFY | Wire onClick to `focusAgent()` store action, add unfocus on empty click |

### Selector Design

#### `selectGlobalHUDData` (in selectors.ts)
Returns a flat object consumed by GlobalHUD:
```ts
{
  connectionStatus: ConnectionStatus;
  activeAgentCount: number;
  activeToolCallCount: number;
  messagesInFlight: number;
  totalEvents: number;
}
```

#### `selectAgentDetailData` (in selectors.ts)
Returns the focused agent's display data or null:
```ts
{
  agent: AgentNode;
  childAgents: AgentNode[];
} | null
```

### CSS Approach

- **Glassmorphism**: `background: rgba(10, 10, 20, 0.7)` + `backdrop-filter: blur(12px)` + subtle border (`rgba(255,255,255,0.1)`)
- **GlobalHUD**: Fixed to top, full width, 40-48px height, flexbox row with stat items
- **AgentDetailPanel**: Fixed to right side, 320px width, full height minus HUD, slide-in via CSS `transform: translateX()` transition
- **Typography**: System font stack, monospace for IDs/technical values
- **Status colors**: Reuse the same status-to-color mapping as the 3D desk materials (green=active, amber=thinking, blue=tool_executing, gray=waiting, red=error)
- **Responsive**: The panels use fixed pixel widths appropriate for the desktop-only visualizer context

### SceneManager.onClick Modification

Current behavior:
```ts
private onClick(event: MouseEvent): void {
  // ... raycasting ...
  const clickedAgentId = this.deskManager.getIntersectedDesk(this.raycaster);
  if (clickedAgentId) {
    const pos = this.deskManager.getDeskPosition(clickedAgentId);
    if (pos) {
      this.cameraController.focusOn(pos);  // direct camera control
    }
  }
}
```

New behavior:
```ts
private onClick(event: MouseEvent): void {
  // ... raycasting ...
  const clickedAgentId = this.deskManager.getIntersectedDesk(this.raycaster);
  // Route through store -- SceneBridge.syncFocus handles camera movement
  useVisualizerStore.getState().focusAgent(clickedAgentId ?? null);
}
```

This change:
1. Sets `focusedAgentId` in the store so AgentDetailPanel can render
2. Camera focus is handled by SceneBridge.syncFocus (already implemented)
3. Clicking empty space (no desk hit) sets focusedAgentId to null, closing the panel and resetting camera

### Implementation Order

1. **Selectors** (Task #2) -- Add `selectGlobalHUDData` and `selectAgentDetailData` to `selectors.ts`
2. **GlobalHUD** (Task #3) -- Create component + styles for the top stats bar
3. **AgentDetailPanel** (Task #4) -- Create component + styles for the agent detail panel
4. **Wiring** (Task #5) -- Update App.tsx layout, create overlay.css, modify SceneManager.onClick

## Quality Attributes

- **Latency**: Hook → rendered frame < 100ms target
- **Scalability**: Handles 50+ concurrent agents, 1000+ events/min
- **Resilience**: Server down = hooks fail silently (fire-and-forget), client reconnects
- **Maintainability**: Strict TypeScript, shared types, clean separation of concerns

## Risk Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| WebGPU not available | No rendering | Fallback to WebGL renderer |
| Hook latency slows Claude Code | Degraded UX | Async fire-and-forget, no await on POST response |
| SQLite WAL lock contention | Events dropped | Use IMMEDIATE transactions, NORMAL sync |
| Three.js bundle size | Slow load | Tree-shake, lazy load post-processing |
