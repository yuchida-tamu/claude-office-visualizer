/**
 * Shared URL resolution utility for hook scripts.
 *
 * Resolves the visualizer server URL for hook event posting.
 * Resolution order:
 * 1. CLAUDE_VISUALIZER_URL env var (full base URL)
 * 2. VISUALIZER_PORT env var (port only, constructs localhost URL)
 * 3. Default: http://localhost:3333/api/events
 */
export function resolveServerUrl(): string {
  if (process.env.CLAUDE_VISUALIZER_URL) {
    const base = process.env.CLAUDE_VISUALIZER_URL.replace(/\/+$/, '');
    return `${base}/api/events`;
  }
  const port = process.env.VISUALIZER_PORT || '3333';
  return `http://localhost:${port}/api/events`;
}
