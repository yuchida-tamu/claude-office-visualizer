# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules

- **Follow Test-Driven Development (TDD).** For every feature implementation or bug fix, start by writing a failing unit test that specifies the desired behavior. Then write the minimum code to make it pass. Then refactor. Red → Green → Refactor. Do not skip the red step.

## Commands

```bash
# Install dependencies (Bun workspaces)
bun install

# Development — run client and server in separate terminals
bun run dev:server          # Bun server on :3333
bun run dev:client          # Vite dev server on :5173 (proxies /api and /ws to :3333)

# Type checking
bun run typecheck           # Full composite build check (all packages)
cd client && npx tsc --noEmit   # Client only
cd server && npx tsc --noEmit   # Server only

# Production build
bun run build               # Builds shared → client (Vite)
```

No linter is currently configured. Tests use Bun's built-in test runner (`bun test` from `server/`).

## Architecture

Real-time 3D visualization of Claude Code agent orchestration. Four packages in a Bun workspace monorepo:

```
Claude Code hooks → Hook scripts (HTTP POST) → Bun server (SQLite + WebSocket) → React client (Zustand + Three.js)
```

### Event pipeline

1. **Hooks** (`hooks/src/`): 12 scripts mapped to Claude Code lifecycle events in `.claude-plugin/plugin.json`. Each reads stdin JSON, normalizes it into a `VisualizerEvent`, and POSTs to `http://localhost:3333/api/events`. Fire-and-forget with 5s timeout — hooks must never block Claude Code.

2. **Server** (`server/src/`): Bun HTTP server validates events (`validation.ts`), persists to SQLite with WAL mode (`database.ts`), and broadcasts to WebSocket clients (`websocket.ts`). On client subscribe, sends up to 500 historical events.

3. **Shared** (`shared/src/`): TypeScript types shared between all packages — 11 event types as a discriminated union on `type` field (`events.ts`), agent state types (`agent.ts`), and WebSocket message protocol (`messages.ts`).

4. **Client** (`client/src/`): React 19 + Zustand 5 + Three.js. The Zustand store (`store/useVisualizerStore.ts`) is the single source of truth — it manages WebSocket connection, processes events into an agent tree, and drives animations. The 3D scene is **imperatively managed** outside React via `SceneBridge`.

### Client rendering model

The 3D scene is NOT React-managed. Key separation:

- **React** owns: HTML overlays (GlobalHUD, AgentDetailPanel), error boundaries, canvas element lifecycle
- **Three.js** owns: 3D rendering via `SceneManager` and its sub-modules, driven by `requestAnimationFrame`
- **SceneBridge** bridges the two: called every frame from the RAF loop, it diffs Zustand state and imperatively updates DeskManager, ParticleSystem, ToolAnimationManager, and CameraController

The store's `updateAnimations()` is called from `SceneBridge.sync()` every frame to advance message particle progress. This means any Zustand selector returning new object references (like `selectStats`) will trigger re-renders ~60x/sec — always use `useShallow` from `zustand/react/shallow` for object-returning selectors.

### Agent state lifecycle

Agents progress through: `spawning` → `active` → `thinking` (inferred after 3s idle) → `tool_executing` → `completed`. The `thinking` state is client-side inference only — no server event exists for it. The root agent also uses `waiting` (orange) when idle between turns. Completed sub-agents are removed from the store after a 500ms animation delay during live operation. History replay skips all animation timers and lets `cleanupStaleAgents()` handle removal instead.

### History replay vs live events

`processEvent(event, eventTime?)` uses the `eventTime` parameter to distinguish replay from live:
- **History replay** (`eventTime` provided): No `setTimeout` timers are created. Agents go through state transitions instantly. After replay, `cleanupStaleAgents()` removes all completed sub-agents and stale (>60s) non-root agents. Timestamps in `lastEventTimeByAgent` are reset to `Date.now()` to prevent the thinking timer from comparing against stale historical timestamps.
- **Live events** (`eventTime` undefined): Animation timers fire normally (300ms spawn→active, 500ms completed→remove, 1500ms error→active). A `connectionEpoch` counter invalidates orphaned timers from stale WebSocket connections.

### WebSocket protocol

- Client sends `{ type: "subscribe" }` on connect → server responds with `{ type: "history", data: [...] }` (latest 500 events, chronological order)
- Server broadcasts `{ type: "event", data: VisualizerEvent }` for real-time events
- Stale WebSocket guards on all handlers (`onopen`, `onmessage`, `onclose`, `onerror`): `if (get().websocket !== ws) return` — prevents React StrictMode double-mount from processing events on orphaned connections

### Hook data quirks

- **`parent_session_id`**: Claude Code does not provide this field in hook data. The `subagent-start` hook derives it via `data.parent_session_id ?? data.session_id`. In the store, `AgentSpawned` uses `event.parent_session_id ?? event.session_id` as the parent lookup key.
- **`session_id` semantics**: For sub-agent hooks (`subagent-start`, `subagent-stop`), `session_id` is the **parent** session's ID. The sub-agent's own ID is in `agent_id`.
- **`stop` hook vs `session-end` hook**: Both emit `SessionEnded` events. The `stop` hook fires between turns with `reason: "stop"` (agent is waiting, not finished). The `session-end` hook fires at actual session termination with `reason: "normal"`. The store treats `reason === "stop"` as `waiting` status, all other reasons as `completed`.
- **`agent_id` format**: Sub-agent IDs are short hashes (e.g., `a8efeee`), while session IDs are full UUIDs. These never collide.

## Project management

Tasks and issues are tracked in the **Linear** project "Claude Code Visualizer" under the **Yuchida4dev** team. Use the Linear MCP tools to read issues, create new ones, and update status. The PRD and feature breakdown are stored as a Linear document attached to the project.

## Key gotchas

- **React StrictMode** is enabled (`main.tsx`). Effects and renders run twice in dev. WebSocket lifecycle must guard against stale closures. The `connectionEpoch` counter invalidates orphaned `setTimeout` callbacks from the first mount's event processing.
- **History replay must not set timers**: During history replay, `AgentCompleted`/`AgentSpawned`/`ToolCallFailed` handlers skip their `setTimeout` calls. Without this, completed sub-agents get desks created (by SceneBridge on the first RAF after replay), then 500ms later the timers delete them from the store, causing a visual flash of desks appearing and immediately despawning.
- **`cleanupStaleAgents` removes completed sub-agents**: After history replay, all non-root completed agents are removed immediately. This prevents ghost desks from sub-agents whose `AgentCompleted` event was in the history batch.
- **Server returns latest N events, not oldest**: `getEvents()` with `latest: true` uses a subquery (`ORDER BY timestamp DESC LIMIT N`) wrapped in an outer `ORDER BY ASC` to return the most recent events in chronological order.
- **`rootAgentId` always updates**: `SessionStarted` sets `rootAgentId: event.session_id` unconditionally (not `??`), so it always tracks the most recent session. After replay, if the root's last event is >15s stale, its status is set to `waiting`.
- **Vite proxy**: In dev, `/ws` and `/api` are proxied to the Bun server at `:3333` via `vite.config.ts`. Production builds need a reverse proxy or direct connection.
- **`@shared/*` alias**: Resolved by both Vite (`resolve.alias`) and TypeScript (`paths`). Both configs must stay in sync.
- **Composite TypeScript builds**: `shared` is a composite project referenced by `client` and `server`. Run `bun run typecheck` from root for full validation. Root `tsconfig.json` is absent; use per-package `npx tsc --noEmit` instead.
- **Hook scripts use absolute paths** in `.claude/settings.local.json` — these need updating if the repo moves.
