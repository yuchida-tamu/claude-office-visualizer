# YUC-107: npm CLI + Claude Code Plugin Packaging -- Test Manual

**Feature**: Package the Claude Code Visualizer for portable distribution via npm CLI and Claude Code plugin.
**Date**: 2026-02-25
**Status**: Pre-implementation (test-first plan)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Automated Tests](#2-automated-tests)
   - 2.1 Build Pipeline Tests
   - 2.2 CLI Tests
   - 2.3 Server Static Serving Tests
   - 2.4 Database Path Configuration Tests
   - 2.5 Hook URL Configuration Tests
   - 2.6 Plugin Manifest Tests
3. [Manual Test Scenarios](#3-manual-test-scenarios)
   - M1: Fresh npm install + start
   - M2: Plugin local testing with --plugin-dir
   - M3: Dev workflow regression
   - M4: Hook-to-server communication with custom port
   - M5: SPA navigation in production mode
   - M6: Database persistence across restarts
   - M7: Stop command cleanup
   - M8: Concurrent session handling
4. [Regression Checklist](#4-regression-checklist)

---

## 1. Overview

This test manual covers the packaging feature that transforms the Claude Code Visualizer monorepo into a distributable npm package with an integrated CLI and Claude Code plugin. The feature introduces:

- A build pipeline (`build:hooks`, `build:server`, `build:publish`) that produces a flat `dist/` directory
- A CLI (`claude-visualizer`) with `start`, `stop`, and `status` subcommands
- A production server mode that serves both the API and the built client as static files
- A `plugin.json` using `${CLAUDE_PLUGIN_ROOT}` for portable hook paths
- Configurable server URL in hooks via `CLAUDE_VISUALIZER_URL` env var
- Configurable database path defaulting to `~/.claude-visualizer/data.db` in production

### Key Architectural Boundaries Being Tested

```
Build pipeline:
  shared/src/ --tsc--> shared/dist/
  hooks/src/*.ts --bun build--> hooks/dist/*.js (12 standalone files)
  client/src/ --vite build--> dist/client/ (static assets)
  server/src/ --bun build--> dist/server/index.js (standalone)
  dist/cli.js (new entry point with shebang)

Runtime (production):
  claude-visualizer start --> spawns dist/server/index.js
    --> serves /api/* routes
    --> serves /ws WebSocket
    --> serves dist/client/* as static files
    --> SPA fallback: non-API non-asset routes return index.html
    --> database at ~/.claude-visualizer/data.db (or CLAUDE_VISUALIZER_DB)

Runtime (plugin):
  claude --plugin-dir <path>
    --> reads plugin.json
    --> resolves ${CLAUDE_PLUGIN_ROOT}/hooks/dist/<name>.js
    --> hooks POST to CLAUDE_VISUALIZER_URL or http://localhost:3333
```

---

## 2. Automated Tests

All automated tests use Bun's built-in test runner (`bun test`). Each subsection specifies the test file location, the tests to implement, and any mocking requirements.

### 2.1 Build Pipeline Tests

**File**: `hooks/src/__tests__/build.test.ts`

These tests validate the output of the build pipeline. They should be run after `bun run build:hooks` completes, or they can invoke the build as a beforeAll step.

```
Test Suite: build:hooks output
```

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| B1 | produces all 12 hook .js files in hooks/dist/ | After `build:hooks`, verify that `hooks/dist/` contains exactly 12 .js files matching the 12 hook script names. | Files exist: `session-start.js`, `session-end.js`, `stop.js`, `subagent-start.js`, `subagent-stop.js`, `pre-tool-use.js`, `post-tool-use.js`, `post-tool-use-failure.js`, `user-prompt-submit.js`, `notification.js`, `permission-request.js`, `pre-compact.js` |
| B2 | each bundled hook is self-contained (no @shared imports) | Read each `.js` file in `hooks/dist/` and verify it does not contain `require("@shared` or `from "@shared` or `from '@shared`. The shared types should be inlined by the bundler. | No file contains any reference to `@shared/` as an import path. |
| B3 | each bundled hook is executable JavaScript | For each `.js` file in `hooks/dist/`, verify it can be parsed without syntax errors. Use `new Function(source)` or attempt to load it. | No syntax errors. |
| B4 | bundled hooks do not import from node_modules paths | Verify bundled hooks have no unresolved `require()` or `import` from external packages (the `@shared/*` workspace dependency must be inlined; `bun:sqlite` and node built-ins are not used by hooks). | No external imports remain. Only `fetch` and `Bun.stdin` (global APIs) are used. |

**File**: `server/src/__tests__/build.test.ts` (or a top-level `tests/build.test.ts`)

```
Test Suite: build:publish output
```

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| B5 | build:publish produces dist/ directory | After `build:publish`, verify that `dist/` exists. | Directory exists. |
| B6 | dist/cli.js exists with correct shebang | Verify `dist/cli.js` exists and its first line is `#!/usr/bin/env node` or `#!/usr/bin/env bun`. | File exists. First line matches expected shebang. |
| B7 | dist/cli.js is executable | Check the file mode bits include the execute permission (0o755 or similar). On POSIX systems, verify `(stat.mode & 0o111) !== 0`. | Execute permission is set. |
| B8 | dist/server/index.js exists | Verify the bundled server entry point exists. | File exists. |
| B9 | dist/client/index.html exists | Verify the built Vite client output includes `index.html`. | File exists. |
| B10 | dist/client/ contains JS and CSS assets | Verify `dist/client/assets/` (or equivalent Vite output path) contains at least one `.js` file and at least one `.css` file. | At least 1 JS and 1 CSS asset file exist. |
| B11 | plugin.json exists in dist root or .claude-plugin | Verify `dist/plugin.json` or `dist/.claude-plugin/plugin.json` exists. | File exists. |
| B12 | plugin.json uses ${CLAUDE_PLUGIN_ROOT} for all hook paths | Parse the plugin.json. For every hook command, verify the command string contains `${CLAUDE_PLUGIN_ROOT}` and does NOT contain hardcoded absolute paths. | All hook commands reference `${CLAUDE_PLUGIN_ROOT}`. |
| B13 | plugin.json references all 12 hook entry points | Verify the plugin.json contains entries for all 12 lifecycle hooks: `SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `Stop`, `Notification`, `PermissionRequest`, `PreCompact`. | All 12 hooks are present. |
| B14 | hook commands in plugin.json point to hooks/dist/*.js | Each hook command should reference a path like `${CLAUDE_PLUGIN_ROOT}/hooks/dist/<name>.js` (using the bundled output, not the TypeScript source). | All commands use `hooks/dist/*.js` paths (not `hooks/src/*.ts`). |

**Implementation Notes for Build Tests**:
- These tests may use `Bun.spawnSync` or `child_process.execSync` to run the build commands.
- Alternatively, the CI/CD pipeline can run builds first, then run these tests.
- Use `fs.existsSync` and `fs.readFileSync` from `node:fs` for file checks.
- Consider a `beforeAll` that runs the build if the dist directory does not exist, with a timeout of 60 seconds.

---

### 2.2 CLI Tests

**File**: `tests/cli.test.ts` (or `dist/__tests__/cli.test.ts`)

The CLI tests validate the `claude-visualizer` command behavior. Since the CLI manages child processes and PID files, these tests need to mock process spawning.

```
Test Suite: CLI — claude-visualizer
```

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| C1 | `start` subcommand spawns server process | Mock `child_process.spawn` or `Bun.spawn`. Invoke the CLI start logic. Verify spawn was called with the correct server entry path. | Spawn is called with `dist/server/index.js` (or equivalent). |
| C2 | `start` writes PID file | After start, verify a PID file is written to the expected location (e.g., `~/.claude-visualizer/server.pid` or `/tmp/claude-visualizer.pid`). | PID file contains a numeric process ID. |
| C3 | `start` when already running shows error | Write a fake PID file for a running process. Invoke start. Verify it outputs an error message and does not spawn a second process. | Error message indicates server is already running. No spawn call. |
| C4 | `start` with --port flag passes port to server | Invoke start with a custom port flag. Verify the spawned process has the correct `VISUALIZER_PORT` env var or argument. | Port is passed correctly to the spawned server process. |
| C5 | `stop` reads PID and sends signal | Write a fake PID file. Mock `process.kill`. Invoke stop. Verify it reads the PID file and sends the appropriate signal (SIGTERM or SIGINT). | PID is read correctly. Signal is sent. PID file is cleaned up. |
| C6 | `stop` when not running shows info message | Ensure no PID file exists (or PID file points to a dead process). Invoke stop. Verify it outputs an informational message. | Message indicates no server is running. |
| C7 | `stop` cleans up PID file after successful stop | Write a fake PID file. Mock `process.kill` to succeed. Invoke stop. Verify PID file is removed. | PID file no longer exists after stop. |
| C8 | `status` reports running when server is alive | Write a PID file for a process that responds to signal 0. Invoke status. | Output indicates server is running, with PID and port. |
| C9 | `status` reports stopped when no PID file | Ensure no PID file exists. Invoke status. | Output indicates server is not running. |
| C10 | `status` reports stopped when PID file is stale | Write a PID file with a non-existent PID. Invoke status. | Output indicates server is not running. Stale PID file is cleaned up. |
| C11 | unknown subcommand shows help | Invoke CLI with `unknown-command`. | Exits with non-zero code. Output includes usage information listing available commands (start, stop, status). |
| C12 | no subcommand shows help | Invoke CLI with no arguments. | Output includes usage information. |
| C13 | `--help` flag shows help | Invoke CLI with `--help`. | Output includes usage information and exits with code 0. |
| C14 | `--version` flag shows version | Invoke CLI with `--version`. | Output includes the version from package.json. |

**Implementation Notes for CLI Tests**:
- Use `Bun.spawnSync` to invoke the CLI as a subprocess for integration-style tests.
- For unit-style tests, extract the CLI logic into a testable module and mock I/O.
- PID file location should be configurable via an env var for testing (avoid touching real `~/.claude-visualizer/`).
- Clean up PID files in `afterEach` to avoid test pollution.

---

### 2.3 Server Static Serving Tests

**File**: `server/src/__tests__/static-serving.test.ts`

These tests validate the new production behavior where the server serves the built client and provides SPA fallback.

```
Test Suite: Server — static file serving (production mode)
```

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| S1 | serves index.html for GET / | In production mode, `GET /` returns the built `index.html` with content-type `text/html`. | Status 200. Content-Type includes `text/html`. Body contains expected HTML markers (e.g., `<div id="root">`). |
| S2 | serves JS assets with correct content-type | Request a known JS asset path (e.g., `/assets/index-abc123.js`). | Status 200. Content-Type includes `application/javascript` or `text/javascript`. |
| S3 | serves CSS assets with correct content-type | Request a known CSS asset path (e.g., `/assets/index-abc123.css`). | Status 200. Content-Type includes `text/css`. |
| S4 | SPA fallback: unknown path returns index.html | `GET /some/deep/route` returns `index.html` (not 404). | Status 200. Content-Type includes `text/html`. Body matches `index.html` content. |
| S5 | SPA fallback does NOT apply to /api routes | `GET /api/unknown-endpoint` still returns 404 JSON, not index.html. | Status 404. Body is JSON with `error` field (existing behavior preserved). |
| S6 | SPA fallback does NOT apply to /ws route | `GET /ws` does not return index.html (it should attempt WebSocket upgrade or return appropriate error). | Does not return `index.html`. |
| S7 | API routes still work alongside static serving | `GET /api/health` returns the health response even when static serving is enabled. | Status 200. Body JSON has `status: "ok"`. |
| S8 | POST /api/events still works alongside static serving | Post a valid event. | Status 201. Body JSON has `ok: true`. |
| S9 | static serving is disabled in dev mode | When `NODE_ENV` is not `production` (or equivalent flag), `GET /` returns 404 (current behavior). | Status 404. |
| S10 | serves .glb files with correct content-type | Request a GLB model file from the client assets. | Content-Type includes `model/gltf-binary` or `application/octet-stream`. |
| S11 | serves .woff2 font files with correct content-type | If any font files exist in the build output, verify correct MIME type. | Content-Type includes `font/woff2`. |
| S12 | does not serve files outside the client dist directory | Attempt to request `/../../../etc/passwd` or similar path traversal. | Status 404 or 403. Does not leak file system contents. |

**Implementation Notes for Static Serving Tests**:
- The `handleRequest` function from `routes.ts` will need to be extended to accept a `clientDistPath` parameter (or use an env var).
- For testing, create a temporary directory with a mock `index.html` and asset files, then pass it to the request handler.
- Test both the production and non-production code paths.
- Path traversal test (S12) is critical for security.

---

### 2.4 Database Path Configuration Tests

**File**: `server/src/__tests__/database-path.test.ts`

```
Test Suite: Database path configuration
```

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| D1 | default path in dev mode is `visualizer.db` (CWD) | When no env var is set and not in production mode, `initDatabase()` uses the default path `visualizer.db`. | Database is created at `visualizer.db` in the current working directory (existing behavior). |
| D2 | CLAUDE_VISUALIZER_DB env var overrides default path | Set `CLAUDE_VISUALIZER_DB=/tmp/test-vis.db`. Call `initDatabase()`. Verify database is created at the specified path. | Database file exists at `/tmp/test-vis.db`. |
| D3 | production mode defaults to ~/.claude-visualizer/data.db | Set `NODE_ENV=production` (or equivalent). Unset `CLAUDE_VISUALIZER_DB`. Call the database path resolution function. | Path resolves to `<homedir>/.claude-visualizer/data.db`. |
| D4 | production mode creates ~/.claude-visualizer/ directory if missing | Set production mode. Ensure `~/.claude-visualizer/` does not exist. Call `initDatabase()`. | Directory is created. Database file is created inside it. |
| D5 | CLAUDE_VISUALIZER_DB takes precedence over production default | Set both `NODE_ENV=production` and `CLAUDE_VISUALIZER_DB=/tmp/custom.db`. | Database path is `/tmp/custom.db`, not `~/.claude-visualizer/data.db`. |
| D6 | in-memory database still works (:memory:) | Call `initDatabase(':memory:')`. | Returns a working database instance without file creation. |

**Implementation Notes for Database Path Tests**:
- Extract the path resolution logic into a standalone pure function (e.g., `resolveDatabasePath(env)`) that can be unit tested without side effects.
- Use `os.homedir()` in tests to construct expected paths dynamically.
- Create a temp directory for each test to avoid pollution.
- Clean up test database files in `afterEach`.

---

### 2.5 Hook URL Configuration Tests

**File**: `hooks/src/__tests__/url-config.test.ts`

```
Test Suite: Hook URL configuration
```

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| U1 | default URL is http://localhost:3333/api/events | With no `CLAUDE_VISUALIZER_URL` or `VISUALIZER_PORT` env var set, the hook POSTs to `http://localhost:3333/api/events`. | Captured fetch URL is `http://localhost:3333/api/events`. |
| U2 | CLAUDE_VISUALIZER_URL overrides the full URL | Set `CLAUDE_VISUALIZER_URL=http://myhost:9999`. Run a hook. Verify the POST target is `http://myhost:9999/api/events`. | Captured fetch URL is `http://myhost:9999/api/events`. |
| U3 | CLAUDE_VISUALIZER_URL with trailing slash is handled | Set `CLAUDE_VISUALIZER_URL=http://myhost:9999/`. Verify no double-slash in the URL. | Captured fetch URL is `http://myhost:9999/api/events` (not `http://myhost:9999//api/events`). |
| U4 | VISUALIZER_PORT still works for backward compatibility | Set `VISUALIZER_PORT=4444` (without `CLAUDE_VISUALIZER_URL`). Run a hook. | Captured fetch URL is `http://localhost:4444/api/events`. |
| U5 | CLAUDE_VISUALIZER_URL takes precedence over VISUALIZER_PORT | Set both `CLAUDE_VISUALIZER_URL=http://remote:5555` and `VISUALIZER_PORT=4444`. | Captured fetch URL uses `http://remote:5555/api/events`. |

**Implementation Notes for Hook URL Tests**:
- The current hooks use `process.env.VISUALIZER_PORT || 3333`. The feature changes this to also support `CLAUDE_VISUALIZER_URL`.
- Tests need to set env vars before importing the hook module (similar to the existing test pattern with the import counter cache-bust).
- Extract the URL resolution into a shared helper function used by all hooks (e.g., `hooks/src/lib/config.ts`) and unit-test that function directly.

---

### 2.6 Plugin Manifest Tests

**File**: `hooks/src/__tests__/plugin-manifest.test.ts` (or `tests/plugin.test.ts`)

```
Test Suite: plugin.json manifest
```

| # | Test Name | Description | Expected Result |
|---|-----------|-------------|-----------------|
| P1 | plugin.json is valid JSON | Parse `.claude-plugin/plugin.json` (or the built `dist/plugin.json`). | No parse errors. |
| P2 | all 12 hooks are registered | Verify the `hooks` object contains keys for all 12 lifecycle events. | All 12 hook types present: `SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `Stop`, `Notification`, `PermissionRequest`, `PreCompact`. |
| P3 | all hook commands use ${CLAUDE_PLUGIN_ROOT} | Every hook command string must start with or contain `${CLAUDE_PLUGIN_ROOT}`. | No hardcoded absolute paths in any command. |
| P4 | all hook commands reference hooks/dist/*.js files | Each hook command references the bundled `.js` file, not the `.ts` source file. | All commands match pattern `*hooks/dist/<name>.js`. |
| P5 | hook command format matches expected structure | Each hook entry is an array containing an object with `{ "type": "command", "command": "..." }`. | Structure matches expected format. |
| P6 | plugin.json contains required metadata fields | Verify `name`, `version`, and `description` fields exist. | All metadata fields present. |

---

## 3. Manual Test Scenarios

### Scenario M1: Fresh npm install + start

**Objective**: Verify that a fresh installation of the npm package works end-to-end.

**Prerequisites**:
- Node.js >= 18 or Bun >= 1.0 installed
- No previous `~/.claude-visualizer/` directory exists
- Port 3333 is available
- The npm package has been built (`bun run build:publish`)

**Steps**:

1. Create a temporary directory and navigate to it:
   ```bash
   mkdir /tmp/test-visualizer && cd /tmp/test-visualizer
   ```

2. Install the package locally (from the built tarball or local path):
   ```bash
   npm install /path/to/claude-office-visualizer/dist
   # or: npm pack && npm install claude-visualizer-<version>.tgz
   ```

3. Verify the CLI is available:
   ```bash
   npx claude-visualizer --help
   ```

4. Start the server:
   ```bash
   npx claude-visualizer start
   ```

5. Wait 2 seconds for the server to boot.

6. Open a browser and navigate to `http://localhost:3333`.

7. Verify the API health endpoint:
   ```bash
   curl http://localhost:3333/api/health
   ```

8. Stop the server:
   ```bash
   npx claude-visualizer stop
   ```

9. Verify the server is stopped:
   ```bash
   npx claude-visualizer status
   ```

**Expected Results**:
- Step 3: Help text is displayed with `start`, `stop`, `status` subcommands listed.
- Step 4: Terminal output indicates server is starting on port 3333. No errors printed.
- Step 6: Browser shows the 3D visualizer UI (dark scene with office floor/grid). No blank page or JS errors in console.
- Step 7: Returns `{"status":"ok","uptime":<N>,"eventCount":0,"clientCount":1}` (or clientCount 0 if browser is closed).
- Step 8: Terminal confirms server has been stopped.
- Step 9: Status reports the server is not running.

**Pass Criteria**: All expected results are met. The `~/.claude-visualizer/` directory was created automatically with a `data.db` file inside it.

**Fail Criteria**: Any step produces an error, the browser shows a blank page, or the server fails to start/stop cleanly.

---

### Scenario M2: Plugin local testing with --plugin-dir

**Objective**: Verify that Claude Code can load the visualizer as a plugin and hooks fire correctly.

**Prerequisites**:
- Claude Code CLI is installed and accessible as `claude`
- The visualizer server is running (`claude-visualizer start` or `bun run dev:server`)
- Hook scripts are built (`bun run build:hooks`)
- The project directory contains a valid `plugin.json` (in `.claude-plugin/` or project root)

**Steps**:

1. Ensure the visualizer server is running:
   ```bash
   npx claude-visualizer start
   # or: cd /path/to/project && bun run dev:server
   ```

2. Open a browser to `http://localhost:3333` (or `http://localhost:5173` in dev mode).

3. In a separate terminal, launch Claude Code with the plugin directory:
   ```bash
   cd /path/to/claude-office-visualizer
   claude --plugin-dir .
   ```

4. In the Claude Code session, type a simple prompt:
   ```
   What is 2 + 2?
   ```

5. Observe the browser visualizer.

6. In Claude Code, trigger a tool use by asking:
   ```
   Read the file package.json
   ```

7. Observe the browser visualizer.

8. Exit Claude Code (Ctrl+C or type `/exit`).

9. Check the visualizer for the session end event.

**Expected Results**:
- Step 3: Claude Code starts without errors about the plugin. No warnings about hook failures.
- Step 5: The visualizer shows a root agent desk appearing (SessionStarted event). A UserPrompt event fires showing the prompt text.
- Step 7: The visualizer shows a tool animation at the root agent's desk (ToolCallStarted for "Read"). The tool animation disappears when the tool completes (ToolCallCompleted). The desk status indicator cycles through the expected colors (blue for tool_executing, then back to green for active).
- Step 9: The root agent's status changes to completed (or waiting if between turns). The desk may turn gray (waiting) or fade out (completed).

**Pass Criteria**: Events flow from Claude Code hooks through the server to the browser visualizer in real-time. All lifecycle events (session start, prompt, tool start, tool end, session end) are captured and visualized.

**Fail Criteria**: Hooks fail silently (no events arrive at server), the visualizer shows no changes, or Claude Code reports plugin loading errors.

---

### Scenario M3: Dev workflow regression

**Objective**: Confirm the existing development workflow is unaffected by the packaging changes.

**Prerequisites**:
- Git working tree is clean (no uncommitted changes from build output)
- Node modules are installed (`bun install`)

**Steps**:

1. Start the dev server:
   ```bash
   bun run dev:server
   ```

2. In a separate terminal, start the dev client:
   ```bash
   bun run dev:client
   ```

3. Open `http://localhost:5173` in a browser.

4. Verify the Vite dev server is running with HMR.

5. Make a trivial edit to a client file (e.g., add a comment to `client/src/App.tsx`).

6. Verify HMR updates the browser without a full reload.

7. Send a test event to the server:
   ```bash
   curl -X POST http://localhost:3333/api/events \
     -H "Content-Type: application/json" \
     -d '{"id":"test-123","type":"SessionStarted","timestamp":"2026-02-25T00:00:00Z","session_id":"dev-test","agent_type":"main","model":"test","source":"cli"}'
   ```

8. Verify the event appears in the visualizer.

9. Run the full type check:
   ```bash
   bun run typecheck
   ```

10. Run all existing test suites:
    ```bash
    cd client && bun test
    cd ../server && bun test
    cd ../hooks && bun test
    ```

**Expected Results**:
- Steps 1-2: Both servers start without errors.
- Step 3: Visualizer UI loads correctly at port 5173.
- Step 6: HMR works (browser updates without full page reload).
- Step 8: A desk appears in the 3D scene for the test session.
- Step 9: TypeScript compilation succeeds with zero errors.
- Step 10: All existing tests pass (no regressions).

**Pass Criteria**: All 10 steps produce expected results. Dev experience is identical to before the packaging changes.

**Fail Criteria**: Any dev server fails to start, HMR breaks, typecheck fails, or existing tests fail.

---

### Scenario M4: Hook-to-server communication with custom port

**Objective**: Verify hooks respect the `CLAUDE_VISUALIZER_URL` environment variable.

**Prerequisites**:
- Hooks are built (`bun run build:hooks`)
- Port 3333 is free and port 7777 is free

**Steps**:

1. Start the server on a non-default port:
   ```bash
   VISUALIZER_PORT=7777 bun run dev:server
   # or: VISUALIZER_PORT=7777 npx claude-visualizer start
   ```

2. Verify server is running:
   ```bash
   curl http://localhost:7777/api/health
   ```

3. Manually fire a hook with the custom URL:
   ```bash
   echo '{"session_id":"custom-port-test","agent_type":"main","model":"test","source":"cli"}' | \
     CLAUDE_VISUALIZER_URL=http://localhost:7777 \
     bun run hooks/dist/session-start.js
   ```

4. Verify the event was received:
   ```bash
   curl http://localhost:7777/api/events
   ```

5. Fire a hook WITHOUT the env var (default behavior):
   ```bash
   echo '{"session_id":"default-port-test","agent_type":"main","model":"test","source":"cli"}' | \
     bun run hooks/dist/session-start.js
   ```

6. Verify the event was NOT received at port 7777 (it was sent to port 3333 which is not running):
   ```bash
   curl "http://localhost:7777/api/events?session_id=default-port-test"
   ```

**Expected Results**:
- Step 2: Health check returns `{"status":"ok",...}`.
- Step 3: Hook exits without error (fire-and-forget, so exit code 0 regardless).
- Step 4: Returns array containing the event with `session_id: "custom-port-test"`.
- Step 5: Hook exits without error (silently fails because port 3333 is not listening).
- Step 6: Returns empty array `[]` (the event went to port 3333, not 7777).

**Pass Criteria**: Custom URL env var correctly routes hooks to the specified server. Default behavior sends to port 3333.

**Fail Criteria**: Hook ignores the env var, or hook errors are not silently caught.

---

### Scenario M5: SPA navigation in production mode

**Objective**: Verify the server correctly handles SPA routing in production mode.

**Prerequisites**:
- Build is complete (`bun run build:publish`)
- Server is running in production mode serving the built client

**Steps**:

1. Start the production server:
   ```bash
   npx claude-visualizer start
   # or: NODE_ENV=production bun run dist/server/index.js
   ```

2. Navigate to `http://localhost:3333/` in a browser.

3. Verify the visualizer loads.

4. Navigate directly to `http://localhost:3333/some/unknown/path` in a new tab.

5. Verify the visualizer still loads (SPA fallback).

6. Open browser dev tools, check for 404 errors on assets.

7. Verify API routes still work:
   ```bash
   curl http://localhost:3333/api/health
   curl http://localhost:3333/api/events
   ```

8. Verify WebSocket connection works:
   - Open browser console at `http://localhost:3333/`
   - Run: `new WebSocket('ws://localhost:3333/ws')`
   - Verify the connection opens (check `readyState === 1` after a short delay)

9. Navigate to `http://localhost:3333/api/nonexistent`.

10. Verify this returns a JSON 404 error, not the SPA index.html.

**Expected Results**:
- Steps 2-3: Visualizer loads with 3D scene visible.
- Steps 4-5: Visualizer loads at the unknown path (SPA fallback returns index.html).
- Step 6: No 404 errors for JS/CSS assets. All static files load correctly.
- Step 7: Both API endpoints return valid JSON responses.
- Step 8: WebSocket connects successfully.
- Step 10: Returns `{"error":"..."}` JSON, not HTML.

**Pass Criteria**: SPA fallback works for client-side routes. API routes and WebSocket are not affected by the fallback. Static assets are served with correct MIME types.

**Fail Criteria**: SPA fallback returns 404, API routes return HTML, or assets fail to load.

---

### Scenario M6: Database persistence across restarts

**Objective**: Verify events persist in SQLite and survive server restarts.

**Prerequisites**:
- Production build is complete
- `~/.claude-visualizer/data.db` does not exist (or delete it)

**Steps**:

1. Start the server:
   ```bash
   npx claude-visualizer start
   ```

2. Send a test event:
   ```bash
   curl -X POST http://localhost:3333/api/events \
     -H "Content-Type: application/json" \
     -d '{"id":"persist-test-1","type":"SessionStarted","timestamp":"2026-02-25T10:00:00Z","session_id":"persist-session","agent_type":"main","model":"test","source":"cli"}'
   ```

3. Verify the event exists:
   ```bash
   curl http://localhost:3333/api/events/persist-test-1
   ```

4. Stop the server:
   ```bash
   npx claude-visualizer stop
   ```

5. Verify the database file exists:
   ```bash
   ls -la ~/.claude-visualizer/data.db
   ```

6. Restart the server:
   ```bash
   npx claude-visualizer start
   ```

7. Verify the previously stored event is still available:
   ```bash
   curl http://localhost:3333/api/events/persist-test-1
   ```

8. Open the browser and connect. Verify the WebSocket history replay includes the persisted event.

9. Stop the server:
   ```bash
   npx claude-visualizer stop
   ```

**Expected Results**:
- Step 2: Returns 201.
- Step 3: Returns the event JSON with `id: "persist-test-1"`.
- Step 5: File exists and has non-zero size.
- Step 7: Returns the same event JSON (data survived restart).
- Step 8: The visualizer shows the session from the persisted event after WebSocket subscribe + history replay.

**Pass Criteria**: Data persists across server restarts. The database file is created at `~/.claude-visualizer/data.db`.

**Fail Criteria**: Data is lost on restart, or database is created at the wrong location.

---

### Scenario M7: Stop command cleanup

**Objective**: Verify the stop command properly terminates the server and cleans up resources.

**Prerequisites**:
- Production build is complete

**Steps**:

1. Start the server:
   ```bash
   npx claude-visualizer start
   ```

2. Note the PID (either from the output or from the PID file):
   ```bash
   cat ~/.claude-visualizer/server.pid
   # or wherever the PID file is stored
   ```

3. Verify the process is running:
   ```bash
   ps -p <PID>
   ```

4. Open a browser to `http://localhost:3333` (establishes a WebSocket connection).

5. Stop the server:
   ```bash
   npx claude-visualizer stop
   ```

6. Verify the process is no longer running:
   ```bash
   ps -p <PID>
   ```

7. Verify the PID file is cleaned up:
   ```bash
   ls ~/.claude-visualizer/server.pid
   ```

8. Verify port 3333 is free:
   ```bash
   lsof -i :3333
   ```

9. Verify the browser shows a disconnected state (WebSocket closed).

10. Run stop again (idempotent):
    ```bash
    npx claude-visualizer stop
    ```

**Expected Results**:
- Step 3: Process is listed.
- Step 5: Terminal confirms server has been stopped.
- Step 6: Process is not found.
- Step 7: PID file does not exist (or is removed).
- Step 8: No process is listening on port 3333.
- Step 9: Browser visualizer shows "disconnected" status in the HUD.
- Step 10: Informational message that server is already stopped (no error).

**Pass Criteria**: Server terminates cleanly, PID file is removed, port is freed, and the command is idempotent.

**Fail Criteria**: Process continues running after stop, PID file is left behind, port remains occupied, or second stop command throws an error.

---

### Scenario M8: Concurrent session handling

**Objective**: Verify the packaged server handles multiple Claude Code sessions simultaneously.

**Prerequisites**:
- Server is running (dev or production mode)
- Browser is open to the visualizer

**Steps**:

1. Ensure the server is running and visualizer is open in a browser.

2. In terminal 1, simulate session A:
   ```bash
   # Session A start
   curl -X POST http://localhost:3333/api/events \
     -H "Content-Type: application/json" \
     -d '{"id":"a1","type":"SessionStarted","timestamp":"2026-02-25T10:00:00Z","session_id":"session-A","agent_type":"main","model":"claude-opus-4-6","source":"cli"}'
   ```

3. In terminal 2, simulate session B:
   ```bash
   # Session B start
   curl -X POST http://localhost:3333/api/events \
     -H "Content-Type: application/json" \
     -d '{"id":"b1","type":"SessionStarted","timestamp":"2026-02-25T10:00:01Z","session_id":"session-B","agent_type":"main","model":"claude-sonnet-4","source":"cli"}'
   ```

4. Send a sub-agent spawn from session A:
   ```bash
   curl -X POST http://localhost:3333/api/events \
     -H "Content-Type: application/json" \
     -d '{"id":"a2","type":"AgentSpawned","timestamp":"2026-02-25T10:00:02Z","session_id":"session-A","agent_id":"sub-1","parent_session_id":"session-A","agent_type":"researcher","model":"claude-sonnet-4","task_description":"Research codebase"}'
   ```

5. Send tool call events interleaved between sessions:
   ```bash
   # Session B tool call
   curl -X POST http://localhost:3333/api/events \
     -H "Content-Type: application/json" \
     -d '{"id":"b2","type":"ToolCallStarted","timestamp":"2026-02-25T10:00:03Z","session_id":"session-B","tool_name":"Read","tool_input":{},"tool_use_id":"tool-b1"}'

   # Session A tool call
   curl -X POST http://localhost:3333/api/events \
     -H "Content-Type: application/json" \
     -d '{"id":"a3","type":"ToolCallStarted","timestamp":"2026-02-25T10:00:04Z","session_id":"session-A","tool_name":"Bash","tool_input":{},"tool_use_id":"tool-a1"}'
   ```

6. Observe the visualizer after each event.

7. Check the sessions endpoint:
   ```bash
   curl http://localhost:3333/api/sessions
   ```

**Expected Results**:
- Step 2: A root desk appears in the visualizer.
- Step 3: The visualizer updates to show the most recent session (session-B becomes the root agent, as `rootAgentId` always updates to the latest `SessionStarted`).
- Step 4: A sub-agent desk appears near the root desk.
- Step 5: Tool animations appear at the correct desks.
- Step 7: Returns two sessions with correct event counts.

**Pass Criteria**: Multiple sessions are tracked correctly in the database. The visualizer responds to events from all sessions. No event cross-contamination between sessions.

**Fail Criteria**: Events from one session affect the wrong agent, sessions are not tracked separately, or the visualizer crashes.

---

## 4. Regression Checklist

Execute after all packaging changes are implemented but before merging.

| # | Check | Command | Expected |
|---|-------|---------|----------|
| R1 | Client tests pass | `cd client && bun test` | All tests pass (0 failures) |
| R2 | Server tests pass | `cd server && bun test` | All tests pass (0 failures) |
| R3 | Hook tests pass | `cd hooks && bun test` | All tests pass (0 failures) |
| R4 | TypeScript check passes | `bun run typecheck` | Exit code 0, no errors |
| R5 | Dev server starts | `bun run dev:server` | Listening on port 3333, no errors |
| R6 | Dev client starts | `bun run dev:client` | Vite dev server on port 5173, no errors |
| R7 | Dev proxy works | Open `http://localhost:5173`, check WebSocket connects | WebSocket connects via Vite proxy to server |
| R8 | Build:shared succeeds | `cd shared && bun run build` | Exit code 0 |
| R9 | Build:client succeeds | `bun run build` | Vite produces `client/dist/` |
| R10 | Build:hooks succeeds | `bun run build:hooks` | 12 .js files in `hooks/dist/` |
| R11 | Build:publish succeeds | `bun run build:publish` | Complete `dist/` structure |
| R12 | New build tests pass | Run new automated tests from section 2 | All tests pass |
| R13 | package.json scripts unchanged | Verify `dev:client`, `dev:server`, `build`, `test`, `typecheck` scripts still exist and work | Existing scripts work as before |
| R14 | No workspace dependency breakage | `bun install` succeeds cleanly | No resolution errors |
| R15 | GLB model assets included in build | Check `dist/client/` contains `.glb` files or references | Models are available in production build |

---

## Appendix A: File Location Summary for New Tests

| Test File | Package | Purpose |
|-----------|---------|---------|
| `hooks/src/__tests__/build.test.ts` | hooks | Build pipeline output for hook bundles |
| `hooks/src/__tests__/url-config.test.ts` | hooks | CLAUDE_VISUALIZER_URL env var behavior |
| `hooks/src/__tests__/plugin-manifest.test.ts` | hooks | plugin.json structure validation |
| `server/src/__tests__/static-serving.test.ts` | server | Static file serving + SPA fallback |
| `server/src/__tests__/database-path.test.ts` | server | Database path resolution logic |
| `tests/cli.test.ts` | root | CLI start/stop/status commands |
| `tests/build.test.ts` | root | Full build:publish output structure |

## Appendix B: Environment Variables Introduced

| Variable | Used By | Default | Description |
|----------|---------|---------|-------------|
| `CLAUDE_VISUALIZER_URL` | hooks | `http://localhost:3333` | Full base URL for the visualizer server |
| `CLAUDE_VISUALIZER_DB` | server | `~/.claude-visualizer/data.db` (prod) or `visualizer.db` (dev) | SQLite database file path |
| `VISUALIZER_PORT` | server, hooks (legacy) | `3333` | Server listen port (existing) |
| `NODE_ENV` | server | `development` | Controls static serving and database path defaults |

## Appendix C: Test Execution Order Recommendation

For CI/CD or manual execution, the recommended order is:

1. **Regression first**: R1-R4 (existing tests + typecheck) -- catch breakage early
2. **Build pipeline**: Run all build commands, then B1-B14
3. **Unit tests**: U1-U5, D1-D6, P1-P6 -- fast, isolated
4. **Integration tests**: C1-C14, S1-S12 -- require build output
5. **Manual scenarios**: M1-M8 -- require human observation and Claude Code CLI

Total estimated automated test count: ~52 new tests across 7 test files.
Total estimated manual test scenarios: 8 scenarios with ~60 verification steps.
