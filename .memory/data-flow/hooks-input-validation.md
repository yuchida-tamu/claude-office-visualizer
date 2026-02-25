# Hooks Input Validation & Truncation

Security hardening for hook scripts: validate URL inputs and truncate large payloads.

## URL Validation (resolveServerUrl)

```mermaid
flowchart TB
    env_url["CLAUDE_VISUALIZER_URL env var"]
    env_port["VISUALIZER_PORT env var"]
    default_url["Default: http://localhost:3333"]

    env_url --> parse_url["Parse as URL"]
    parse_url --> check_host{"hostname is\nlocalhost / 127.0.0.1 / ::1?"}
    check_host -->|yes| use_custom["Use custom URL + /api/events"]
    check_host -->|no| fallback_default["Fall back to default URL"]
    parse_url -->|parse error| fallback_default

    env_port --> validate_port{"Numeric integer\n1-65535?"}
    validate_port -->|yes| use_port["http://localhost:{port}/api/events"]
    validate_port -->|no| fallback_default

    default_url --> fallback_default["http://localhost:3333/api/events"]
```

## Payload Truncation (pre-tool-use & post-tool-use)

```mermaid
flowchart TB
    subgraph PreToolUse["pre-tool-use.ts"]
        tool_input["tool_input: Record<string, unknown>"]
        tool_input --> truncate_values["truncateToolInput()"]
        truncate_values --> check_strings{"Each string value\n> 2048 chars?"}
        check_strings -->|yes| truncate_str["Truncate to 2048 + ' [truncated]'"]
        check_strings -->|no| keep["Keep as-is"]
        truncate_str --> serialize["JSON.stringify()"]
        keep --> serialize
        serialize --> check_size{"> 8192 bytes?"}
        check_size -->|yes| replace["{ _truncated: true, _originalKeys: [...keys] }"]
        check_size -->|no| use_result["Use truncated object"]
    end

    subgraph PostToolUse["post-tool-use.ts"]
        tool_response["tool_response: string | null"]
        tool_response --> check_resp{"> 2048 chars?"}
        check_resp -->|yes| truncate_resp["Truncate to 2048 + ' [truncated]'"]
        check_resp -->|no| keep_resp["Keep as-is"]
    end
```

## Module Structure

```mermaid
flowchart LR
    truncate_ts["hooks/src/truncate.ts\n- truncateString()\n- truncateToolInput()"]
    url_ts["hooks/src/url.ts\n- resolveServerUrl()\n- isLoopbackHost()\n- isValidPort()"]

    pre_tool["hooks/src/pre-tool-use.ts"] --> truncate_ts
    post_tool["hooks/src/post-tool-use.ts"] --> truncate_ts
    pre_tool --> url_ts
    post_tool --> url_ts
```
