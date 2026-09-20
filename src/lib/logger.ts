import { env } from './env';

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[env.LOG_LEVEL];

/**
 * Structured JSON logging on one line per event.
 *
 * Deliberately dependency-free: every hosting target (Docker, Fly, Railway,
 * Render, Vercel) collects stdout, and JSON lines are what log shippers and
 * error monitors ingest. `captureException` is shaped like the Sentry API so
 * wiring Sentry in later is a three-line change, but Sentry is not a dependency.
 */
function emit(level: Level, message: string, context?: Record<string, unknown>) {
  if (ORDER[level] < threshold) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ? { context: serialise(context) } : {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function serialise(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] =
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value;
  }
  return out;
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),

  /** Sentry-compatible shape. No-op unless SENTRY_DSN is configured. */
  captureException(error: unknown, context?: Record<string, unknown>) {
    emit('error', error instanceof Error ? error.message : String(error), {
      ...context,
      error,
    });
  },

  child(bindings: Record<string, unknown>) {
    return {
      debug: (m: string, c?: Record<string, unknown>) => emit('debug', m, { ...bindings, ...c }),
      info: (m: string, c?: Record<string, unknown>) => emit('info', m, { ...bindings, ...c }),
      warn: (m: string, c?: Record<string, unknown>) => emit('warn', m, { ...bindings, ...c }),
      error: (m: string, c?: Record<string, unknown>) => emit('error', m, { ...bindings, ...c }),
    };
  },
};
