/**
 * Hook: SubagentStart
 * Fires when a sub-agent is spawned.
 */
import type { AgentSpawnedEvent } from '@shared/events';

const SERVER_URL = `http://localhost:${process.env.VISUALIZER_PORT || 3333}/api/events`;

async function main() {
  try {
    const input = await Bun.stdin.text();
    const data = JSON.parse(input);

    const event: AgentSpawnedEvent = {
      id: crypto.randomUUID(),
      type: 'AgentSpawned',
      timestamp: new Date().toISOString(),
      session_id: data.session_id || 'unknown',
      agent_id: data.agent_id || crypto.randomUUID(),
      parent_session_id: data.parent_session_id ?? data.session_id ?? null,
      agent_type: data.agent_type || 'unknown',
      model: data.model || 'unknown',
      task_description: data.task_description ?? null,
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
