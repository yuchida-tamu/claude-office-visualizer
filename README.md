# claude-visualizer

Real-time 3D visualization of Claude Code agent orchestration. Watch your AI agents work in an interactive office scene powered by Three.js.

## Installation

### Via Marketplace (recommended)

```bash
# In Claude Code, add the marketplace and install:
/plugin marketplace add yuchida-tamu/my-agent-skills
/plugin install claude-office-visualizer@yuchida-agent-skills
```

### Via npm

```bash
# Install globally
npm install -g claude-office-visualizer

# Or with bun
bun install -g claude-office-visualizer
```

### Via --plugin-dir (development)

```bash
claude --plugin-dir /path/to/claude-office-visualizer
```

## Quick Start

```bash
# 1. Start the visualizer server
claude-visualizer start

# 2. Open http://localhost:3333 in your browser

# 3. Use Claude Code as normal — agents appear in the 3D scene in real-time

# 4. Stop when done
claude-visualizer stop
```

The plugin registers 12 hooks that capture session start/end, sub-agent spawn/stop, tool calls, messages, notifications, and more.

## CLI Commands

```
claude-visualizer start [options]   Start the visualizer server
claude-visualizer stop              Stop the visualizer server
claude-visualizer status            Show server status
claude-visualizer clean [--force]   Remove local data (db, pid file)
```

### Options (start)

| Flag | Description | Default |
|------|-------------|---------|
| `--port <number>` | Server port | `3333` |
| `--open` | Open browser after starting | `false` |
| `--db <path>` | Database file path | `~/.claude-visualizer/data.db` |

## Environment Variables

| Variable | Used By | Default | Description |
|----------|---------|---------|-------------|
| `VISUALIZER_PORT` | server, hooks | `3333` | Server listen port |
| `CLAUDE_VISUALIZER_URL` | hooks | `http://localhost:3333` | Full server URL for hooks |
| `CLAUDE_VISUALIZER_DB` | server | `~/.claude-visualizer/data.db` | SQLite database path |

## Development

```bash
# Install dependencies
bun install

# Start dev server (API + WebSocket on :3333)
bun run dev:server

# Start Vite dev client (HMR on :5173, proxies to :3333)
bun run dev:client

# Run tests
cd client && bun test
cd server && bun test
cd hooks && bun test
cd cli && bun test

# Type check all packages
bun run typecheck

# Production build
bun run build:publish
```

## Architecture

```
Claude Code hooks --> HTTP POST --> Bun server (SQLite + WebSocket) --> React client (Zustand + Three.js)
```

- **Hooks** (`hooks/`): 12 scripts mapped to Claude Code lifecycle events. Fire-and-forget with 5s timeout.
- **Server** (`server/`): Bun HTTP server with SQLite (WAL mode) persistence and WebSocket broadcast.
- **Client** (`client/`): React 19 + Zustand 5 + Three.js. Imperative 3D scene management via SceneBridge.
- **CLI** (`cli/`): `start`/`stop`/`status` commands with PID file lifecycle.
- **Shared** (`shared/`): TypeScript types shared across all packages.

## Requirements

- [Bun](https://bun.sh/) >= 1.0

## License

MIT
