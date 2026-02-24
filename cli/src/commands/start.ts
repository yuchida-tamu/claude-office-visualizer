import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { DATA_DIR, PID_FILE, DEFAULT_DB_PATH, resolveServerEntry, resolveClientDir } from '../paths';

export interface StartOptions {
  port: number;
  open: boolean;
  db: string;
}

export function parseOptions(args: string[]): StartOptions {
  const options: StartOptions = {
    port: Number(process.env.VISUALIZER_PORT) || 3333,
    open: false,
    db: process.env.CLAUDE_VISUALIZER_DB || DEFAULT_DB_PATH,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      options.port = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--open') {
      options.open = true;
    } else if (args[i] === '--db' && args[i + 1]) {
      options.db = args[i + 1];
      i++;
    }
  }
  return options;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function pollHealth(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) return true;
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(200);
  }
  return false;
}

export async function start(args: string[]): Promise<void> {
  const options = parseOptions(args);

  // Ensure data directory exists
  mkdirSync(DATA_DIR, { recursive: true });

  // Check if already running
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
    if (!isNaN(pid) && isProcessAlive(pid)) {
      console.log(`Server already running (PID ${pid})`);
      return;
    }
    // Stale PID file -- clean up
    unlinkSync(PID_FILE);
  }

  const serverEntry = resolveServerEntry();
  const clientDir = resolveClientDir();

  // Spawn detached server process
  const proc = Bun.spawn(['bun', 'run', serverEntry], {
    env: {
      ...process.env,
      VISUALIZER_PORT: String(options.port),
      CLAUDE_VISUALIZER_DB: options.db,
      VISUALIZER_CLIENT_DIR: clientDir,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  // Write PID file
  writeFileSync(PID_FILE, String(proc.pid));
  // Unref so CLI can exit while server continues
  proc.unref();

  // Wait for server to be healthy
  const healthy = await pollHealth(options.port, 5000);
  if (!healthy) {
    console.error('Server failed to start within 5 seconds');
    process.exit(1);
  }

  const url = `http://localhost:${options.port}`;
  console.log(`Visualizer server running at ${url} (PID ${proc.pid})`);

  if (options.open) {
    const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    Bun.spawn([openCmd, url]);
  }
}
