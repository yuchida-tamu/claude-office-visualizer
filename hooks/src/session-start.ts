/**
 * Hook: SessionStart
 * Fires when a new Claude Code session begins.
 */
import type { SessionStartedEvent } from '@shared/events';
import { resolveServerUrl } from './url';

const SERVER_URL = resolveServerUrl();

async function main() {
  try {
    const input = await Bun.stdin.text();
    const data = JSON.parse(input);

    const event: SessionStartedEvent = {
      id: crypto.randomUUID(),
      type: 'SessionStarted',
      timestamp: new Date().toISOString(),
      session_id: data.session_id || 'unknown',
      agent_type: data.agent_type || 'unknown',
      model: data.model || 'unknown',
      source: data.source || 'cli',
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
