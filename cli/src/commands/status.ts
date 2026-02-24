import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { PID_FILE } from '../paths';

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function status(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.log('Server is not running');
    return;
  }

  const pidStr = readFileSync(PID_FILE, 'utf-8').trim();
  const pid = parseInt(pidStr);

  if (isNaN(pid) || !isProcessAlive(pid)) {
    console.log('Server is not running (stale PID file)');
    unlinkSync(PID_FILE);
    return;
  }

  // Try to get health info
  try {
    const port = Number(process.env.VISUALIZER_PORT) || 3333;
    const res = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      console.log(`Server is running (PID ${pid})
  Port:    ${port}
  Uptime:  ${data.uptime}s
  Events:  ${data.eventCount}
  Clients: ${data.clientCount}`);
    } else {
      console.log(`Server process is running (PID ${pid}) but health check failed`);
    }
  } catch {
    console.log(`Server process is running (PID ${pid}) but not responding to health checks`);
  }
}
