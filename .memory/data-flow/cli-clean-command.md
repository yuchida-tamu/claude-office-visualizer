# CLI `clean` Command — Data Flow

## Overview

Adds a `claude-visualizer clean` command that removes all locally persisted data (`~/.claude-visualizer/`), with a `--force` flag to skip confirmation.

## Flow

```mermaid
flowchart TD
    A[claude-visualizer clean] --> B{Server running?}
    B -- Yes --> C[Stop server first]
    C --> D{--force flag?}
    B -- No --> D
    D -- Yes --> E[Remove ~/.claude-visualizer/]
    D -- No --> F[Print what will be deleted + prompt]
    F --> G{User confirms?}
    G -- Yes --> E
    G -- No --> H[Abort]
    E --> I[Print success]
```

## Files removed

- `~/.claude-visualizer/data.db` — SQLite database
- `~/.claude-visualizer/data.db-wal` — WAL journal
- `~/.claude-visualizer/data.db-shm` — shared memory
- `~/.claude-visualizer/server.pid` — PID file
- `~/.claude-visualizer/` — the directory itself
