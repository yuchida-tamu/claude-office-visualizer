/**
 * Integration tests for the hooks build script.
 * Runs the actual build and verifies the output.
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '../..');
const HOOKS_DIST = path.resolve(ROOT, 'hooks/dist');

const EXPECTED_HOOKS = [
  'session-start.js',
  'session-end.js',
  'stop.js',
  'subagent-start.js',
  'subagent-stop.js',
  'pre-tool-use.js',
  'post-tool-use.js',
  'post-tool-use-failure.js',
  'user-prompt-submit.js',
  'notification.js',
  'permission-request.js',
  'pre-compact.js',
];

describe('build:hooks', () => {
  beforeAll(() => {
    const result = Bun.spawnSync(['bun', 'run', 'scripts/build-hooks.ts'], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString();
      const stdout = result.stdout.toString();
      throw new Error(
        `build:hooks failed with exit code ${result.exitCode}\nstdout: ${stdout}\nstderr: ${stderr}`
      );
    }
  }, 30_000);

  test('produces exactly 12 .js files in hooks/dist/', () => {
    expect(existsSync(HOOKS_DIST)).toBe(true);

    const files = readdirSync(HOOKS_DIST).filter(f => f.endsWith('.js'));
    expect(files.length).toBe(12);
  });

  test('all expected hook files exist', () => {
    for (const hookFile of EXPECTED_HOOKS) {
      const filePath = path.join(HOOKS_DIST, hookFile);
      expect(existsSync(filePath)).toBe(true);
    }
  });

  test('no @shared/* imports remain in built files', () => {
    for (const hookFile of EXPECTED_HOOKS) {
      const filePath = path.join(HOOKS_DIST, hookFile);
      const content = readFileSync(filePath, 'utf-8');

      // Neither single-quoted nor double-quoted @shared imports should remain
      expect(content).not.toContain('from "@shared');
      expect(content).not.toContain("from '@shared");
      expect(content).not.toContain('require("@shared');
      expect(content).not.toContain("require('@shared");
    }
  });

  test('each built file is valid JavaScript (parseable)', () => {
    for (const hookFile of EXPECTED_HOOKS) {
      const filePath = path.join(HOOKS_DIST, hookFile);
      const content = readFileSync(filePath, 'utf-8');

      // Bun's transpiler can parse the JS to verify syntax
      expect(() => {
        new Bun.Transpiler({ loader: 'js' }).scan(content);
      }).not.toThrow();
    }
  });

  test('each built file has non-zero size', () => {
    for (const hookFile of EXPECTED_HOOKS) {
      const filePath = path.join(HOOKS_DIST, hookFile);
      const content = readFileSync(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });
});
