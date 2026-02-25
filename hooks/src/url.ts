/**
 * Shared URL resolution utility for hook scripts.
 *
 * Resolves the visualizer server URL for hook event posting.
 * Resolution order:
 * 1. CLAUDE_VISUALIZER_URL env var (full base URL, must be loopback)
 * 2. VISUALIZER_PORT env var (port only, must be numeric 1-65535)
 * 3. Default: http://localhost:3333/api/events
 *
 * Security: Only loopback addresses (localhost, 127.0.0.1, ::1) are accepted
 * for CLAUDE_VISUALIZER_URL. Non-loopback URLs fall back to the default.
 * VISUALIZER_PORT must be a valid integer port number (1-65535).
 */

const DEFAULT_URL = 'http://localhost:3333/api/events';

/** Hostnames that are considered loopback / safe. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Check whether a hostname resolves to loopback.
 * Accepts: localhost, 127.0.0.1, [::1]
 */
function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * Validate that a port string is a numeric integer in range 1-65535.
 * Returns the validated port number, or null if invalid.
 */
function validatePort(portStr: string): number | null {
  // Must be digits only (no spaces, dots, signs, or other characters)
  if (!/^\d+$/.test(portStr)) {
    return null;
  }
  const port = Number(portStr);
  if (port < 1 || port > 65535) {
    return null;
  }
  return port;
}

export function resolveServerUrl(): string {
  if (process.env.CLAUDE_VISUALIZER_URL) {
    try {
      const parsed = new URL(process.env.CLAUDE_VISUALIZER_URL);
      if (isLoopbackHost(parsed.hostname)) {
        const base = process.env.CLAUDE_VISUALIZER_URL.replace(/\/+$/, '');
        return `${base}/api/events`;
      }
    } catch {
      // Unparseable URL — fall through to default
    }
    // Non-loopback or unparseable: fall back to default (do not try VISUALIZER_PORT)
    return DEFAULT_URL;
  }

  if (process.env.VISUALIZER_PORT) {
    const port = validatePort(process.env.VISUALIZER_PORT);
    if (port !== null) {
      return `http://localhost:${port}/api/events`;
    }
    // Invalid port: fall back to default
    return DEFAULT_URL;
  }

  return DEFAULT_URL;
}
