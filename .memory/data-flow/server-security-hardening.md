# Server Security Hardening

## Overview

Harden the server package against three High-severity security findings:
1. Unbounded request body size (memory exhaustion)
2. No string length limits in event validation (payload inflation)
3. Wildcard CORS origin (cross-origin abuse from non-localhost)

## Data Flow (Before)

```mermaid
graph LR
    Hook[Hook Script] -->|POST /api/events| Server[Bun.serve]
    Browser[Browser Client] -->|GET/POST /api/*| Server
    External[Any Origin] -->|CORS: *| Server

    Server --> Validate[validateEvent]
    Validate -->|No size limits| DB[(SQLite)]
```

## Data Flow (After)

```mermaid
graph LR
    Hook[Hook Script] -->|POST /api/events| Server[Bun.serve<br/>maxRequestBodySize: 1MB]
    Browser[Browser Client] -->|GET/POST /api/*| Server
    External[Non-localhost Origin] -->|CORS: blocked| Server

    Server --> CORS{Origin Check}
    CORS -->|localhost/127.0.0.1/::1<br/>or no Origin header| Allow[handleRequest]
    CORS -->|foreign origin| Block[empty ACAO header]

    Allow --> Validate[validateEvent<br/>field length limits<br/>payload size: 64KB max]
    Validate -->|valid| DB[(SQLite)]
    Validate -->|too long / too large| Reject[400 error]
```

## Fix Details

### Fix 1: maxRequestBodySize (index.ts)
- Add `maxRequestBodySize: 1_048_576` to `Bun.serve()` options
- Bun rejects bodies over 1MB automatically (413 status)
- No test needed; config-only change

### Fix 2: String length limits (validation.ts)
- `id`: max 256 chars
- `timestamp`: max 64 chars
- `session_id`: max 256 chars
- Overall payload: `JSON.stringify(body).length <= 65536` (64KB)
- Checks added after type checks, before final return

### Fix 3: Localhost-only CORS (routes.ts)
- Replace `Access-Control-Allow-Origin: *` with dynamic origin validation
- Allowed patterns: `http://localhost:*`, `http://127.0.0.1:*`, `http://[::1]:*`
- Requests without Origin header (curl, hooks, server-to-server) are allowed
- `corsHeaders(req)` function replaces static `CORS_HEADERS` object

## Design Decisions
- Requests without an Origin header are allowed through (non-browser clients)
- If Origin is present but not localhost, the response still returns but with no ACAO header, so the browser enforces the block
- The `json()` helper now needs the request passed through for CORS header generation
