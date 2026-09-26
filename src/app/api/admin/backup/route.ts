import { spawn } from 'node:child_process';
import { adminRoute } from '@/server/api';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
/** A dump takes seconds, not milliseconds. */
export const maxDuration = 300;

/**
 * Download a complete backup of the database.
 *
 * The nightly dumps live on the same disk as the database they protect,
 * which makes them useless against the one failure that matters: losing the
 * machine. This is the copy an operator can take without an SSH client.
 *
 * Three things about it are deliberate.
 *
 * **It is a fresh dump, not last night's file.** A button labelled "get a
 * copy" that hands back something up to a day old is a trap, and the point
 * of pressing it is usually that you are about to do something risky.
 *
 * **It streams.** Buffering a 30 MB dump to build a response would hold it
 * in memory on a 12 GB box shared with another site, and would stall until
 * pg_dump finished rather than sending as it goes.
 *
 * **It is logged.** This response contains every user's email address, the
 * scrypt hash of their password and their whole collection. Anyone entitled
 * to press it is entitled to the data, but there should be a record that it
 * left.
 */
export const GET = adminRoute(
  async ({ user }) => {
    const url = new URL(env.DATABASE_URL);
    const database = url.pathname.replace(/^\//, '');

    logger.warn('admin.backup_downloaded', { by: user.email, database });

    /**
     * Credentials go through the environment, never the command line.
     *
     * `ps` is readable by other processes in the container, and a password
     * in argv would sit there for the life of the dump.
     */
    const child = spawn(
      'pg_dump',
      ['--no-owner', '--no-acl', '--format=plain', '--dbname', env.DATABASE_URL],
      { env: { ...process.env, PGCONNECT_TIMEOUT: '10' }, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      // Keep the tail only: a dump that fails late should not be able to
      // fill memory with its own complaints.
      stderr = (stderr + chunk.toString()).slice(-4000);
    });

    const dump = new ReadableStream<Uint8Array>({
      start(controller) {
        child.stdout.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        child.stdout.on('end', () => controller.close());
        child.on('error', (error) => {
          logger.error('admin.backup_failed', { by: user.email, error: String(error) });
          controller.error(error);
        });
        child.on('close', (code) => {
          if (code === 0) return;
          logger.error('admin.backup_failed', { by: user.email, code, stderr });
          // The stream is already open, so the browser has a partial file.
          // Erroring it is what stops that partial being saved as if whole.
          controller.error(new Error(`pg_dump exited ${code}`));
        });
      },
      cancel() {
        // The operator closed the tab. Do not keep dumping to nowhere.
        child.kill('SIGTERM');
      },
    });

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const filename = `trackmydex-${stamp}.sql`;

    // The DOM and Node stream typings disagree about the chunk type here;
    // both sides are Uint8Array at runtime.
    const gzipped = dump.pipeThrough(
      new CompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
    );

    return new Response(gzipped, {
      headers: {
        'content-type': 'application/gzip',
        'content-disposition': `attachment; filename="${filename}.gz"`,
        'cache-control': 'no-store, private',
      },
    }) as never;
  },
  // Dumping the whole database is not something to allow on a loop.
  { limit: LIMITS.adminSync, scope: 'backup' },
);
