/**
 * Unit tests for hook scripts.
 *
 * Each hook reads stdin JSON, transforms it into a VisualizerEvent, and POSTs to
 * the server. We test the transformation logic by mocking Bun.stdin.text() and
 * globalThis.fetch, then dynamically importing each hook module.
 */
import { describe, test, expect, mock } from 'bun:test';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Captured fetch call. */
interface CapturedCall {
  url: string;
  body: Record<string, unknown>;
}

let capturedCalls: CapturedCall[] = [];
let stdinText = '';

/**
 * Set up mocks before each test:
 * - Bun.stdin.text() returns `stdinText`
 * - fetch captures calls instead of hitting the network
 */
function setupMocks() {
  capturedCalls = [];

  // Mock Bun.stdin.text()
  // @ts-expect-error — overriding readonly stdin for testing
  Bun.stdin = {
    text: () => Promise.resolve(stdinText),
  };

  // Mock fetch to capture calls
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string);
    capturedCalls.push({ url: String(url), body });
    return new Response('ok', { status: 200 });
  }) as unknown as typeof fetch;
}

/**
 * Set stdin data and run a hook module by importing it fresh.
 * We use a unique query parameter to bust the module cache.
 */
let importCounter = 0;
async function runHook(hookPath: string, input: Record<string, unknown>) {
  stdinText = JSON.stringify(input);
  setupMocks();
  // Bust the module cache with a unique query param
  await import(`../${hookPath}?t=${++importCounter}`);
  // Allow any microtasks to settle
  await new Promise((r) => setTimeout(r, 10));
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('session-start hook', () => {
  test('transforms input into SessionStarted event', async () => {
    await runHook('session-start.ts', {
      session_id: 'sess-123',
      agent_type: 'root',
      model: 'claude-opus-4',
      source: 'vscode',
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('SessionStarted');
    expect(event.session_id).toBe('sess-123');
    expect(event.agent_type).toBe('root');
    expect(event.model).toBe('claude-opus-4');
    expect(event.source).toBe('vscode');
    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeDefined();
  });

  test('uses defaults for missing fields', async () => {
    await runHook('session-start.ts', {});

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('SessionStarted');
    expect(event.session_id).toBe('unknown');
    expect(event.agent_type).toBe('unknown');
    expect(event.model).toBe('unknown');
    expect(event.source).toBe('cli');
  });
});

describe('session-end hook', () => {
  test('transforms input into SessionEnded event', async () => {
    await runHook('session-end.ts', {
      session_id: 'sess-123',
      reason: 'normal',
      summary: 'Task completed successfully',
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('SessionEnded');
    expect(event.session_id).toBe('sess-123');
    expect(event.reason).toBe('normal');
    expect(event.summary).toBe('Task completed successfully');
  });

  test('defaults reason to normal', async () => {
    await runHook('session-end.ts', { session_id: 'sess-123' });

    const event = capturedCalls[0].body;
    expect(event.reason).toBe('normal');
    expect(event.summary).toBeNull();
  });
});

describe('stop hook', () => {
  test('transforms input into SessionEnded event with stop reason', async () => {
    await runHook('stop.ts', {
      session_id: 'sess-456',
      reason: 'stop',
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('SessionEnded');
    expect(event.session_id).toBe('sess-456');
    expect(event.reason).toBe('stop');
  });

  test('defaults reason to stop (not normal)', async () => {
    await runHook('stop.ts', { session_id: 'sess-456' });

    const event = capturedCalls[0].body;
    expect(event.reason).toBe('stop');
  });
});

describe('subagent-start hook', () => {
  test('transforms input into AgentSpawned event', async () => {
    await runHook('subagent-start.ts', {
      session_id: 'parent-sess',
      agent_id: 'a8efeee',
      parent_session_id: 'parent-sess',
      agent_type: 'researcher',
      model: 'claude-sonnet-4',
      task_description: 'Research the codebase',
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('AgentSpawned');
    expect(event.session_id).toBe('parent-sess');
    expect(event.agent_id).toBe('a8efeee');
    expect(event.parent_session_id).toBe('parent-sess');
    expect(event.agent_type).toBe('researcher');
    expect(event.model).toBe('claude-sonnet-4');
    expect(event.task_description).toBe('Research the codebase');
  });

  test('falls back parent_session_id to session_id when not provided', async () => {
    await runHook('subagent-start.ts', {
      session_id: 'parent-sess',
      agent_id: 'b9ffeee',
    });

    const event = capturedCalls[0].body;
    expect(event.parent_session_id).toBe('parent-sess');
  });

  test('parent_session_id is null when both parent_session_id and session_id are missing', async () => {
    await runHook('subagent-start.ts', {
      agent_id: 'c0aabbb',
    });

    const event = capturedCalls[0].body;
    // data.parent_session_id is undefined, data.session_id is undefined
    // undefined ?? undefined ?? null = null
    expect(event.parent_session_id).toBeNull();
  });

  test('uses defaults for missing fields', async () => {
    await runHook('subagent-start.ts', {});

    const event = capturedCalls[0].body;
    expect(event.session_id).toBe('unknown');
    expect(event.agent_type).toBe('unknown');
    expect(event.model).toBe('unknown');
    expect(event.task_description).toBeNull();
    // agent_id gets a generated UUID when missing
    expect(event.agent_id).toBeDefined();
  });
});

describe('subagent-stop hook', () => {
  test('transforms input into AgentCompleted event', async () => {
    await runHook('subagent-stop.ts', {
      session_id: 'parent-sess',
      agent_id: 'a8efeee',
      transcript_path: '/tmp/transcript.json',
      result: 'Analysis complete',
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('AgentCompleted');
    expect(event.session_id).toBe('parent-sess');
    expect(event.agent_id).toBe('a8efeee');
    expect(event.transcript_path).toBe('/tmp/transcript.json');
    expect(event.result).toBe('Analysis complete');
  });

  test('uses defaults for missing fields', async () => {
    await runHook('subagent-stop.ts', {});

    const event = capturedCalls[0].body;
    expect(event.session_id).toBe('unknown');
    expect(event.agent_id).toBe('');
    expect(event.transcript_path).toBeNull();
    expect(event.result).toBeNull();
  });
});

describe('pre-tool-use hook', () => {
  test('transforms input into ToolCallStarted event', async () => {
    await runHook('pre-tool-use.ts', {
      session_id: 'sess-123',
      tool_name: 'Read',
      tool_input: { file_path: '/src/index.ts' },
      tool_use_id: 'tool-abc',
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('ToolCallStarted');
    expect(event.session_id).toBe('sess-123');
    expect(event.tool_name).toBe('Read');
    expect(event.tool_input).toEqual({ file_path: '/src/index.ts' });
    expect(event.tool_use_id).toBe('tool-abc');
  });

  test('uses defaults for missing fields', async () => {
    await runHook('pre-tool-use.ts', {});

    const event = capturedCalls[0].body;
    expect(event.session_id).toBe('unknown');
    expect(event.tool_name).toBe('unknown');
    expect(event.tool_input).toEqual({});
    // tool_use_id falls back to a UUID
    expect(event.tool_use_id).toBeDefined();
    expect(typeof event.tool_use_id).toBe('string');
  });
});

describe('post-tool-use hook', () => {
  test('transforms input into ToolCallCompleted event for normal tools', async () => {
    await runHook('post-tool-use.ts', {
      session_id: 'sess-123',
      tool_name: 'Read',
      tool_response: 'file contents here',
      duration_ms: 42,
      tool_use_id: 'tool-abc',
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('ToolCallCompleted');
    expect(event.session_id).toBe('sess-123');
    expect(event.tool_name).toBe('Read');
    expect(event.tool_response).toBe('file contents here');
    expect(event.duration_ms).toBe(42);
    expect(event.tool_use_id).toBe('tool-abc');
  });

  test('emits MessageSent for Task tool calls', async () => {
    await runHook('post-tool-use.ts', {
      session_id: 'sess-123',
      tool_name: 'Task',
      tool_input: {
        name: 'researcher',
        prompt: 'Investigate the bug in auth module',
      },
      tool_use_id: 'tool-def',
    });

    expect(capturedCalls).toHaveLength(2);

    const toolEvent = capturedCalls[0].body;
    expect(toolEvent.type).toBe('ToolCallCompleted');
    expect(toolEvent.tool_name).toBe('Task');

    const msgEvent = capturedCalls[1].body;
    expect(msgEvent.type).toBe('MessageSent');
    expect(msgEvent.from_agent).toBe('sess-123');
    expect(msgEvent.to_agent).toBe('researcher');
    expect(msgEvent.content_preview).toBe('Investigate the bug in auth module');
  });

  test('emits MessageSent for SendMessage tool calls', async () => {
    await runHook('post-tool-use.ts', {
      session_id: 'sess-123',
      tool_name: 'SendMessage',
      tool_input: {
        recipient: 'team-lead',
        content: 'Task is complete',
      },
      tool_use_id: 'tool-ghi',
    });

    expect(capturedCalls).toHaveLength(2);

    const msgEvent = capturedCalls[1].body;
    expect(msgEvent.type).toBe('MessageSent');
    expect(msgEvent.from_agent).toBe('sess-123');
    expect(msgEvent.to_agent).toBe('team-lead');
    expect(msgEvent.content_preview).toBe('Task is complete');
  });

  test('SendMessage uses recipient over name for to_agent', async () => {
    await runHook('post-tool-use.ts', {
      session_id: 'sess-123',
      tool_name: 'SendMessage',
      tool_input: {
        recipient: 'specific-agent',
        name: 'other-agent',
        content: 'Hello',
      },
      tool_use_id: 'tool-jkl',
    });

    const msgEvent = capturedCalls[1].body;
    expect(msgEvent.to_agent).toBe('specific-agent');
  });

  test('Task uses name for to_agent', async () => {
    await runHook('post-tool-use.ts', {
      session_id: 'sess-123',
      tool_name: 'Task',
      tool_input: {
        name: 'builder',
        prompt: 'Build the feature',
      },
      tool_use_id: 'tool-mno',
    });

    const msgEvent = capturedCalls[1].body;
    expect(msgEvent.to_agent).toBe('builder');
  });

  test('truncates content_preview to 100 characters', async () => {
    const longContent = 'A'.repeat(200);
    await runHook('post-tool-use.ts', {
      session_id: 'sess-123',
      tool_name: 'SendMessage',
      tool_input: {
        recipient: 'team-lead',
        content: longContent,
      },
      tool_use_id: 'tool-pqr',
    });

    const msgEvent = capturedCalls[1].body;
    expect(msgEvent.content_preview).toBe('A'.repeat(100));
    expect(String(msgEvent.content_preview).length).toBe(100);
  });

  test('does not emit MessageSent for non-Task/SendMessage tools', async () => {
    await runHook('post-tool-use.ts', {
      session_id: 'sess-123',
      tool_name: 'Bash',
      tool_use_id: 'tool-stu',
    });

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0].body.type).toBe('ToolCallCompleted');
  });

  test('uses defaults for missing fields', async () => {
    await runHook('post-tool-use.ts', {});

    const event = capturedCalls[0].body;
    expect(event.session_id).toBe('unknown');
    expect(event.tool_name).toBe('unknown');
    expect(event.tool_response).toBeNull();
    expect(event.duration_ms).toBe(0);
    expect(event.tool_use_id).toBe('');
  });
});

describe('post-tool-use-failure hook', () => {
  test('transforms input into ToolCallFailed event', async () => {
    await runHook('post-tool-use-failure.ts', {
      session_id: 'sess-123',
      tool_name: 'Bash',
      error: 'Command not found',
      tool_use_id: 'tool-abc',
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('ToolCallFailed');
    expect(event.session_id).toBe('sess-123');
    expect(event.tool_name).toBe('Bash');
    expect(event.error).toBe('Command not found');
    expect(event.tool_use_id).toBe('tool-abc');
  });

  test('uses defaults for missing fields', async () => {
    await runHook('post-tool-use-failure.ts', {});

    const event = capturedCalls[0].body;
    expect(event.session_id).toBe('unknown');
    expect(event.tool_name).toBe('unknown');
    expect(event.error).toBe('Unknown error');
    expect(event.tool_use_id).toBe('');
  });
});

describe('pre-compact hook', () => {
  test('calculates context_pressure from tokens', async () => {
    await runHook('pre-compact.ts', {
      session_id: 'sess-123',
      context_tokens: 75000,
      max_tokens: 100000,
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('ContextCompaction');
    expect(event.session_id).toBe('sess-123');
    expect(event.context_pressure).toBe(0.75);
  });

  test('context_pressure is 0 when tokens are missing', async () => {
    await runHook('pre-compact.ts', { session_id: 'sess-123' });

    const event = capturedCalls[0].body;
    expect(event.context_pressure).toBe(0);
  });

  test('context_pressure is 0 when only context_tokens provided', async () => {
    await runHook('pre-compact.ts', {
      session_id: 'sess-123',
      context_tokens: 75000,
    });

    const event = capturedCalls[0].body;
    expect(event.context_pressure).toBe(0);
  });

  test('context_pressure is 0 when only max_tokens provided', async () => {
    await runHook('pre-compact.ts', {
      session_id: 'sess-123',
      max_tokens: 100000,
    });

    const event = capturedCalls[0].body;
    expect(event.context_pressure).toBe(0);
  });

  test('handles zero max_tokens (division by zero)', async () => {
    await runHook('pre-compact.ts', {
      session_id: 'sess-123',
      context_tokens: 75000,
      max_tokens: 0,
    });

    const event = capturedCalls[0].body;
    // 0 is falsy, so the condition fails and defaults to 0
    expect(event.context_pressure).toBe(0);
  });
});

describe('notification hook', () => {
  test('transforms input into WaitingForUser event with notification type', async () => {
    await runHook('notification.ts', {
      session_id: 'sess-123',
      message: 'Task completed, awaiting review',
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('WaitingForUser');
    expect(event.session_id).toBe('sess-123');
    expect(event.notification_type).toBe('notification');
    expect(event.message).toBe('Task completed, awaiting review');
  });

  test('uses empty string for missing message', async () => {
    await runHook('notification.ts', { session_id: 'sess-123' });

    const event = capturedCalls[0].body;
    expect(event.message).toBe('');
  });
});

describe('permission-request hook', () => {
  test('transforms input into WaitingForUser event with permission_request type', async () => {
    await runHook('permission-request.ts', {
      session_id: 'sess-123',
      message: 'Allow file write?',
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('WaitingForUser');
    expect(event.session_id).toBe('sess-123');
    expect(event.notification_type).toBe('permission_request');
    expect(event.message).toBe('Allow file write?');
  });

  test('falls back to tool_name when message is missing', async () => {
    await runHook('permission-request.ts', {
      session_id: 'sess-123',
      tool_name: 'Bash',
    });

    const event = capturedCalls[0].body;
    expect(event.message).toBe('Bash');
  });

  test('uses empty string when both message and tool_name are missing', async () => {
    await runHook('permission-request.ts', { session_id: 'sess-123' });

    const event = capturedCalls[0].body;
    expect(event.message).toBe('');
  });
});

describe('user-prompt-submit hook', () => {
  test('transforms input into UserPrompt event', async () => {
    await runHook('user-prompt-submit.ts', {
      session_id: 'sess-123',
      prompt: 'Fix the login bug',
    });

    expect(capturedCalls).toHaveLength(1);
    const event = capturedCalls[0].body;
    expect(event.type).toBe('UserPrompt');
    expect(event.session_id).toBe('sess-123');
    expect(event.prompt_text).toBe('Fix the login bug');
  });

  test('uses empty string for missing prompt', async () => {
    await runHook('user-prompt-submit.ts', { session_id: 'sess-123' });

    const event = capturedCalls[0].body;
    expect(event.prompt_text).toBe('');
  });
});

describe('common behavior', () => {
  test('all events POST to the correct server URL', async () => {
    await runHook('session-start.ts', { session_id: 'sess-123' });

    expect(capturedCalls[0].url).toBe('http://localhost:3333/api/events');
  });

  test('all events have UUID id and ISO timestamp', async () => {
    await runHook('session-start.ts', { session_id: 'sess-123' });

    const event = capturedCalls[0].body;
    // UUID v4 format: 8-4-4-4-12 hex
    expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    // ISO timestamp
    expect(new Date(String(event.timestamp)).toISOString()).toBe(event.timestamp);
  });
});
