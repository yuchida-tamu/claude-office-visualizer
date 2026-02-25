/**
 * Hook: PreToolUse
 * Fires before a tool call is executed.
 */
import type { ToolCallStartedEvent } from '@shared/events';
import { resolveServerUrl } from './url';
import { truncateToolInput } from './truncate';

const SERVER_URL = resolveServerUrl();

async function main() {
  try {
    const input = await Bun.stdin.text();
    const data = JSON.parse(input);

    const event: ToolCallStartedEvent = {
      id: crypto.randomUUID(),
      type: 'ToolCallStarted',
      timestamp: new Date().toISOString(),
      session_id: data.session_id || 'unknown',
      tool_name: data.tool_name || 'unknown',
      tool_input: truncateToolInput(data.tool_input || {}),
      tool_use_id: data.tool_use_id || crypto.randomUUID(),
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
