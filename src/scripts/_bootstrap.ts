/**
 * Loads `.env` before anything imports `@/lib/env`.
 *
 * Next.js does this for the app itself, but a `tsx` script has no such wrapper,
 * so every CLI entry point imports this file first.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(name: string) {
  try {
    const content = readFileSync(resolve(process.cwd(), name), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      if (process.env[key] !== undefined) continue;
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // Absent file is fine: variables may come from the container environment.
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

/** Parses `--key value` and `--flag` CLI arguments. */
export function parseArgs(argv = process.argv.slice(2)): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

export async function finish(code = 0): Promise<never> {
  const { pool } = await import('@/db');
  await pool.end().catch(() => undefined);
  process.exit(code);
}
