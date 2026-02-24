import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';

describe('paths', () => {
  test('DATA_DIR is under the home directory', async () => {
    const { DATA_DIR } = await import('../paths');
    const home = homedir();
    expect(DATA_DIR.startsWith(home)).toBe(true);
    expect(DATA_DIR).toBe(join(home, '.claude-visualizer'));
  });

  test('PID_FILE is inside DATA_DIR', async () => {
    const { DATA_DIR, PID_FILE } = await import('../paths');
    expect(PID_FILE.startsWith(DATA_DIR)).toBe(true);
    expect(PID_FILE).toBe(join(DATA_DIR, 'server.pid'));
  });

  test('DEFAULT_DB_PATH is inside DATA_DIR', async () => {
    const { DATA_DIR, DEFAULT_DB_PATH } = await import('../paths');
    expect(DEFAULT_DB_PATH.startsWith(DATA_DIR)).toBe(true);
    expect(DEFAULT_DB_PATH).toBe(join(DATA_DIR, 'data.db'));
  });

  test('resolveServerEntry returns a path ending in server/index.js', async () => {
    const { resolveServerEntry } = await import('../paths');
    const serverPath = resolveServerEntry();
    expect(serverPath.endsWith('server/index.js')).toBe(true);
  });

  test('resolveClientDir returns a path ending in client', async () => {
    const { resolveClientDir } = await import('../paths');
    const clientPath = resolveClientDir();
    expect(clientPath.endsWith('client')).toBe(true);
  });
});
