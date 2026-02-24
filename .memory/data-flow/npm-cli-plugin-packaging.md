# npm CLI + Claude Code Plugin Packaging (YUC-107)

## Overview

This document describes the build pipeline, distribution structure, and runtime data flows
for packaging claude-office-visualizer as both an npm-installable CLI tool and a standalone
Claude Code plugin.

---

## 1. Build Pipeline

The build pipeline has five stages executed in strict dependency order. Each stage
produces artifacts consumed by the next.

```mermaid
flowchart TD
    subgraph Stage1["Stage 1: shared (types)"]
        shared_src["shared/src/*.ts"]
        shared_build["tsc --build shared/"]
        shared_out["shared/dist/*.js + *.d.ts"]
        shared_src --> shared_build --> shared_out
    end

    subgraph Stage2["Stage 2: hooks (12 standalone bundles)"]
        hook_srcs["hooks/src/*.ts\n(12 files)"]
        bun_build_hooks["bun build --target=bun\n--outdir=hooks/dist/\neach hook as standalone entry"]
        hooks_out["hooks/dist/*.js\n(12 self-contained files,\n@shared/* inlined)"]
        hook_srcs --> bun_build_hooks --> hooks_out
    end

    subgraph Stage3["Stage 3: client (Vite SPA)"]
        client_src["client/src/**\nclient/public/models/*.glb"]
        vite_build["vite build\n(existing build script)"]
        client_out["client/dist/\n  index.html\n  assets/*.js, *.css\n  models/*.glb"]
        client_src --> vite_build --> client_out
    end

    subgraph Stage4["Stage 4: server (single Bun bundle)"]
        server_src["server/src/*.ts"]
        bun_build_server["bun build --target=bun\n--outfile=dist/server/index.js\n@shared/* inlined"]
        server_out["dist/server/index.js\n(standalone, no workspace deps)"]
        server_src --> bun_build_server --> server_out
    end

    subgraph Stage5["Stage 5: CLI entry + assembly"]
        cli_src["cli/src/cli.ts"]
        bun_build_cli["bun build --target=bun\n--outfile=dist/cli.js"]
        assemble["Copy artifacts:\n  client/dist/ -> dist/client/\n  hooks/dist/ -> hooks/dist/ (in-place)"]
        cli_out["dist/cli.js\n(shebang: #!/usr/bin/env bun)"]
        cli_src --> bun_build_cli --> cli_out
        client_out --> assemble
        server_out --> assemble
        cli_out --> assemble
    end

    shared_out --> Stage2
    shared_out --> Stage3
    shared_out --> Stage4
    shared_out --> Stage5

    style Stage1 fill:#1a1a2e,stroke:#e94560,color:#eee
    style Stage2 fill:#1a1a2e,stroke:#0f3460,color:#eee
    style Stage3 fill:#1a1a2e,stroke:#16213e,color:#eee
    style Stage4 fill:#1a1a2e,stroke:#533483,color:#eee
    style Stage5 fill:#1a1a2e,stroke:#e94560,color:#eee
```

### Build orchestration script (`build:publish`)

```
bun run build:shared       # Stage 1 - tsc (already exists)
bun run build:hooks        # Stage 2 - bun build x12
bun run build:client       # Stage 3 - vite build (already exists)
bun run build:server       # Stage 4 - bun build server
bun run build:cli          # Stage 5 - bun build cli + assemble
```

---

## 2. Final dist/ Structure (npm package contents)

```
package root/
  package.json            # bin: { "claude-visualizer": "dist/cli.js" }
  dist/
    cli.js                # #!/usr/bin/env bun - CLI entry point
    server/
      index.js            # Bundled server (shared types inlined)
    client/
      index.html          # SPA entry
      assets/             # JS, CSS bundles
      models/             # GLB 3D models (office, desk, icons, etc.)
  hooks/
    dist/                 # Bundled hook scripts (standalone .js)
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
  .claude-plugin/
    plugin.json           # Uses ${CLAUDE_PLUGIN_ROOT} paths
```

---

## 3. Runtime Data Flow: Development Mode (unchanged)

This is the existing workflow. Nothing changes here. Both Vite dev server and
Bun server run separately with hot reload.

```mermaid
flowchart LR
    subgraph Dev["Development Mode"]
        direction LR
        CC["Claude Code"]
        hooks_ts["hooks/src/*.ts\n(TypeScript source,\nrun via bun)"]
        server_ts["server/src/index.ts\n(bun run --watch)\nport 3333"]
        vite["Vite dev server\nport 5173\nproxy /api -> :3333\nproxy /ws -> :3333"]
        browser["Browser\nlocalhost:5173"]

        CC -- "stdin JSON" --> hooks_ts
        hooks_ts -- "POST http://localhost:3333/api/events" --> server_ts
        server_ts -- "WebSocket :3333/ws" --> vite
        vite -- "proxied WS" --> browser
        browser -- "HTTP /api/*" --> vite
        vite -- "proxy" --> server_ts
    end
```

Key: In dev mode, hooks import `@shared/*` via workspace resolution and
TypeScript paths. The Vite dev server proxies API and WebSocket traffic. No
build step needed for hooks or server.

---

## 4. Runtime Data Flow: Production / npm-installed Mode

After `npm install -g claude-visualizer` (or `bunx claude-visualizer`), the CLI
starts a single Bun process that serves both the API and the built client.

```mermaid
flowchart LR
    subgraph Prod["Production Mode (npm installed)"]
        direction LR
        CC2["Claude Code"]
        hooks_js["hooks/dist/*.js\n(pre-built, standalone)"]
        server_js["dist/server/index.js\n(single Bun process)\nport configurable"]
        client_html["dist/client/\n(static files served\nby same Bun process)"]
        browser2["Browser\nlocalhost:PORT"]

        CC2 -- "stdin JSON" --> hooks_js
        hooks_js -- "POST http://localhost:PORT/api/events\n(PORT from CLAUDE_VISUALIZER_URL\nor VISUALIZER_PORT)" --> server_js
        server_js -- "Static file serving\nfor non-API routes\n(SPA fallback)" --> client_html
        server_js -- "WebSocket /ws" --> browser2
        browser2 -- "HTTP /* (static)\nHTTP /api/* (API)\nWS /ws" --> server_js
    end
```

Key differences from dev mode:
- Single process: server serves both API and static client files
- No Vite proxy: browser connects directly to the Bun server
- Hooks are pre-built JS: no workspace resolution, no TypeScript compilation
- Database defaults to `~/.claude-visualizer/data.db` (not CWD)

---

## 5. CLI Command Flow

```mermaid
flowchart TD
    cli["claude-visualizer <command>"]

    cli --> start["start\n--port PORT\n--open"]
    cli --> stop["stop"]
    cli --> status["status"]

    subgraph StartFlow["start command"]
        check_running{"PID file exists\n& process alive?"}
        check_running -->|yes| already["Print: already running\nExit 0"]
        check_running -->|no| spawn["Bun.spawn(\n  dist/server/index.js\n)\ndetached: true"]
        spawn --> write_pid["Write PID to\n~/.claude-visualizer/server.pid"]
        write_pid --> wait_health["Poll /api/health\nup to 5s"]
        wait_health -->|healthy| print_url["Print server URL\n+ open browser if --open"]
        wait_health -->|timeout| print_fail["Print: failed to start\nExit 1"]
    end

    subgraph StopFlow["stop command"]
        read_pid["Read PID from\n~/.claude-visualizer/server.pid"]
        read_pid --> kill["process.kill(pid, SIGTERM)"]
        kill --> rm_pid["Remove PID file"]
        rm_pid --> confirm["Print: server stopped"]
    end

    subgraph StatusFlow["status command"]
        check_pid{"PID file exists\n& process alive?"}
        check_pid -->|yes| fetch_health["GET /api/health"]
        check_pid -->|no| not_running["Print: not running"]
        fetch_health --> show_info["Print:\n  Status: running\n  Port: PORT\n  Uptime: Xs\n  Events: N\n  Clients: N"]
    end

    start --> StartFlow
    stop --> StopFlow
    status --> StatusFlow
```

---

## 6. Server Static File Serving (Production Mode Detection)

```mermaid
flowchart TD
    req["Incoming HTTP Request"]
    req --> is_ws{pathname === '/ws'?}
    is_ws -->|yes| ws_upgrade["WebSocket upgrade\n(existing logic)"]
    is_ws -->|no| is_api{pathname starts\nwith '/api/'?}
    is_api -->|yes| api_routes["handleRequest()\n(existing routes.ts)"]
    is_api -->|no| has_client{CLIENT_DIR exists?\n(production mode)}
    has_client -->|no| not_found["404 Not Found\n(dev mode: Vite handles client)"]
    has_client -->|yes| try_static["Attempt to serve\nstatic file from\nCLIENT_DIR + pathname"]
    try_static --> file_exists{File found?}
    file_exists -->|yes| serve_file["Serve file with\ncorrect Content-Type"]
    file_exists -->|no| spa_fallback["Serve CLIENT_DIR/index.html\n(SPA fallback)"]
```

The server detects production mode by checking for the existence of the built
client directory relative to its own location (`../client/index.html` from
`dist/server/index.js`). In development, this directory does not exist, so the
server returns 404 for non-API routes (Vite handles them via proxy).

---

## 7. Hook Portability: URL Resolution

All 12 hooks currently hardcode `http://localhost:${VISUALIZER_PORT || 3333}/api/events`.
The change adds `CLAUDE_VISUALIZER_URL` as the primary override.

```mermaid
flowchart TD
    hook["Hook script starts"]
    hook --> check_url{CLAUDE_VISUALIZER_URL\nenv var set?}
    check_url -->|yes| use_url["SERVER_URL = CLAUDE_VISUALIZER_URL"]
    check_url -->|no| check_port{VISUALIZER_PORT\nenv var set?}
    check_port -->|yes| use_port["SERVER_URL =\nhttp://localhost:VISUALIZER_PORT/api/events"]
    check_port -->|no| use_default["SERVER_URL =\nhttp://localhost:3333/api/events"]

    use_url --> post["POST event to SERVER_URL"]
    use_port --> post
    use_default --> post
```

---

## 8. Plugin.json Transformation

Current (development -- relative paths, TypeScript source):
```json
{
  "hooks": {
    "SessionStart": [
      { "type": "command", "command": "bun run hooks/src/session-start.ts" }
    ]
  }
}
```

Target (distribution -- CLAUDE_PLUGIN_ROOT paths, pre-built JS):
```json
{
  "hooks": {
    "SessionStart": [
      { "type": "command", "command": "bun run ${CLAUDE_PLUGIN_ROOT}/hooks/dist/session-start.js" }
    ]
  }
}
```

The source plugin.json stays as-is for development. The build pipeline generates
the distribution version in the output directory, or the source is updated to use
`${CLAUDE_PLUGIN_ROOT}` and the development workflow uses a separate local override.

Decision: Keep two plugin.json variants:
- `.claude-plugin/plugin.json` -- committed, uses `${CLAUDE_PLUGIN_ROOT}` paths
  pointing to `hooks/dist/*.js` (works for both npm-installed and plugin installs)
- `.claude/settings.local.json` -- local dev override, not committed, uses
  `bun run hooks/src/*.ts` for development with hot TypeScript execution

---

## 9. Package.json Configuration for npm Publishing

```mermaid
flowchart TD
    subgraph RootPackageJson["Root package.json Changes"]
        direction TB
        name["name: claude-visualizer"]
        bin["bin: { claude-visualizer: dist/cli.js }"]
        files["files: [\n  dist/,\n  hooks/dist/,\n  .claude-plugin/\n]"]
        scripts["scripts: {\n  build:shared, build:hooks,\n  build:server, build:cli,\n  build:client,\n  build:publish (orchestrator),\n  prepublishOnly -> build:publish\n}"]
        private_remove["Remove private: true\n(or move to publishConfig)"]

        name --> bin --> files --> scripts --> private_remove
    end
```

---

## 10. Database Path Resolution

```mermaid
flowchart TD
    init["initDatabase(path?)"]
    init --> has_arg{path argument\nprovided?}
    has_arg -->|yes| use_arg["Use provided path"]
    has_arg -->|no| check_env{VISUALIZER_DB_PATH\nenv var set?}
    check_env -->|yes| use_env["Use env var path"]
    check_env -->|no| check_mode{Production mode?\n(running from dist/)"}
    check_mode -->|yes| use_home["~/.claude-visualizer/data.db\n(mkdir -p the directory)"]
    check_mode -->|no| use_cwd["visualizer.db\n(current directory, existing behavior)"]

    use_arg --> open_db["Open SQLite database"]
    use_env --> open_db
    use_home --> open_db
    use_cwd --> open_db
```

---

## 11. Dependency Graph Summary

```mermaid
flowchart BT
    shared["shared/\n(types only)"]
    hooks["hooks/\n(12 scripts)"]
    server["server/\n(HTTP + WS + SQLite)"]
    client["client/\n(React + Three.js)"]
    cli["cli/\n(start/stop/status)"]

    hooks --> shared
    server --> shared
    client --> shared
    cli --> server

    subgraph npm_package["npm package contents"]
        dist_cli["dist/cli.js"]
        dist_server["dist/server/index.js"]
        dist_client["dist/client/*"]
        hooks_dist["hooks/dist/*.js"]
        plugin_json[".claude-plugin/plugin.json"]
    end

    cli -.-> dist_cli
    server -.-> dist_server
    client -.-> dist_client
    hooks -.-> hooks_dist
```
