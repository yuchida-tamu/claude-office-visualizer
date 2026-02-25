/**
 * Unit tests for .claude-plugin/plugin.json manifest.
 *
 * Validates that plugin.json is well-formed, references all 12 hooks,
 * uses ${CLAUDE_PLUGIN_ROOT} for portability, and points to built JS files.
 */
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const PLUGIN_JSON_PATH = join(import.meta.dir, '..', '..', '..', '.claude-plugin', 'plugin.json');

/** All 12 Claude Code hook event names. */
const EXPECTED_HOOKS = [
  'SessionStart',
  'SessionEnd',
  'SubagentStart',
  'SubagentStop',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'UserPromptSubmit',
  'Stop',
  'Notification',
  'PermissionRequest',
  'PreCompact',
];

describe('plugin.json manifest', () => {
  let manifest: Record<string, unknown>;

  // Parse plugin.json once for all tests
  test('is valid JSON', () => {
    const raw = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
    manifest = JSON.parse(raw);
    expect(manifest).toBeDefined();
  });

  test('has name, version, and description', () => {
    const raw = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
    manifest = JSON.parse(raw);
    expect(manifest.name).toBe('claude-code-visualizer');
    expect(typeof manifest.version).toBe('string');
    expect((manifest.version as string).length).toBeGreaterThan(0);
    expect(typeof manifest.description).toBe('string');
    expect((manifest.description as string).length).toBeGreaterThan(0);
  });

  test('registers all 12 hooks', () => {
    const raw = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
    manifest = JSON.parse(raw);
    const hooks = manifest.hooks as Record<string, unknown>;
    expect(hooks).toBeDefined();

    for (const hookName of EXPECTED_HOOKS) {
      expect(hooks[hookName]).toBeDefined();
      expect(Array.isArray(hooks[hookName])).toBe(true);
      expect((hooks[hookName] as unknown[]).length).toBeGreaterThan(0);
    }
  });

  test('all hook entries use the nested { hooks: [...] } format', () => {
    const raw = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
    manifest = JSON.parse(raw);
    const hooks = manifest.hooks as Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>>;

    for (const hookName of EXPECTED_HOOKS) {
      const groups = hooks[hookName];
      for (const group of groups) {
        expect(group.hooks).toBeDefined();
        expect(Array.isArray(group.hooks)).toBe(true);
        expect(group.hooks.length).toBeGreaterThan(0);
      }
    }
  });

  test('all hook commands use ${CLAUDE_PLUGIN_ROOT}', () => {
    const raw = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
    manifest = JSON.parse(raw);
    const hooks = manifest.hooks as Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>>;

    for (const hookName of EXPECTED_HOOKS) {
      const groups = hooks[hookName];
      for (const group of groups) {
        for (const entry of group.hooks) {
          expect(entry.command).toContain('${CLAUDE_PLUGIN_ROOT}');
        }
      }
    }
  });

  test('all hook commands reference hooks/dist/*.js (not .ts)', () => {
    const raw = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
    manifest = JSON.parse(raw);
    const hooks = manifest.hooks as Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>>;

    for (const hookName of EXPECTED_HOOKS) {
      const groups = hooks[hookName];
      for (const group of groups) {
        for (const entry of group.hooks) {
          expect(entry.command).toMatch(/hooks\/dist\/[a-z-]+\.js$/);
          expect(entry.command).not.toContain('.ts');
        }
      }
    }
  });
});
