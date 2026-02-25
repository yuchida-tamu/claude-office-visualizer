/**
 * Hook: SubagentStop
 * Fires when a sub-agent completes.
 */
import type { AgentCompletedEvent } from '@shared/events';
import { resolveServerUrl } from './url';

const SERVER_URL = resolveServerUrl();

async function main() {
  try {
    const input = await Bun.stdin.text();
    const data = JSON.parse(input);

    const event: AgentCompletedEvent = {
      id: crypto.randomUUID(),
      type: 'AgentCompleted',
      timestamp: new Date().toISOString(),
      session_id: data.session_id || 'unknown',
      agent_id: data.agent_id || '',
      transcript_path: data.transcript_path ?? null,
      result: data.result ?? null,
      ...(typeof data.input_tokens === 'number' ? { input_tokens: data.input_tokens } : {}),
      ...(typeof data.output_tokens === 'number' ? { output_tokens: data.output_tokens } : {}),
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
