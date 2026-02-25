import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Use a temp directory to avoid touching real ~/.claude-visualizer/
const TEST_DATA_DIR = join(tmpdir(), `claude-viz-clean-test-${process.pid}`);

// We test the clean logic directly, not via subprocess,
// because the subprocess would use the real DATA_DIR.
// The clean module accepts a dataDir parameter for testability.

beforeEach(() => {
  mkdirSync(TEST_DATA_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

describe('clean command', () => {
  test('removes data directory and all contents', async () => {
    // Set up fake data files
    writeFileSync(join(TEST_DATA_DIR, 'data.db'), 'fake-db');
    writeFileSync(join(TEST_DATA_DIR, 'data.db-wal'), 'fake-wal');
    writeFileSync(join(TEST_DATA_DIR, 'data.db-shm'), 'fake-shm');
    writeFileSync(join(TEST_DATA_DIR, 'server.pid'), '12345');

    const { performClean } = await import('../commands/clean');
    const result = await performClean(TEST_DATA_DIR);

    expect(result.removed).toBe(true);
    expect(existsSync(TEST_DATA_DIR)).toBe(false);
  });

  test('reports nothing to clean when directory does not exist', async () => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });

    const { performClean } = await import('../commands/clean');
    const result = await performClean(TEST_DATA_DIR);

    expect(result.removed).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  test('reports files that will be removed via describe function', async () => {
    writeFileSync(join(TEST_DATA_DIR, 'data.db'), 'fake-db');
    writeFileSync(join(TEST_DATA_DIR, 'server.pid'), '12345');

    const { describeClean } = await import('../commands/clean');
    const info = describeClean(TEST_DATA_DIR);

    expect(info.exists).toBe(true);
    expect(info.files.length).toBeGreaterThanOrEqual(2);
    expect(info.files).toContain('data.db');
    expect(info.files).toContain('server.pid');
  });

  test('describe returns empty for non-existent directory', async () => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });

    const { describeClean } = await import('../commands/clean');
    const info = describeClean(TEST_DATA_DIR);

    expect(info.exists).toBe(false);
    expect(info.files).toEqual([]);
  });
});

describe('CLI integration', () => {
  test('--help includes clean command', () => {
    const CLI_PATH = join(import.meta.dir, '..', 'cli.ts');
    const result = Bun.spawnSync(['bun', 'run', CLI_PATH, '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.stdout.toString()).toContain('clean');
  });
});
