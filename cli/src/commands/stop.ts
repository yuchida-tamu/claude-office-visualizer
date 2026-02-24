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

export async function stop(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.log('Server is not running (no PID file found)');
    return;
  }

  const pidStr = readFileSync(PID_FILE, 'utf-8').trim();
  const pid = parseInt(pidStr);

  if (isNaN(pid)) {
    console.log('Invalid PID file, cleaning up');
    unlinkSync(PID_FILE);
    return;
  }

  if (!isProcessAlive(pid)) {
    console.log('Server is not running (stale PID file), cleaning up');
    unlinkSync(PID_FILE);
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Server stopped (PID ${pid})`);
  } catch (err) {
    console.error(`Failed to stop server (PID ${pid}):`, err);
  }

  // Clean up PID file
  try {
    unlinkSync(PID_FILE);
  } catch {
    // Already cleaned up
  }
}
