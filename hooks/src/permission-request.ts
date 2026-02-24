/**
 * Hook: PermissionRequest
 * Fires when Claude Code requests a permission from the user.
 */
import type { WaitingForUserEvent } from '@shared/events';
import { resolveServerUrl } from './url';

const SERVER_URL = resolveServerUrl();

async function main() {
  try {
    const input = await Bun.stdin.text();
    const data = JSON.parse(input);

    const event: WaitingForUserEvent = {
      id: crypto.randomUUID(),
      type: 'WaitingForUser',
      timestamp: new Date().toISOString(),
      session_id: data.session_id || 'unknown',
      notification_type: 'permission_request',
      message: data.message || data.tool_name || '',
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
