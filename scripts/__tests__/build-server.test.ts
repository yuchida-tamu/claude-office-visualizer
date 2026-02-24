/**
 * Integration tests for the server build script.
 * Runs the actual build and verifies the output.
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '../..');
const SERVER_BUNDLE = path.resolve(ROOT, 'dist/server/index.js');

describe('build:server', () => {
  beforeAll(() => {
    const result = Bun.spawnSync(['bun', 'run', 'scripts/build-server.ts'], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString();
      const stdout = result.stdout.toString();
      throw new Error(
        `build:server failed with exit code ${result.exitCode}\nstdout: ${stdout}\nstderr: ${stderr}`
      );
    }
  }, 30_000);

  test('dist/server/index.js exists', () => {
    expect(existsSync(SERVER_BUNDLE)).toBe(true);
  });

  test('bundle has non-zero file size', () => {
    const stat = statSync(SERVER_BUNDLE);
    expect(stat.size).toBeGreaterThan(0);
  });

  test('no unresolved @shared/* imports in the bundle', () => {
    const content = readFileSync(SERVER_BUNDLE, 'utf-8');

    expect(content).not.toContain('from "@shared');
    expect(content).not.toContain("from '@shared");
    expect(content).not.toContain('require("@shared');
    expect(content).not.toContain("require('@shared");
  });

  test('bundle is valid JavaScript (parseable)', () => {
    const content = readFileSync(SERVER_BUNDLE, 'utf-8');

    expect(() => {
      new Bun.Transpiler({ loader: 'js' }).scan(content);
    }).not.toThrow();
  });
});
