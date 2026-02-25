/**
 * Payload truncation utilities for hook scripts.
 *
 * Prevents unbounded data from being forwarded to the visualizer server.
 * Hooks must never crash, so these functions are defensive and never throw.
 */

/** Maximum length for individual string values within tool_input. */
const STRING_MAX_LENGTH = 2048;

/**
 * Truncate a string to maxLen characters, appending ' [truncated]' if trimmed.
 */
export function truncateString(str: string, maxLen: number = STRING_MAX_LENGTH): string {
  if (str.length <= maxLen) {
    return str;
  }
  return str.slice(0, maxLen) + ' [truncated]';
}

/**
 * Truncate a tool_input record:
 * 1. Truncate any string values exceeding 2048 characters.
 * 2. If the serialized result still exceeds maxBytes, replace with a
 *    stub containing only the original keys for debugging.
 */
export function truncateToolInput(
  input: Record<string, unknown>,
  maxBytes: number = 8192,
): Record<string, unknown> {
  // Step 1: Truncate individual string values
  const truncated: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      truncated[key] = truncateString(value);
    } else {
      truncated[key] = value;
    }
  }

  // Step 2: Check serialized size
  let serialized: string;
  try {
    serialized = JSON.stringify(truncated);
  } catch {
    // If serialization fails, return a safe stub
    return { _truncated: true, _originalKeys: Object.keys(input) };
  }

  if (serialized.length > maxBytes) {
    return { _truncated: true, _originalKeys: Object.keys(input) };
  }

  return truncated;
}
