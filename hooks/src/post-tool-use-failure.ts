/**
 * Hook: PostToolUseFailure
 * Fires when a tool call fails.
 */
import type { ToolCallFailedEvent } from '@shared/events';
import { resolveServerUrl } from './url';

const SERVER_URL = resolveServerUrl();

async function main() {
  try {
    const input = await Bun.stdin.text();
    const data = JSON.parse(input);

    const event: ToolCallFailedEvent = {
      id: crypto.randomUUID(),
      type: 'ToolCallFailed',
      timestamp: new Date().toISOString(),
      session_id: data.session_id || 'unknown',
      tool_name: data.tool_name || 'unknown',
      error: data.error || 'Unknown error',
      tool_use_id: data.tool_use_id || '',
    };

    await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Silent fail — never block Claude Code
  }
}

main();
