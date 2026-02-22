/**
 * Hook: PreCompact
 * Fires before context compaction occurs.
 */
import type { ContextCompactionEvent } from '@shared/events';

const SERVER_URL = `http://localhost:${process.env.VISUALIZER_PORT || 3333}/api/events`;

async function main() {
  try {
    const input = await Bun.stdin.text();
    const data = JSON.parse(input);

    const event: ContextCompactionEvent = {
      id: crypto.randomUUID(),
      type: 'ContextCompaction',
      timestamp: new Date().toISOString(),
      session_id: data.session_id || 'unknown',
      context_pressure: data.context_tokens && data.max_tokens
        ? data.context_tokens / data.max_tokens
        : 0,
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
