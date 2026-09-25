import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const contextDirectory = new URL('../.context/', import.meta.url);
const source = new URL('dashboard.png', contextDirectory);
const destination = new URL('../docs/assets/pr-desk-dashboard.png', import.meta.url);
const playwrightCli = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
);

mkdirSync(contextDirectory, { recursive: true });

const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    'test',
    'e2e/dashboard.spec.ts',
    '--grep',
    'dashboard classification, source filters, browser action, and screenshot',
  ],
  { cwd: root, stdio: 'inherit' },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

copyFileSync(source, destination);
console.log(`Updated ${fileURLToPath(destination)}`);
