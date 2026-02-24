# ADR-001: Package as npm CLI + Claude Code Plugin for Portable Distribution

- **Status**: Proposed
- **Date**: 2026-02-25
- **Linear Issue**: [YUC-107](https://linear.app/yuchida4dev/issue/YUC-107/package-as-npm-cli-claude-code-plugin-for-portable-distribution)

---

## Context

The Claude Office Visualizer is a real-time 3D visualization of Claude Code agent orchestration. It is currently structured as a private Bun workspace monorepo with four packages (`shared/`, `hooks/`, `server/`, `client/`) that work together through workspace-level dependency resolution.

The current setup requires users to clone the repository, install workspace dependencies with Bun, run separate dev commands for the server and client, and manually configure hook scripts with absolute filesystem paths in `.claude/settings.local.json`. This makes the tool unusable outside the developer's own machine.

Several concrete pain points drive the need for portable distribution:

1. **Hook path fragility.** The `.claude/settings.local.json` hooks use absolute paths (e.g., `bun run /Users/yutauchida/Projects/claude-office-visualizer/hooks/src/session-start.ts`). These break on any other machine or if the repo moves. The `.claude-plugin/plugin.json` uses CWD-relative paths (`bun run hooks/src/session-start.ts`) that only work when Claude Code's working directory is the repo root.

2. **Workspace dependency coupling.** All 12 hook scripts and the server import from `@claude-visualizer/shared` via Bun workspace resolution (`workspace:*`). These imports fail outside the monorepo context, meaning hooks cannot run from a plugin cache directory like `~/.claude/plugins/cache/`.

3. **Database location.** The server creates `visualizer.db` in the current working directory. When run as an installed CLI tool, CWD is unpredictable, so the database lands in arbitrary locations.

4. **Client serving.** The client is only accessible through Vite's dev server (port 5173) with a proxy to the backend (port 3333). There is no production mode where the server serves the built client directly.

5. **No unified entry point.** Starting the visualizer requires running two separate terminal commands (`bun run dev:server` and `bun run dev:client`). There is no single command that starts everything.

The project needs a distribution strategy that makes installation a one-line operation and eliminates manual configuration while preserving the existing development workflow.

---

## Decision

We will distribute the visualizer through **two complementary channels** that cleanly separate concerns:

1. **npm package** (`claude-visualizer`) -- delivers the server, pre-built client assets, and a CLI with `start`/`stop`/`status` subcommands.
2. **Claude Code plugin** (`claude-office-visualizer`) -- delivers pre-bundled hook scripts with `${CLAUDE_PLUGIN_ROOT}` path resolution for automatic registration.

This separation follows the principle that the npm package owns the "runtime" (server, client, data persistence) while the plugin owns the "instrumentation" (hooks that fire inside Claude Code sessions). They communicate over HTTP, the same interface they use today.

### Key Design Decisions

#### Decision 1: Flat `dist/` with inlined `@shared/*` via `bun build`

All build artifacts will be placed in a flat `dist/` directory at the project root. The `@shared/*` workspace dependency will be inlined at build time using `bun build`'s bundler, which resolves TypeScript path aliases and produces self-contained JavaScript files. There will be no published workspace dependency and no need for consumers to install `@claude-visualizer/shared`.

The `dist/` layout:

```
dist/
  cli.js                  # CLI entry point (shebang: #!/usr/bin/env bun)
  server/
    index.js              # Bun.serve() entry -- @shared/* inlined
  client/
    index.html            # Vite build output (SPA)
    assets/
      *.js, *.css         # Bundled React 19 + Three.js + Zustand 5
    models/
      *.glb               # 10 GLB models (office, desk, monitor, chair, avatar, 5 icons)
```

**Rationale.** `bun build` with `--target bun` resolves `@shared/*` path aliases and tree-shakes unused exports, producing standalone JS files. This eliminates the workspace dependency problem entirely. The alternative of publishing `@shared/*` as a separate npm package was rejected because it adds maintenance overhead (versioning, publishing cadence) for what amounts to 3 small type-definition files (~160 lines total across `events.ts`, `agent.ts`, `messages.ts`).

The Vite build for the client already inlines `@shared/*` through its `resolve.alias` configuration, so no additional work is needed there beyond changing the output directory to `dist/client/`.

#### Decision 2: CLI runtime requires Bun (`#!/usr/bin/env bun`)

The CLI entry point will use `#!/usr/bin/env bun` as its shebang, requiring Bun to be installed on the target machine. The `package.json` will declare `"engines": { "bun": ">=1.0" }`.

**Rationale.** The server depends on `bun:sqlite` (Bun's built-in SQLite driver) and `Bun.serve()` (Bun's HTTP/WebSocket server). These are Bun-specific APIs with no Node.js equivalents that don't require additional npm dependencies. Compiling to a standalone binary with `bun build --compile` was considered but deferred because:

- Binary size would be large (~80-100MB for the Bun runtime alone, plus ~15MB of GLB assets).
- Platform-specific binaries (darwin-arm64, darwin-x64, linux-x64) would need to be built and published separately, requiring CI/CD infrastructure that does not yet exist.
- Bun is already a common tool in the Claude Code ecosystem (Claude Code itself recommends Bun for hook scripts), so the dependency is not burdensome for the target audience.

Standalone binary compilation is identified as a future enhancement (see "Out of Scope" in YUC-107) that can be layered on without changing the architecture.

#### Decision 3: Database at `~/.claude-visualizer/data.db` with env var override

The server will store its SQLite database at `~/.claude-visualizer/data.db` by default when running in production mode (via the CLI). The path is overridable via the `CLAUDE_VISUALIZER_DB` environment variable. The CLI `start` command will create the `~/.claude-visualizer/` directory if it does not exist.

In development mode (when running `bun run dev:server`), the existing behavior of `./visualizer.db` in CWD is preserved. The distinction is made by checking whether the server is invoked through the CLI entry point (which sets an internal flag or passes the path explicitly) versus directly through `bun run src/index.ts`.

**Rationale.** A user-home-relative path (`~/.claude-visualizer/`) is the standard convention for CLI tool data on both macOS and Linux. It avoids the problem of databases appearing in unexpected directories when the CLI is invoked from different working directories. The env var override supports advanced use cases like running multiple instances, CI environments, or custom data directories.

The directory also provides a natural home for future configuration files (e.g., `~/.claude-visualizer/config.json`) and the PID file used by the `stop` command.

#### Decision 4: Server serves built client with SPA fallback

The server will be modified to serve static files from the `dist/client/` directory for all routes that do not match `/api/*` or `/ws`. The asset directory path will be resolved relative to the server entry point using `import.meta.dir`, making it work regardless of where the npm package is installed (globally, locally, or via npx).

For any route that does not match a static file, the server will return `dist/client/index.html` (SPA fallback), allowing the React application's client-side routing to handle the request.

In development mode, Vite's proxy continues to handle this (the server never receives non-API requests), so no dev workflow changes are needed.

**Rationale.** Serving the client from the same Bun server eliminates the need for a separate static file server or reverse proxy in production. The SPA fallback is necessary because the Three.js client is a single-page application. This approach means `claude-visualizer start` gives users a fully functional visualizer at a single URL (`http://localhost:3333`), with no separate client dev server required.

The static file path must use `import.meta.dir` (not `process.cwd()` or `__dirname`) because `import.meta.dir` resolves to the directory containing the currently executing module, which is stable regardless of where the user invokes the CLI. For a globally installed npm package, this would be something like `~/.bun/install/global/node_modules/claude-visualizer/dist/server/`, and `../client/` relative to that gives the correct path.

#### Decision 5: Each hook bundled as standalone JS with `@shared/*` inlined

Each of the 12 hook scripts will be compiled from TypeScript to a self-contained JavaScript file using `bun build`. The `@shared/*` imports (used only for TypeScript type annotations via `import type`) are erased at build time, and any runtime imports from `@shared/*` (currently none exist; all hook imports are `import type`) would be inlined.

The built hooks will be placed at `hooks/dist/*.js`:

```
hooks/dist/
  session-start.js
  session-end.js
  subagent-start.js
  subagent-stop.js
  pre-tool-use.js
  post-tool-use.js
  post-tool-use-failure.js
  user-prompt-submit.js
  stop.js
  notification.js
  permission-request.js
  pre-compact.js
```

A `build:hooks` script will compile all 12 hooks. This can be done with a loop or parallel `bun build` invocations.

**Rationale.** The hook scripts today import from `@shared/events` using `import type`, which means at runtime they have zero imports -- the TypeScript compiler erases type-only imports. However, `bun run hooks/src/session-start.ts` still requires Bun's TypeScript transpiler to resolve the `@shared/*` path alias at execution time, which only works within the workspace context. Pre-building to JS eliminates this resolution step, making the hooks runnable from any directory. The built files are small (each hook is ~30-50 lines of TypeScript that compiles to roughly the same amount of JS), so bundling overhead is negligible.

#### Decision 6: Plugin paths use `${CLAUDE_PLUGIN_ROOT}` template variable

The `.claude-plugin/plugin.json` will be updated to reference built hooks using the `${CLAUDE_PLUGIN_ROOT}` template variable:

```json
{
  "hooks": {
    "SessionStart": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/session-start.js" }
    ]
  }
}
```

This variable is resolved by Claude Code's plugin system to the actual filesystem path where the plugin is cached (typically `~/.claude/plugins/cache/<plugin-name>/`).

**Rationale.** The current `plugin.json` uses CWD-relative paths (`bun run hooks/src/session-start.ts`) which only work if Claude Code's CWD is the repo root. The `${CLAUDE_PLUGIN_ROOT}` variable is the official Claude Code plugin mechanism for portable path references. It allows the same `plugin.json` to work whether the plugin is installed from a directory, a Git repository, or a future marketplace.

Local development continues to use `.claude/settings.local.json` with absolute paths to source TypeScript files, so the `plugin.json` change does not affect the dev workflow.

#### Decision 7: `CLAUDE_VISUALIZER_URL` env var for hook-to-server communication

Hook scripts will read the server URL from the `CLAUDE_VISUALIZER_URL` environment variable, falling back to `http://localhost:${VISUALIZER_PORT || 3333}/api/events` for backward compatibility:

```typescript
const SERVER_URL = process.env.CLAUDE_VISUALIZER_URL
  || `http://localhost:${process.env.VISUALIZER_PORT || 3333}/api/events`;
```

**Rationale.** The current hooks hardcode `http://localhost:${VISUALIZER_PORT || 3333}/api/events`. While `VISUALIZER_PORT` provides port configurability, it does not support remote servers, custom hostnames, or HTTPS. The `CLAUDE_VISUALIZER_URL` env var provides full URL configurability for advanced deployments (e.g., running the server on a different machine, behind a reverse proxy, or in a container), while the existing `VISUALIZER_PORT` fallback maintains backward compatibility with current users.

#### Decision 8: npm package = server+client+CLI, plugin = hooks only

The npm package and the Claude Code plugin are two separate distribution artifacts with no overlap:

- **npm package** publishes: `dist/cli.js`, `dist/server/`, `dist/client/` (including GLB models)
- **Plugin** publishes: `.claude-plugin/plugin.json`, `hooks/dist/`

The plugin does NOT include the server or client. The npm package does NOT include the hooks. They communicate exclusively over HTTP (hooks POST to the server's `/api/events` endpoint).

**Rationale.** This separation cleanly decouples the two concerns:

- The server/client can be upgraded independently of hook behavior.
- Hooks can be updated without restarting the server.
- The plugin is lightweight (12 small JS files + a manifest), keeping plugin cache size minimal.
- The server does not need to be installed as a Claude Code plugin, and the hooks do not need to be distributed via npm.

This also avoids the complexity of having a single package that acts as both an npm CLI and a Claude Code plugin, which would require the npm package to include plugin metadata and hook scripts, and would force the entire package into the plugin cache.

---

## Alternatives Considered

### Alternative 1: Single unified package (npm package is also the plugin)

Publish a single npm package that includes hooks in its file tree, and have users point Claude Code's `--plugin-dir` at the installed npm package. The `plugin.json` would live at `node_modules/claude-visualizer/.claude-plugin/plugin.json`.

**Why rejected:**
- The npm package would need to be in a location that Claude Code can access as a plugin directory, which is not guaranteed for globally installed packages.
- Mixing npm distribution (globally installable CLI) with plugin distribution (cached in `~/.claude/plugins/`) conflates two different installation lifecycles.
- Updates to the server would force plugin reinstallation and vice versa.
- The plugin cache would contain the full Vite build output (~15MB of client assets), wasting disk space in a directory meant for lightweight scripts.

### Alternative 2: Compiled standalone binary (no Bun dependency)

Use `bun build --compile` to produce a standalone binary that includes the Bun runtime, server, and client. Users would download a platform-specific binary with no runtime dependencies.

**Why rejected (for now):**
- Binary size (~80-100MB) is large for what is essentially a lightweight dev tool.
- Requires platform-specific CI/CD pipelines (darwin-arm64, darwin-x64, linux-x64 at minimum).
- Cannot easily support custom plugins or modifications.
- Bun is already a reasonable prerequisite for the target audience (Claude Code developers).
- Deferred as a future enhancement once the basic distribution pipeline is proven.

### Alternative 3: Docker-based distribution

Provide a Docker image that runs the server and serves the client, with hooks configured to POST to the containerized server.

**Why rejected:**
- Docker adds significant overhead for a developer tool meant to run alongside Claude Code on the local machine.
- WebSocket connections from the browser to a Docker container introduce networking complexity (port mapping, host networking).
- SQLite inside a container requires volume mounts for data persistence.
- The target audience (individual developers using Claude Code) may not have Docker installed.
- Hook scripts still need to run on the host machine (inside Claude Code), so a hybrid approach would be needed anyway.

### Alternative 4: Separate npm packages for shared, server, and client

Publish `@claude-visualizer/shared`, `@claude-visualizer/server`, and `@claude-visualizer/client` as separate npm packages with proper dependency relationships.

**Why rejected:**
- Adds significant publishing and versioning overhead for three packages instead of one.
- `@shared/*` contains only ~160 lines of type definitions across 3 files. It does not justify its own npm package.
- Version coordination between packages introduces a common class of bugs (incompatible versions in the dependency tree).
- The monorepo's workspace dependencies already solve the code-sharing problem during development. The flat `dist/` approach solves it for distribution.

### Alternative 5: Monorepo publishing with Turborepo/Lerna

Use a monorepo publishing tool to automatically manage versioning and publishing of workspace packages.

**Why rejected:**
- Adds tooling complexity (Turborepo, Lerna, or Changesets) for a project with a single distribution artifact.
- The "multiple packages" concern does not apply here because the flat `dist/` build inlines all dependencies.
- The benefit of Turborepo (incremental builds, remote caching) is not needed for a project of this size.

---

## Consequences

### Positive

1. **One-command installation.** Users can install the server with `bun install -g claude-visualizer` and the hooks with `claude plugin install claude-office-visualizer`. No repo cloning, no manual configuration.

2. **Stable data persistence.** The database lives at a predictable, user-home-relative location (`~/.claude-visualizer/data.db`) instead of CWD-relative, preventing data loss from directory changes.

3. **Single-port operation.** In production mode, the server serves both the API and the client on port 3333, eliminating the need for two processes and a proxy.

4. **Clean separation of concerns.** The npm package (runtime) and plugin (instrumentation) can be versioned and updated independently, following the principle of independent deployability.

5. **Zero-configuration hooks.** The `${CLAUDE_PLUGIN_ROOT}` template variable eliminates manual path configuration. Users do not need to edit any settings files.

6. **Preserved dev workflow.** The existing `bun run dev:server` + `bun run dev:client` workflow is completely unaffected. Local `.claude/settings.local.json` with absolute paths continues to work for development.

### Negative

1. **Bun runtime dependency.** Users must have Bun installed. This is a reasonable requirement for the Claude Code audience but limits adoption among developers who exclusively use Node.js. Mitigation: Bun installation is a one-line command (`curl -fsSL https://bun.sh/install | bash`), and Claude Code documentation already references Bun for hook scripts.

2. **Two installation steps.** Users must install both the npm package and the plugin separately. Mitigation: The separation is intentional (server vs. hooks are different concerns), and the plugin installation is a single command. A future enhancement could detect the missing server and suggest installation.

3. **Build pipeline complexity.** The `build:publish` script must coordinate Vite (client), `bun build` (server + hooks), and file copying (GLB assets). Mitigation: The build steps are straightforward and can be orchestrated by a single shell script or `package.json` script chain.

4. **GLB assets in npm package.** The 10 GLB model files (~15MB total) increase the npm package size significantly compared to a typical CLI tool. Mitigation: These are essential 3D assets that cannot be deferred or lazily loaded without degrading the user experience. The npm registry has a 2GB package size limit, so this is well within bounds.

### Risks

1. **`${CLAUDE_PLUGIN_ROOT}` behavior uncertainty.** The template variable is part of Claude Code's plugin system, which is relatively new. If its behavior changes (e.g., variable not expanded in `command` fields, caching behavior changes), hook paths will break. Mitigation: Pin to a known-working Claude Code version in documentation, and test with each Claude Code update.

2. **Bun version compatibility.** The server uses `bun:sqlite` and `Bun.serve()` APIs that could change between Bun versions. Mitigation: Declare `"engines": { "bun": ">=1.0" }` and test against the latest stable Bun in CI.

3. **Port conflicts.** The default port 3333 may conflict with other local services. Mitigation: Support `VISUALIZER_PORT` env var (already implemented), document port configuration, and have the CLI `start` command report a clear error if the port is in use.

4. **Hook silent failures.** Hooks intentionally swallow all errors to avoid blocking Claude Code. If the server is not running or the URL is misconfigured, events are silently lost. Mitigation: The `claude-visualizer status` command can help users diagnose connectivity issues. A future enhancement could log hook errors to a file.

---

## Implementation Notes

### Build Pipeline (`build:publish`)

The build script must execute these steps in order:

1. **Build shared** -- `cd shared && tsc` (produces declaration files used by subsequent steps)
2. **Build client** -- `cd client && vite build --outDir ../dist/client` (Vite already resolves `@shared/*` via `resolve.alias`)
3. **Bundle server** -- `bun build server/src/index.ts --outdir dist/server --target bun` (inlines `@shared/*`)
4. **Build CLI** -- `bun build cli/src/cli.ts --outfile dist/cli.js --target bun` (new file to create)
5. **Copy GLB models** -- Copy `client/public/models/*.glb` to `dist/client/models/` (Vite copies public/ to build output automatically, but verify)
6. **Set shebang** -- Prepend `#!/usr/bin/env bun\n` to `dist/cli.js` and set executable permission

### CLI Entry Point (`cli/src/cli.ts`)

New file. Subcommands:

- `start [--port N] [--no-open]` -- Starts the server process (background by default), writes PID to `~/.claude-visualizer/server.pid`, optionally opens the browser.
- `stop` -- Reads PID file, sends SIGTERM, removes PID file. Falls back to `lsof -ti :PORT` if PID file is stale.
- `status` -- Checks if server is running (PID file + HTTP health check to `/api/health`), reports event count and client count.

The CLI resolves the client asset directory as `path.resolve(import.meta.dir, '../client')` and the server entry as `path.resolve(import.meta.dir, 'server/index.js')`.

### Server Modifications

The `server/src/index.ts` (or the built version) needs two changes for production mode:

1. **Static file serving.** For requests where the pathname does not start with `/api` and is not `/ws`, serve from the static client directory. Use `Bun.file()` for known extensions (`.js`, `.css`, `.html`, `.glb`, `.png`, `.ico`, `.svg`, `.woff2`) and fall back to `index.html` for everything else (SPA routing).

2. **Database path.** Accept a database path parameter. The CLI passes `~/.claude-visualizer/data.db`; the dev `bun run dev:server` command continues to use `./visualizer.db` by default.

The static file serving logic should check for a `CLAUDE_VISUALIZER_STATIC_DIR` env var or a constructor parameter, with a sensible default of `path.resolve(import.meta.dir, '../client')`.

### Hook Script Modifications

Each hook script needs one change: replace the hardcoded server URL construction with `CLAUDE_VISUALIZER_URL` support:

```typescript
// Before
const SERVER_URL = `http://localhost:${process.env.VISUALIZER_PORT || 3333}/api/events`;

// After
const SERVER_URL = process.env.CLAUDE_VISUALIZER_URL
  || `http://localhost:${process.env.VISUALIZER_PORT || 3333}/api/events`;
```

This change is backward compatible. Existing setups that use `VISUALIZER_PORT` continue to work.

### Plugin Manifest Update

The `.claude-plugin/plugin.json` must reference built JS files with `${CLAUDE_PLUGIN_ROOT}`:

```json
{
  "name": "claude-office-visualizer",
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

### Publishable `package.json`

The root `package.json` will be modified (or a separate one generated into `dist/`) for publishing:

```json
{
  "name": "claude-visualizer",
  "version": "0.1.0",
  "type": "module",
  "description": "Real-time 3D visualization of Claude Code agent orchestration",
  "bin": {
    "claude-visualizer": "./dist/cli.js"
  },
  "files": ["dist/"],
  "engines": { "bun": ">=1.0" },
  "license": "MIT"
}
```

Key points:
- `"private": true` must be removed (or the publish config placed in a generated package.json).
- `"workspaces"` is not needed in the published package.
- `"files": ["dist/"]` ensures only built artifacts are published, excluding source code, tests, and development configuration.
- No `"dependencies"` -- everything is inlined by `bun build` and Vite.

### Development Workflow Preservation

The following must remain unchanged:

- `bun run dev:server` starts the Bun server on port 3333 with source TypeScript and `--watch`.
- `bun run dev:client` starts the Vite dev server on port 5173 with proxy to 3333.
- `.claude/settings.local.json` with absolute paths to `hooks/src/*.ts` continues to work for hook testing during development.
- `bun test` in each package directory runs tests with the existing Bun test runner.
- `bun run typecheck` validates all packages via composite TypeScript builds.

The build pipeline adds new scripts (`build:publish`, `build:hooks`) but does not modify existing ones.

### Testing Strategy

The following should be verified before declaring the packaging feature complete:

1. **Build output integrity** -- `bun run build:publish` produces all expected files in `dist/`.
2. **CLI commands** -- `claude-visualizer start`, `stop`, and `status` work correctly with the built artifacts.
3. **Static file serving** -- The server correctly serves `dist/client/` assets and handles SPA fallback.
4. **Hook execution from plugin path** -- Running `bun run hooks/dist/session-start.js` from outside the monorepo works (no unresolved imports).
5. **Plugin registration** -- `claude --plugin-dir .` loads the updated `plugin.json` and hooks fire correctly.
6. **Database location** -- The server creates `~/.claude-visualizer/data.db` when started via CLI.
7. **Dev workflow** -- Existing `dev:server` + `dev:client` workflow is unaffected.
8. **Env var configuration** -- `CLAUDE_VISUALIZER_URL`, `CLAUDE_VISUALIZER_DB`, and `VISUALIZER_PORT` all work as expected.

### File Inventory

Files to create:
- `cli/src/cli.ts` -- CLI entry point with `start`/`stop`/`status` subcommands
- `scripts/build-publish.sh` (or equivalent `package.json` scripts) -- Build pipeline orchestrator

Files to modify:
- `package.json` (root) -- Add `build:publish`, `build:hooks` scripts; adjust for publishing
- `server/src/index.ts` -- Add static file serving and configurable database path
- `server/src/database.ts` -- Accept path parameter (already done, default needs to change based on context)
- `hooks/src/*.ts` (all 12) -- Add `CLAUDE_VISUALIZER_URL` env var support
- `.claude-plugin/plugin.json` -- Use `${CLAUDE_PLUGIN_ROOT}` and reference `hooks/dist/*.js`
- `.gitignore` -- Add `hooks/dist/` (build output)

Files unchanged:
- `shared/src/*` -- No changes needed
- `client/src/*` -- No changes needed
- `client/vite.config.ts` -- May need output directory change to `../dist/client`
- `.claude/settings.local.json` -- Continues to use absolute paths for dev (not checked into git)
