/**
 * Test environment.
 *
 * `src/lib/env.ts` fails fast on missing configuration, which is the behaviour
 * we want in production but would make every unit test require a real .env.
 * These values are syntactically valid and never connect to anything: the
 * tests here cover pure logic, not integration.
 */
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-value-at-least-16-chars';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.CATALOG_LANGUAGES ??= 'en,fr';
process.env.PRICING_PROVIDERS ??= 'tcgdex';
process.env.LOG_LEVEL ??= 'error';
