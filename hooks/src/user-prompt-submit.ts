/**
 * Hook: UserPromptSubmit
 * Fires when the user submits a prompt.
 */
import type { UserPromptEvent } from '@shared/events';

const SERVER_URL = `http://localhost:${process.env.VISUALIZER_PORT || 3333}/api/events`;

async function main() {
  try {
    const input = await Bun.stdin.text();
    const data = JSON.parse(input);

    const event: UserPromptEvent = {
      id: crypto.randomUUID(),
      type: 'UserPrompt',
      timestamp: new Date().toISOString(),
      session_id: data.session_id || 'unknown',
      prompt_text: data.prompt || '',
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
