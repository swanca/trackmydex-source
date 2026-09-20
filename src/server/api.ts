import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { AuthUser } from '@/lib/auth';
import { getApiUser, isAdmin } from '@/lib/session';
import { logger } from '@/lib/logger';
import { LIMITS, clientKey, rateLimit, type RateLimitOptions } from '@/lib/rate-limit';

/**
 * Route-handler plumbing.
 *
 * Centralised so every endpoint gets the same three guarantees: the user is
 * re-derived from the session (never read from the request body), the request
 * is rate limited, and an unexpected throw becomes a logged 500 with no stack
 * leaked to the client.
 */

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function error(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export const unauthorized = () => error('Sign in to continue', 401);
export const forbidden = () => error('Not allowed', 403);

interface HandlerContext {
  user: AuthUser;
  request: Request;
}

/**
 * Wraps an authenticated handler.
 *
 * `limit` keys the token bucket by user id, so one noisy client cannot exhaust
 * another's budget, and a signed-out request never reaches the handler at all.
 */
export function authed(
  handler: (context: HandlerContext) => Promise<NextResponse>,
  options: { limit?: RateLimitOptions; scope?: string } = {},
) {
  return async (request: Request): Promise<NextResponse> => {
    try {
      const user = await getApiUser();
      if (!user) return unauthorized();

      const limit = options.limit ?? LIMITS.mutation;
      const result = await rateLimit(`${options.scope ?? 'api'}:${user.id}`, limit);
      if (!result.allowed) {
        return NextResponse.json(
          { error: 'Too many requests' },
          { status: 429, headers: { 'retry-after': String(result.retryAfterSeconds) } },
        );
      }

      return await handler({ user, request });
    } catch (cause) {
      return handleError(cause);
    }
  };
}

/** For endpoints that work signed out, such as public search. */
export function publicRoute(
  handler: (context: { request: Request; user: AuthUser | null }) => Promise<NextResponse>,
  options: { limit?: RateLimitOptions; scope?: string } = {},
) {
  return async (request: Request): Promise<NextResponse> => {
    try {
      const user = await getApiUser();
      const key = user ? `${options.scope ?? 'api'}:${user.id}` : clientKey(request, options.scope ?? 'api');
      const result = await rateLimit(key, options.limit ?? LIMITS.search);
      if (!result.allowed) {
        return NextResponse.json(
          { error: 'Too many requests' },
          { status: 429, headers: { 'retry-after': String(result.retryAfterSeconds) } },
        );
      }
      return await handler({ request, user });
    } catch (cause) {
      return handleError(cause);
    }
  };
}

export function adminRoute(
  handler: (context: HandlerContext) => Promise<NextResponse>,
  options: { limit?: RateLimitOptions; scope?: string } = {},
) {
  return authed(async (context) => {
    if (!isAdmin(context.user)) return forbidden();
    return handler(context);
  }, options);
}

function handleError(cause: unknown): NextResponse {
  if (cause instanceof ZodError) {
    const first = cause.issues[0];
    return error(first ? `${first.path.join('.')}: ${first.message}` : 'Invalid request', 422);
  }
  if (cause instanceof Error && cause.name === 'NotFoundError') {
    return error(cause.message, 404);
  }
  if (cause instanceof Error && cause.name === 'SyncLockedError') {
    return error(cause.message, 409);
  }

  logger.captureException(cause, { where: 'route-handler' });
  return error('Something went wrong', 500);
}

/** Parses a JSON body, returning `{}` rather than throwing on an empty body. */
export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
