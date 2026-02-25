/**
 * Unit tests for hooks/src/truncate.ts — payload truncation utilities.
 *
 * Tests:
 * - truncateString: truncates strings exceeding maxLen, appends ' [truncated]'
 * - truncateToolInput: truncates individual string values and overall serialized size
 */
import { describe, test, expect } from 'bun:test';
import { truncateString, truncateToolInput } from '../truncate';

describe('truncateString', () => {
  test('returns short strings unchanged', () => {
    expect(truncateString('hello', 2048)).toBe('hello');
  });

  test('returns string at exactly maxLen unchanged', () => {
    const exact = 'A'.repeat(2048);
    expect(truncateString(exact, 2048)).toBe(exact);
  });

  test('truncates string exceeding maxLen and appends marker', () => {
    const long = 'A'.repeat(3000);
    const result = truncateString(long, 2048);
    expect(result).toBe('A'.repeat(2048) + ' [truncated]');
  });

  test('returns empty string unchanged', () => {
    expect(truncateString('', 2048)).toBe('');
  });

  test('truncates string one char over maxLen', () => {
    const oneOver = 'B'.repeat(2049);
    const result = truncateString(oneOver, 2048);
    expect(result).toBe('B'.repeat(2048) + ' [truncated]');
  });
});

describe('truncateToolInput', () => {
  test('returns small input unchanged', () => {
    const input = { file_path: '/src/index.ts', line: 42 };
    const result = truncateToolInput(input, 8192);
    expect(result).toEqual(input);
  });

  test('truncates long string values within the object', () => {
    const longValue = 'X'.repeat(3000);
    const input = { content: longValue, name: 'test' };
    const result = truncateToolInput(input, 8192);
    expect(result.name).toBe('test');
    expect(result.content).toBe('X'.repeat(2048) + ' [truncated]');
  });

  test('preserves non-string values', () => {
    const input = { count: 42, flag: true, data: null, nested: { a: 1 } };
    const result = truncateToolInput(input, 8192);
    expect(result).toEqual(input);
  });

  test('replaces entire object when serialized size exceeds maxBytes', () => {
    // Create an object with many keys that exceeds 8192 bytes even after string truncation
    const input: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) {
      input[`field_${i}`] = 'Y'.repeat(500);
    }
    // 20 fields * ~500 chars = ~10000 bytes > 8192
    const result = truncateToolInput(input, 8192);
    expect(result._truncated).toBe(true);
    expect(Array.isArray(result._originalKeys)).toBe(true);
    const keys = result._originalKeys as string[];
    expect(keys).toContain('field_0');
    expect(keys).toContain('field_19');
  });

  test('returns empty object unchanged', () => {
    const result = truncateToolInput({}, 8192);
    expect(result).toEqual({});
  });

  test('handles object with string values just under maxBytes', () => {
    // Create object that is under 8192 bytes
    const input = { key: 'Z'.repeat(100) };
    const result = truncateToolInput(input, 8192);
    expect(result).toEqual(input);
  });

  test('string values at exactly 2048 chars are not truncated', () => {
    const input = { content: 'A'.repeat(2048) };
    const result = truncateToolInput(input, 8192);
    expect(result.content).toBe('A'.repeat(2048));
  });

  test('string values at 2049 chars are truncated', () => {
    const input = { content: 'A'.repeat(2049) };
    const result = truncateToolInput(input, 8192);
    expect(result.content).toBe('A'.repeat(2048) + ' [truncated]');
  });
});
