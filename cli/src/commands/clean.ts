import { existsSync, readdirSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { DATA_DIR } from '../paths';

export interface CleanResult {
  removed: boolean;
  reason?: 'not_found';
}

export interface CleanDescription {
  exists: boolean;
  files: string[];
  dir: string;
}

export function describeClean(dataDir: string = DATA_DIR): CleanDescription {
  if (!existsSync(dataDir)) {
    return { exists: false, files: [], dir: dataDir };
  }
  const files = readdirSync(dataDir);
  return { exists: true, files, dir: dataDir };
}

export async function performClean(dataDir: string = DATA_DIR): Promise<CleanResult> {
  if (!existsSync(dataDir)) {
    return { removed: false, reason: 'not_found' };
  }
  rmSync(dataDir, { recursive: true, force: true });
  return { removed: true };
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export async function clean(args: string[]): Promise<void> {
  const force = args.includes('--force') || args.includes('-f');

  // Stop the server first if it's running
  const { stop } = await import('./stop');
  await stop();

  const info = describeClean();

  if (!info.exists) {
    console.log(`Nothing to clean — ${info.dir} does not exist.`);
    return;
  }

  console.log(`The following will be removed:`);
  console.log(`  ${info.dir}/`);
  for (const file of info.files) {
    console.log(`    ${file}`);
  }

  if (!force) {
    const ok = await confirm('\nProceed? (y/N) ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  const result = await performClean();
  if (result.removed) {
    console.log(`Removed ${info.dir}`);
  }
}
