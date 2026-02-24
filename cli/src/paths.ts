import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const DATA_DIR = join(homedir(), '.claude-visualizer');
export const PID_FILE = join(DATA_DIR, 'server.pid');
export const DEFAULT_DB_PATH = join(DATA_DIR, 'data.db');

export function resolveServerEntry(): string {
  // When bundled, cli.js is at dist/cli.js, server at dist/server/index.js
  // When running from source, import.meta.dir is cli/src/
  return resolve(import.meta.dir, 'server', 'index.js');
}

export function resolveClientDir(): string {
  // When bundled, cli.js is at dist/cli.js, client at dist/client/
  // When running from source, import.meta.dir is cli/src/
  return resolve(import.meta.dir, 'client');
}
