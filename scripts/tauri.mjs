import { run } from '@tauri-apps/cli';

const args = process.argv.slice(2);
const separator = args.indexOf('--');
const options = separator === -1 ? args : args.slice(0, separator);
const development = options[0] === 'dev' || (options[0] === 'build' && options.includes('--debug'));

if (development) {
  // Keep the override before any arguments forwarded to Cargo or the application.
  args.splice(
    separator === -1 ? args.length : separator,
    0,
    '--config',
    'src-tauri/tauri.dev.conf.json',
  );
}

try {
  await run(args, 'npm run tauri');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
