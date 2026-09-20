/**
 * Copies the static assets next to the standalone server.
 *
 * `output: 'standalone'` emits a self-contained `.next/standalone/server.js`
 * that expects `.next/static` and `public` to sit beside it. The Dockerfile
 * already does this; this script is the local equivalent so `npm start` works
 * on a developer machine too.
 *
 * Without it the server runs but every static asset 404s - the page loads with
 * correct HTML and no stylesheet, which looks like a CSS bug and is not one.
 */
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const standalone = resolve(root, '.next/standalone');

if (!existsSync(standalone)) {
  console.error('No .next/standalone - run `npm run build` first.');
  process.exit(1);
}

await mkdir(resolve(standalone, '.next'), { recursive: true });
await cp(resolve(root, '.next/static'), resolve(standalone, '.next/static'), { recursive: true });
if (existsSync(resolve(root, 'public'))) {
  await cp(resolve(root, 'public'), resolve(standalone, 'public'), { recursive: true });
}
console.log('standalone assets ready');
