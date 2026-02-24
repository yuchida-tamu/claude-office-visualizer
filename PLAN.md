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

---

## Phase 7: npm CLI + Claude Code Plugin Packaging (YUC-107)

**Data-flow diagram**: `.memory/data-flow/npm-cli-plugin-packaging.md`

### Executive Summary

Package the visualizer for two distribution channels: (1) an npm package with a
`claude-visualizer` CLI that manages the server lifecycle, and (2) a Claude Code
plugin where hooks are auto-installed. The key constraint is that all changes must
preserve the existing development workflow -- `bun run dev:server` and
`bun run dev:client` must continue to work identically.

### Architecture Decisions

#### AD-1: Bun as the production runtime (not Node.js)

- **Decision**: The CLI, server, and hooks all require Bun at runtime. The shebang
  is `#!/usr/bin/env bun`. The package will be published to npm but users must have
  Bun installed.
- **Rationale**: The server uses `bun:sqlite` (a Bun-native module with no Node.js
  equivalent without adding a dependency like `better-sqlite3`). The hooks use
  `Bun.stdin.text()`. Rewriting both for Node.js compatibility would be a large
  effort with no architectural benefit, since Bun is already a project requirement.
- **Trade-off**: Users without Bun cannot use the package. This is acceptable because
  Claude Code itself recommends Bun for hook scripts, and `bun` can be installed
  with a single command (`curl -fsSL https://bun.sh/install | bash`).
- **Alternative rejected**: Adding `better-sqlite3` and replacing `Bun.stdin.text()`
  with Node.js `process.stdin` -- doubles the code surface for marginal reach gain.

#### AD-2: Single Bun process serves both API and static client

- **Decision**: In production mode, the Bun server serves the built client files
  for any request that does not match `/api/*` or `/ws`. There is no separate
  static file server or reverse proxy.
- **Rationale**: Eliminates infrastructure complexity. One port, one process. The
  Three.js client is a handful of JS bundles and GLB models -- Bun.file() serves
  these efficiently with zero configuration.
- **Trade-off**: No CDN, no caching headers by default. Acceptable for a local
  dev tool; can be added later if needed.

#### AD-3: PID file for server lifecycle management

- **Decision**: The CLI writes a PID file to `~/.claude-visualizer/server.pid` on
  `start` and reads it on `stop`/`status`. The server process is spawned detached.
- **Rationale**: Simple, portable, no daemon framework needed. The PID file approach
  is well-understood and sufficient for a single-instance local server.
- **Alternative rejected**: `pm2` or `systemd` integration -- overkill for a local
  dev tool that runs on macOS/Linux developer machines.

#### AD-4: Two plugin.json variants (dev vs distribution)

- **Decision**: The committed `.claude-plugin/plugin.json` uses `${CLAUDE_PLUGIN_ROOT}`
  paths pointing to pre-built `hooks/dist/*.js`. Development uses a local settings
  override (`.claude/settings.local.json`) that points to `hooks/src/*.ts`.
- **Rationale**: The `${CLAUDE_PLUGIN_ROOT}` variable is resolved by Claude Code at
  runtime to the plugin's installation directory. This makes the plugin portable.
  Developers who clone the repo already have `.claude/settings.local.json` with
  absolute paths (as noted in CLAUDE.md "Key gotchas"), so the change to plugin.json
  does not affect their workflow.

#### AD-5: Hook URL resolution order

- **Decision**: `CLAUDE_VISUALIZER_URL` (full URL) takes priority over
  `VISUALIZER_PORT` (port only) which takes priority over the default `:3333`.
- **Rationale**: `CLAUDE_VISUALIZER_URL` allows pointing hooks at a remote server
  or non-standard path. `VISUALIZER_PORT` remains for backward compatibility.
  Both are optional; the default is localhost:3333.

#### AD-6: Database path defaults to ~/.claude-visualizer/data.db in production

- **Decision**: When running from the dist/ bundle (detected by checking if the
  server file is inside a `dist/` directory), the database defaults to
  `~/.claude-visualizer/data.db`. In development (running from `server/src/`),
  it defaults to `visualizer.db` in CWD (existing behavior). An env var
  `VISUALIZER_DB_PATH` overrides both.
- **Rationale**: npm-installed packages should not write to arbitrary CWDs. A
  well-known home directory location is predictable and survives across sessions.

### Phase 7.1: Build Infrastructure

**Goal**: Create build scripts that produce standalone bundles for hooks, server,
and CLI, with all `@shared/*` imports inlined.

#### Files to Create

| File | Description |
|---|---|
| `scripts/build-hooks.ts` | Bun build script that bundles each hook in `hooks/src/*.ts` into `hooks/dist/*.js` as a standalone Bun-target bundle. Uses `Bun.build()` API with `target: 'bun'`, one entry per hook file, `external: []` (nothing external -- all deps inlined). |
| `scripts/build-server.ts` | Bun build script that bundles `server/src/index.ts` into `dist/server/index.js`. Uses `target: 'bun'`, inlines `@shared/*`. |
| `scripts/build-cli.ts` | Bun build script that bundles `cli/src/cli.ts` into `dist/cli.js`. Prepends `#!/usr/bin/env bun` shebang. Makes the file executable (`chmod +x`). |
| `scripts/build-publish.ts` | Orchestrator script that runs all build stages in order: (1) shared types, (2) hooks, (3) client (Vite), (4) server, (5) CLI. Then copies `client/dist/` to `dist/client/`. Validates output structure. |

#### Files to Modify

| File | Change |
|---|---|
| `package.json` | Add scripts: `build:hooks`, `build:server`, `build:cli`, `build:publish`. Add `bin`, `files` fields. Remove `"private": true`. |

#### Detailed Specification: `scripts/build-hooks.ts`

```ts
// Pseudocode -- not actual implementation
import { readdirSync } from 'fs';
import path from 'path';

const HOOKS_SRC = path.resolve(__dirname, '../hooks/src');
const HOOKS_DIST = path.resolve(__dirname, '../hooks/dist');

const entries = readdirSync(HOOKS_SRC)
  .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));

for (const entry of entries) {
  await Bun.build({
    entrypoints: [path.join(HOOKS_SRC, entry)],
    outdir: HOOKS_DIST,
    target: 'bun',
    format: 'esm',
    // No externals -- @shared/* types get inlined/tree-shaken
    // (they are type-only imports so they disappear at build time)
  });
}
```

Key considerations:
- Each hook becomes a standalone `.js` file with zero external imports
- The `@shared/*` imports are type-only in hooks, so they vanish at build time
- The `Bun.stdin.text()` call and `crypto.randomUUID()` are Bun built-ins
- Output filenames must match source filenames (e.g., `session-start.ts` becomes `session-start.js`)

#### Detailed Specification: `scripts/build-server.ts`

```ts
// Pseudocode
await Bun.build({
  entrypoints: ['server/src/index.ts'],
  outdir: 'dist/server',
  target: 'bun',
  format: 'esm',
  // bun:sqlite is a Bun built-in, no need to bundle it
  external: ['bun:sqlite'],
});
```

Key considerations:
- `@shared/events`, `@shared/messages` are value imports in the server (not just types),
  so they must be resolved and inlined by the bundler
- The `bun:sqlite` import is a Bun runtime module and must be marked external
- Output is a single `dist/server/index.js` file

#### Detailed Specification: `scripts/build-publish.ts`

Orchestration order:
1. `rm -rf dist/ hooks/dist/` -- clean previous builds
2. `bun run build:shared` -- tsc for shared types (needed for Vite build)
3. `bun run scripts/build-hooks.ts` -- bundle hooks
4. `bun run --filter client build` -- Vite build (outputs to `client/dist/`)
5. `bun run scripts/build-server.ts` -- bundle server
6. `bun run scripts/build-cli.ts` -- bundle CLI
7. `cp -r client/dist/ dist/client/` -- copy client build into dist/
8. Validate: check that `dist/cli.js`, `dist/server/index.js`, `dist/client/index.html`, and all 12 `hooks/dist/*.js` files exist

#### package.json Changes

```jsonc
{
  "name": "claude-visualizer",           // changed from "claude-office-visualizer"
  // "private": true,                    // REMOVED
  "version": "0.1.0",
  "description": "Real-time 3D visualization of Claude Code agent orchestration",
  "bin": {
    "claude-visualizer": "dist/cli.js"
  },
  "files": [
    "dist/",
    "hooks/dist/",
    ".claude-plugin/"
  ],
  "scripts": {
    // ... existing scripts unchanged ...
    "build:hooks": "bun run scripts/build-hooks.ts",
    "build:server": "bun run scripts/build-server.ts",
    "build:cli": "bun run scripts/build-cli.ts",
    "build:publish": "bun run scripts/build-publish.ts",
    "prepublishOnly": "bun run build:publish"
  },
  "workspaces": ["shared", "client", "server", "hooks"],
  "license": "MIT"
}
```

#### Test Plan (Phase 7.1)

Tests must be written BEFORE implementation (TDD). All test files go in `scripts/__tests__/`.

| Test | Validates |
|---|---|
| `build-hooks.test.ts` | Each of the 12 hook source files produces a corresponding `.js` in `hooks/dist/`. Output files are valid JavaScript (can be parsed). No `@shared/` import statements remain in output. |
| `build-server.test.ts` | `dist/server/index.js` exists after build. File contains no `@shared/` import paths. File contains `bun:sqlite` as an external import. |
| `build-cli.test.ts` | `dist/cli.js` exists, starts with `#!/usr/bin/env bun`, is executable. |
| `build-publish.test.ts` | Full pipeline produces expected directory structure. All expected files exist. |

---

### Phase 7.2: CLI Entry Point

**Goal**: Create `cli/src/cli.ts` that provides `start`, `stop`, and `status`
subcommands for managing the visualizer server as a background process.

#### Files to Create

| File | Description |
|---|---|
| `cli/src/cli.ts` | Main CLI entry point. Parses argv for subcommands. |
| `cli/src/commands/start.ts` | Starts server as detached process, writes PID file, waits for health check. |
| `cli/src/commands/stop.ts` | Reads PID file, kills process, removes PID file. |
| `cli/src/commands/status.ts` | Checks PID file and /api/health, prints server info. |
| `cli/src/paths.ts` | Resolves paths: PID file, database, client assets, server entry. |
| `cli/package.json` | Package manifest for the cli workspace. |
| `cli/tsconfig.json` | TypeScript config extending tsconfig.base.json. |

#### Detailed Specification: `cli/src/cli.ts`

```ts
// Pseudocode -- argument parsing
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'start':
    await startServer(parseStartOptions(args.slice(1)));
    break;
  case 'stop':
    await stopServer();
    break;
  case 'status':
    await showStatus();
    break;
  default:
    printUsage();
    process.exit(1);
}
```

Options for `start`:
- `--port <number>` -- server port (default: 3333, env: `VISUALIZER_PORT`)
- `--open` -- open browser after server starts
- `--db <path>` -- database file path (default: `~/.claude-visualizer/data.db`)

#### Detailed Specification: `cli/src/commands/start.ts`

```ts
// Pseudocode
async function startServer(options: StartOptions): Promise<void> {
  const dataDir = path.join(os.homedir(), '.claude-visualizer');
  mkdirSync(dataDir, { recursive: true });

  const pidFile = path.join(dataDir, 'server.pid');

  // Check if already running
  if (existsSync(pidFile)) {
    const pid = parseInt(readFileSync(pidFile, 'utf-8'));
    if (isProcessAlive(pid)) {
      console.log(`Server already running (PID ${pid})`);
      return;
    }
    // Stale PID file -- clean up
    unlinkSync(pidFile);
  }

  // Resolve server entry relative to CLI bundle location
  const serverEntry = path.resolve(__dirname, '../server/index.js');

  // Spawn detached server process
  const proc = Bun.spawn(['bun', 'run', serverEntry], {
    env: {
      ...process.env,
      VISUALIZER_PORT: String(options.port),
      VISUALIZER_DB_PATH: options.db || path.join(dataDir, 'data.db'),
      VISUALIZER_CLIENT_DIR: path.resolve(__dirname, '../client'),
    },
    stdio: ['ignore', 'ignore', 'ignore'],
    // Note: Bun.spawn detach behavior -- the child process
    // continues running after the parent exits
  });

  // Write PID file
  writeFileSync(pidFile, String(proc.pid));

  // Wait for server to be healthy
  const healthy = await pollHealth(options.port, 5000);
  if (!healthy) {
    console.error('Server failed to start within 5 seconds');
    process.exit(1);
  }

  const url = `http://localhost:${options.port}`;
  console.log(`Visualizer server running at ${url}`);

  if (options.open) {
    // Open browser (macOS: open, Linux: xdg-open)
    const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    Bun.spawn([openCmd, url]);
  }
}
```

#### Detailed Specification: `cli/src/paths.ts`

```ts
// Resolves paths relative to the built CLI location
import path from 'path';
import os from 'os';

export const DATA_DIR = path.join(os.homedir(), '.claude-visualizer');
export const PID_FILE = path.join(DATA_DIR, 'server.pid');
export const DEFAULT_DB_PATH = path.join(DATA_DIR, 'data.db');

// These are relative to dist/cli.js
export function resolveServerEntry(): string {
  return path.resolve(__dirname, 'server/index.js');
}

export function resolveClientDir(): string {
  return path.resolve(__dirname, 'client');
}
```

Note: `__dirname` in the bundled `dist/cli.js` will resolve to the `dist/` directory,
making `server/index.js` and `client/` relative lookups correct.

#### Workspace Integration

Add `cli` to the root `package.json` workspaces array:
```json
"workspaces": ["shared", "client", "server", "hooks", "cli"]
```

#### Test Plan (Phase 7.2)

| Test | Validates |
|---|---|
| `cli/src/__tests__/paths.test.ts` | `resolveServerEntry()` returns a path ending in `server/index.js`. `resolveClientDir()` returns a path ending in `client`. `DATA_DIR` is under the home directory. |
| `cli/src/__tests__/start.test.ts` | When no PID file exists: spawns process, writes PID file, polls health. When PID file exists and process alive: prints "already running". When PID file exists but process dead: cleans up stale PID and starts fresh. |
| `cli/src/__tests__/stop.test.ts` | Reads PID from file, sends SIGTERM, removes PID file. When no PID file: prints "not running". |
| `cli/src/__tests__/status.test.ts` | When running: fetches /api/health and prints info. When not running: prints "not running". |
| `cli/src/__tests__/cli.test.ts` | Argument parsing: `start --port 4444 --open` yields correct options. Unknown command prints usage and exits 1. |

---

### Phase 7.3: Server Modifications

**Goal**: Add static file serving for the built client (production mode) and
configurable database path. Must not break development mode.

#### Files to Modify

| File | Change |
|---|---|
| `server/src/index.ts` | Read `VISUALIZER_CLIENT_DIR` env var. If set and the directory exists, enable static file serving mode. Pass `clientDir` to `handleRequest`. |
| `server/src/routes.ts` | Add static file serving fallback after API routes. When `clientDir` is provided and the request does not match any API route, attempt to serve the file from `clientDir`. If no file found, serve `index.html` (SPA fallback). |
| `server/src/database.ts` | Modify `initDatabase()` default path: check `VISUALIZER_DB_PATH` env var, then detect production mode, then fall back to CWD `visualizer.db`. Create parent directory if needed. |
| `server/src/static.ts` | **NEW** -- helper module for static file serving: resolve file path, determine MIME type, handle directory index, SPA fallback to index.html. |

#### Detailed Specification: `server/src/static.ts`

```ts
// Pseudocode
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

export async function serveStatic(
  pathname: string,
  clientDir: string,
): Promise<Response | null> {
  // Security: prevent directory traversal
  const resolved = path.resolve(clientDir, '.' + pathname);
  if (!resolved.startsWith(clientDir)) {
    return new Response('Forbidden', { status: 403 });
  }

  const file = Bun.file(resolved);
  if (await file.exists()) {
    const ext = path.extname(resolved);
    return new Response(file, {
      headers: {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      },
    });
  }

  // SPA fallback: serve index.html for non-file paths
  const indexFile = Bun.file(path.join(clientDir, 'index.html'));
  if (await indexFile.exists()) {
    return new Response(indexFile, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  return null;
}
```

#### Detailed Specification: `server/src/routes.ts` Changes

Add at the end of `handleRequest`, before the 404 return:

```ts
// Static file serving (production mode only)
if (clientDir) {
  const staticResponse = await serveStatic(path, clientDir);
  if (staticResponse) return staticResponse;
}

return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
```

The `clientDir` parameter is passed from `index.ts` and is `null` in development.

#### Detailed Specification: `server/src/index.ts` Changes

```ts
const CLIENT_DIR = process.env.VISUALIZER_CLIENT_DIR || null;

// Validate client dir exists if specified
if (CLIENT_DIR && !existsSync(CLIENT_DIR)) {
  console.warn(`Client directory not found: ${CLIENT_DIR}, static serving disabled`);
}

const validClientDir = CLIENT_DIR && existsSync(CLIENT_DIR) ? CLIENT_DIR : null;

// Pass clientDir to handleRequest
return handleRequest(req, db, wsHandler, validClientDir);
```

#### Detailed Specification: `server/src/database.ts` Changes

```ts
export function initDatabase(path?: string): Database {
  const dbPath = path
    || process.env.VISUALIZER_DB_PATH
    || (isProduction() ? defaultProductionDbPath() : 'visualizer.db');

  // Ensure parent directory exists
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  // ... existing WAL setup ...
}

function isProduction(): boolean {
  // Detect if running from dist/ bundle
  return __filename.includes('/dist/') || __filename.includes('\\dist\\');
}

function defaultProductionDbPath(): string {
  return join(homedir(), '.claude-visualizer', 'data.db');
}
```

#### Test Plan (Phase 7.3)

| Test | Validates |
|---|---|
| `server/src/__tests__/static.test.ts` | Serves existing files with correct MIME types. Returns SPA fallback (index.html) for non-existent paths. Blocks directory traversal attempts (`../../../etc/passwd`). Returns null when clientDir has no index.html. Serves `.glb` files with correct MIME type. |
| `server/src/__tests__/routes-static.test.ts` | When clientDir is null (dev mode), non-API paths return 404. When clientDir is set, `/` serves index.html. `/assets/foo.js` serves the file. `/nonexistent` falls back to index.html. API routes still work normally regardless of clientDir. |
| `server/src/__tests__/database-path.test.ts` | Default path is `visualizer.db` when not in production. `VISUALIZER_DB_PATH` env var overrides. Parent directory is created if missing. |

---

### Phase 7.4: Hook Portability

**Goal**: Make all 12 hook scripts use a configurable server URL and update
`plugin.json` for Claude Code plugin distribution.

#### Files to Modify

| File | Change |
|---|---|
| `hooks/src/session-start.ts` | Replace hardcoded URL with `resolveServerUrl()` |
| `hooks/src/session-end.ts` | Same |
| `hooks/src/subagent-start.ts` | Same |
| `hooks/src/subagent-stop.ts` | Same |
| `hooks/src/pre-tool-use.ts` | Same |
| `hooks/src/post-tool-use.ts` | Same |
| `hooks/src/post-tool-use-failure.ts` | Same |
| `hooks/src/user-prompt-submit.ts` | Same |
| `hooks/src/stop.ts` | Same |
| `hooks/src/notification.ts` | Same |
| `hooks/src/permission-request.ts` | Same |
| `hooks/src/pre-compact.ts` | Same |
| `.claude-plugin/plugin.json` | Update commands to use `${CLAUDE_PLUGIN_ROOT}/hooks/dist/*.js` |

#### Files to Create

| File | Description |
|---|---|
| `hooks/src/url.ts` | Shared URL resolution utility: `CLAUDE_VISUALIZER_URL` -> `VISUALIZER_PORT` -> default |

#### Detailed Specification: `hooks/src/url.ts`

```ts
/**
 * Resolves the visualizer server URL for hook event posting.
 *
 * Resolution order:
 * 1. CLAUDE_VISUALIZER_URL env var (full URL, e.g., "http://myhost:4444/api/events")
 * 2. VISUALIZER_PORT env var (port only, constructs localhost URL)
 * 3. Default: http://localhost:3333/api/events
 */
export function resolveServerUrl(): string {
  if (process.env.CLAUDE_VISUALIZER_URL) {
    return process.env.CLAUDE_VISUALIZER_URL;
  }
  const port = process.env.VISUALIZER_PORT || '3333';
  return `http://localhost:${port}/api/events`;
}
```

#### Hook Modification Pattern

Each of the 12 hooks changes from:
```ts
const SERVER_URL = `http://localhost:${process.env.VISUALIZER_PORT || 3333}/api/events`;
```

To:
```ts
import { resolveServerUrl } from './url';

const SERVER_URL = resolveServerUrl();
```

This is a mechanical change applied uniformly to all 12 hooks.

#### plugin.json Update

```json
{
  "name": "claude-code-visualizer",
  "version": "0.1.0",
  "description": "Real-time 3D visualization of Claude Code agent orchestration",
  "hooks": {
    "SessionStart": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/session-start.js" }
    ],
    "SessionEnd": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/session-end.js" }
    ],
    "SubagentStart": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/subagent-start.js" }
    ],
    "SubagentStop": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/subagent-stop.js" }
    ],
    "PreToolUse": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/pre-tool-use.js" }
    ],
    "PostToolUse": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/post-tool-use.js" }
    ],
    "PostToolUseFailure": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/post-tool-use-failure.js" }
    ],
    "UserPromptSubmit": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/user-prompt-submit.js" }
    ],
    "Stop": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/stop.js" }
    ],
    "Notification": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/notification.js" }
    ],
    "PermissionRequest": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/permission-request.js" }
    ],
    "PreCompact": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/pre-compact.js" }
    ]
  }
}
```

#### Development Workflow Preservation

The development workflow must remain unchanged. Currently developers use
`.claude/settings.local.json` which overrides hook commands with absolute paths
to the TypeScript source files. That workflow is unaffected because:

1. `.claude/settings.local.json` overrides `.claude-plugin/plugin.json`
2. The source `.ts` files in `hooks/src/` still exist and still work
3. `bun run dev:server` still runs from TypeScript source
4. The `resolveServerUrl()` change is backward-compatible (defaults are identical)

#### Test Plan (Phase 7.4)

| Test | Validates |
|---|---|
| `hooks/src/__tests__/url.test.ts` | `resolveServerUrl()` returns `CLAUDE_VISUALIZER_URL` when set. Falls back to `VISUALIZER_PORT` when only that is set. Falls back to `http://localhost:3333/api/events` when neither is set. |
| `hooks/src/__tests__/hooks-use-url.test.ts` | Verify all 12 hook source files import from `./url` (static analysis test -- grep for the import statement). |

---

### Phase 7.5: Package Configuration and Final Assembly

**Goal**: Configure package.json for npm publishing, ensure the `files` field
includes everything needed, verify the complete distribution works end-to-end.

#### Files to Modify

| File | Change |
|---|---|
| `package.json` | Final publishing configuration (see below) |

#### Final package.json

```jsonc
{
  "name": "claude-visualizer",
  "version": "0.1.0",
  "description": "Real-time 3D visualization of Claude Code agent orchestration",
  "license": "MIT",
  "bin": {
    "claude-visualizer": "dist/cli.js"
  },
  "files": [
    "dist/",
    "hooks/dist/",
    ".claude-plugin/"
  ],
  "workspaces": [
    "shared",
    "client",
    "server",
    "hooks",
    "cli"
  ],
  "scripts": {
    "dev:client": "bun run --filter client dev",
    "dev:server": "bun run --filter server dev",
    "build": "bun run --filter shared build && bun run --filter client build",
    "build:hooks": "bun run scripts/build-hooks.ts",
    "build:server": "bun run scripts/build-server.ts",
    "build:cli": "bun run scripts/build-cli.ts",
    "build:publish": "bun run scripts/build-publish.ts",
    "prepublishOnly": "bun run build:publish",
    "test": "bun run --filter server test",
    "typecheck": "tsc --build"
  }
}
```

Key changes from current:
- `name`: `"claude-visualizer"` (npm package name, was `"claude-office-visualizer"`)
- `private`: **removed** (was `true`)
- `bin`: new field pointing to `dist/cli.js`
- `files`: new field listing distribution artifacts
- `workspaces`: adds `"cli"`
- `scripts`: adds `build:hooks`, `build:server`, `build:cli`, `build:publish`, `prepublishOnly`

#### What Gets Published to npm

The `files` field ensures only these directories are included in the tarball:
- `dist/cli.js` -- CLI entry point (the `bin` target)
- `dist/server/index.js` -- bundled server
- `dist/client/` -- built React app (HTML, JS, CSS, GLB models)
- `hooks/dist/` -- bundled hook scripts
- `.claude-plugin/plugin.json` -- Claude Code plugin manifest

Everything else (source TypeScript, node_modules, dev configs, tests) is excluded.

#### End-to-End Verification Checklist

After `bun run build:publish`:

1. `dist/cli.js` exists and is executable with correct shebang
2. `dist/server/index.js` exists and has no `@shared/` imports
3. `dist/client/index.html` exists
4. `dist/client/models/*.glb` -- all 10 GLB models present
5. `hooks/dist/*.js` -- all 12 hooks present
6. `.claude-plugin/plugin.json` uses `${CLAUDE_PLUGIN_ROOT}` paths
7. `npm pack --dry-run` shows only expected files
8. Start server via CLI: `bun dist/cli.js start --port 4444`
9. Health check: `curl http://localhost:4444/api/health` returns 200
10. Client served: `curl http://localhost:4444/` returns HTML
11. WebSocket connects: wscat to `ws://localhost:4444/ws`
12. Stop server: `bun dist/cli.js stop`

#### Test Plan (Phase 7.5)

| Test | Validates |
|---|---|
| `scripts/__tests__/package-files.test.ts` | Run `npm pack --dry-run --json` and verify the file list contains exactly the expected entries. No source `.ts` files. No `node_modules`. No test files. |
| Integration test (manual) | Full cycle: build, start, verify health, verify client, verify hooks post events, stop. |

---

### Dependency Map Between Phases

```
Phase 7.1 (Build Infrastructure)
    |
    +--> Phase 7.2 (CLI Entry Point)
    |        |
    |        +--> Phase 7.3 (Server Modifications)
    |                 |
    +--> Phase 7.4 (Hook Portability)  [can run in parallel with 7.2/7.3]
    |
    +--> Phase 7.5 (Package Configuration)  [depends on all above]
```

Phase 7.4 (Hook Portability) has no dependency on Phases 7.2 or 7.3 and can
proceed in parallel. Phase 7.5 integrates everything and cannot begin until
all other phases are complete.

### Risk Assessment (Phase 7 specific)

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Bun.build fails to inline @shared/* imports | Bundled hooks/server have broken imports | Low | Test each bundle by executing it in isolation. Bun.build resolves TypeScript paths natively. |
| PID file becomes stale (process killed without cleanup) | `start` thinks server is running | Medium | `start` command checks if PID is alive before trusting the file. Cleans up stale files. |
| Static file serving introduces path traversal vulnerability | Security issue | Low | `path.resolve()` + `startsWith(clientDir)` guard in `serveStatic`. Test explicitly. |
| GLB models not included in npm tarball | 3D scene broken after install | Low | `files` field includes `dist/client/`. Verify with `npm pack --dry-run`. |
| Bun version mismatch between build and runtime | Runtime errors | Medium | Document minimum Bun version in package.json `engines` field. |
| `__dirname` not available in ESM bundles | Path resolution breaks in CLI | Medium | Bun supports `__dirname` in ESM. Alternatively use `import.meta.dir`. Test explicitly. |
| Development workflow broken by plugin.json change | Developer friction | Low | `.claude/settings.local.json` overrides plugin.json. Existing dev setup unaffected. |

### Assumptions

1. Bun >= 1.0 is installed on the target machine (both build time and runtime)
2. The npm package name `claude-visualizer` is available on the npm registry
3. Claude Code supports `${CLAUDE_PLUGIN_ROOT}` variable expansion in plugin.json
4. Users are on macOS or Linux (the `open`/`xdg-open` browser launch in `start --open`)
5. Port 3333 is available by default (configurable via `--port`)
6. `~/.claude-visualizer/` is writable by the user
