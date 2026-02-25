/**
 * Hook: PostToolUse
 * Fires after a tool call completes successfully.
 * Also detects Task/SendMessage tool calls to emit MessageSent events.
 */
import type { ToolCallCompletedEvent, MessageSentEvent } from '@shared/events';
import { resolveServerUrl } from './url';
import { truncateString } from './truncate';

const SERVER_URL = resolveServerUrl();

async function main() {
  try {
    const input = await Bun.stdin.text();
    const data = JSON.parse(input);

    const rawResponse = data.tool_response ?? null;
    const truncatedResponse = typeof rawResponse === 'string'
      ? truncateString(rawResponse)
      : rawResponse;

    const event: ToolCallCompletedEvent = {
      id: crypto.randomUUID(),
      type: 'ToolCallCompleted',
      timestamp: new Date().toISOString(),
      session_id: data.session_id || 'unknown',
      tool_name: data.tool_name || 'unknown',
      tool_response: truncatedResponse,
      duration_ms: data.duration_ms || 0,
      tool_use_id: data.tool_use_id || '',
    };

    const events: Array<ToolCallCompletedEvent | MessageSentEvent> = [event];

    // Detect inter-agent messages (Task or SendMessage tool calls)
    if (data.tool_name === 'Task' || data.tool_name === 'SendMessage') {
      const msgEvent: MessageSentEvent = {
        id: crypto.randomUUID(),
        type: 'MessageSent',
        timestamp: new Date().toISOString(),
        session_id: data.session_id || 'unknown',
        from_agent: data.session_id || 'unknown',
        to_agent: data.tool_input?.recipient || data.tool_input?.name || 'unknown',
        content_preview: String(data.tool_input?.content || data.tool_input?.prompt || '').slice(0, 100),
      };
      events.push(msgEvent);
    }

    await Promise.all(
      events.map((e) =>
        fetch(SERVER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(e),
          signal: AbortSignal.timeout(5000),
        })
      )
    );
  } catch {
    // Silent fail — never block Claude Code
  }
}

main();
