/**
 * Hook: Notification
 * Fires when Claude Code generates a notification.
 */
import type { WaitingForUserEvent } from '@shared/events';

const SERVER_URL = `http://localhost:${process.env.VISUALIZER_PORT || 3333}/api/events`;

async function main() {
  try {
    const input = await Bun.stdin.text();
    const data = JSON.parse(input);

    const event: WaitingForUserEvent = {
      id: crypto.randomUUID(),
      type: 'WaitingForUser',
      timestamp: new Date().toISOString(),
      session_id: data.session_id || 'unknown',
      notification_type: 'notification',
      message: data.message || '',
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
