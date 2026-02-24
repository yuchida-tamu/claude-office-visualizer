import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const CLI_PATH = path.resolve(import.meta.dir, '../cli.ts');

function runCli(...args: string[]) {
  const result = Bun.spawnSync(['bun', 'run', CLI_PATH, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

describe('CLI entry point', () => {
  test('--help shows usage text', () => {
    const result = runCli('--help');
    expect(result.stdout).toContain('claude-visualizer');
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('start');
    expect(result.stdout).toContain('stop');
    expect(result.stdout).toContain('status');
    expect(result.exitCode).toBe(0);
  });

  test('-h shows usage text', () => {
    const result = runCli('-h');
    expect(result.stdout).toContain('Usage:');
    expect(result.exitCode).toBe(0);
  });

  test('--version shows version', () => {
    const result = runCli('--version');
    expect(result.stdout).toContain('claude-visualizer 0.1.0');
    expect(result.exitCode).toBe(0);
  });

  test('-v shows version', () => {
    const result = runCli('-v');
    expect(result.stdout).toContain('claude-visualizer 0.1.0');
    expect(result.exitCode).toBe(0);
  });

  test('unknown command exits with error', () => {
    const result = runCli('foobar');
    expect(result.stderr).toContain('Unknown command: foobar');
    expect(result.exitCode).toBe(1);
  });

  test('no args shows usage text', () => {
    const result = runCli();
    expect(result.stdout).toContain('Usage:');
    expect(result.exitCode).toBe(0);
  });
});
