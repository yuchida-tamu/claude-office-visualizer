/**
 * Hook: Stop
 * Fires when the agent stops (session ends or is interrupted).
 */
import type { SessionEndedEvent } from '@shared/events';
import { resolveServerUrl } from './url';

const SERVER_URL = resolveServerUrl();

async function main() {
  try {
    const input = await Bun.stdin.text();
    const data = JSON.parse(input);

    const event: SessionEndedEvent = {
      id: crypto.randomUUID(),
      type: 'SessionEnded',
      timestamp: new Date().toISOString(),
      session_id: data.session_id || 'unknown',
      reason: data.reason || 'stop',
      summary: data.summary ?? null,
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
