# TrackMyDex

A self-hostable Pokémon TCG collection tracker and portfolio manager. Every era,
every expansion, every printing, in every language the cards were printed in -
with market estimates, set completion, a wishlist, and CSV in and out.

Built mobile-first and installable as a PWA.

---

## What it does

- **Catalog** - every western set (220+) *and* every Japanese, Korean and
  Chinese release (180 / 95 / 98 sets that have no western equivalent), from
  Base Set (1999) to the current era, including promos, trainer kits and one-off
  releases, in up to 16 printed languages.
- **Collection** - one-tap quantity changes, per-printing and per-language
  tracking, condition, purchase price and date, notes.
- **Valuation** - Cardmarket (EUR) and TCGplayer (USD) aggregates per printing,
  with every estimate labelled `exact` or `approximate` and the reason shown.
- **Portfolio** - total value, spend, unrealised gain, value by era, by language
  and by set, most valuable cards, set completion, and value over time.
- **Wishlist** - target prices, desired language and printing, direct market links.
- **Search** - by Pokémon, card name, number, set, set code, series, artist or
  rarity, with ownership, language, era, rarity, printing and price filters.
- **CSV** - full export with external identifiers, and an import with preview,
  validation and duplicate handling.
- **Admin** - data-source health, import and pricing jobs, error log, and manual
  marketplace mapping for printings the provider could not match.
- **Scan** - photograph a card (or several laid out flat) and identify it from
  its artwork, entirely on-device. See "Card scanning" below.
- **Interface** - English, French, Spanish, Portuguese, Italian and Japanese,
  switchable from any page without an account. The UI language and the printed
  language of a card are separate settings.
- **Themes** - vault (dark navy), black (true #000 for OLED), and light.
  Per-device, applied before first paint so there is no flash.

## Screens

| | |
| --- | --- |
| **Home** | Portfolio value, value over time, recently added, most valuable, value by era and language, sets in progress. |
| **Sets** | Era bands with gradient completion bars, then every set in that era with its own progress. |
| **Set** | Completion header, printed-language switch, and a card grid where missing cards render as empty binder sleeves. |
| **Card** | Full-resolution art, printing details, per-printing pricing with provenance, price history, and the collection editor. |
| **Collection** | Filterable, sortable list of every stack you own with inline quantity steppers. |
| **Wishlist** | Priority-ordered hunt list with target prices and market links. |

---

## Requirements

- **Docker** (recommended), or **Node 22+** and **PostgreSQL 14+** for local dev.
- No API keys. The default data and pricing provider is free and unauthenticated.

---

## Quick start with Docker

```bash
cp .env.example .env
```

Set at least `BETTER_AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Then:

```bash
docker compose up -d
```

The app is on <http://localhost:3000>. Migrations run automatically on start.

The catalog is empty until you import it. This takes 20-40 minutes and downloads
roughly 24,000 cards plus translations:

```bash
docker compose --profile import run --rm catalog-import
```

Optionally enable the nightly price refresh and portfolio snapshot:

```bash
docker compose --profile jobs up -d
```

To make yourself an administrator, put your address in `ADMIN_EMAILS` **before**
signing up. The role is granted at account creation.

---

## Local development

```bash
npm install
cp .env.example .env          # point DATABASE_URL at your Postgres
npm run db:generate           # only after changing the schema
npm run db:migrate
npm run dev
```

Import a single set first - it takes seconds instead of half an hour:

```bash
npm run sync:catalog -- --sets swsh3 --languages en,fr
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate SQL migrations from the Drizzle schema |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Browse the database |
| `npm run sync:catalog` | Import sets, cards, printings, translations and prices |
| `npm run sync:prices` | Targeted price refresh |
| `npm run sync:snapshots` | Daily price history and portfolio snapshot |
| `npm run scan:index` | Build the artwork fingerprint index used by scanning |
| `npm run mirror:assets` | Optional: mirror card images locally for offline use |

### Sync flags

```bash
npm run sync:catalog -- --sets base1,swsh3   # specific sets
npm run sync:catalog -- --languages fr,ja    # specific languages
npm run sync:catalog -- --skip-translations  # English only
npm run sync:catalog -- --force              # rewrite unchanged cards
npm run sync:catalog -- --skip-foreign-sets  # western sets only (much faster)

npm run sync:prices -- --limit 10000
npm run sync:prices -- --set sv08
npm run sync:prices -- --stalest
```

---

## Card scanning

Point the camera at a card and it is identified from its artwork. Everything
runs on-device: the photo never leaves the phone, only a 32-character
fingerprint is sent.

```bash
npm run scan:index          # ~36,000 downloads, about 15 minutes, resumable
```

**How it works.** Each card's illustration is reduced to a 128-bit perceptual
fingerprint (a DCT hash plus a difference hash) and stored in
`card.image_phash`. A scan detects card-shaped rectangles in the frame, hashes
each one, and the server ranks the catalogue by Hamming distance.

**Accuracy, measured on this build.** Five probe cards against the full 24,094
fingerprint index matched correctly at rank 1, three of them confidently. The
index has 112 collisions in 24,094 cards (0.46%).

Two deliberate design consequences, both from the limits of the technique:

1. **It proposes, you confirm.** Nothing is added without a tap, and the full
   shortlist is always one tap away. Published benchmarks for artwork hashing
   put rank-1 accuracy near 70%, so presenting one result as "the card" would be
   wrong too often.
2. **Artwork cannot tell you the language or the reprint.** The same
   illustration appears in six languages and across reprints. The printed
   language comes from your setting, shown on the scan screen; set and number
   are shown so you can check the rest.

Several cards in one photo work when they are flat, separated and not
overlapping. One card filling the frame is markedly more reliable, and the UI
says so.

## Sign in with Google

Already wired; it needs credentials, which only you can create:

1. Google Cloud Console, **APIs & Services -> Credentials -> Create OAuth client ID -> Web application**.
2. Authorised redirect URI: `https://your-host/api/auth/callback/google`
   (for local development, `http://localhost:3000/api/auth/callback/google`).
3. Put the client id and secret in `.env`:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Restart. The "Continue with Google" button appears on sign-in and sign-up only
when both variables are set, so a half-configured instance never shows a button
that cannot work.

## Configuration

Every variable is documented in [`.env.example`](./.env.example). The ones that
matter most:

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | - | Any Postgres 14+. Append `?sslmode=require` for managed hosts. |
| `BETTER_AUTH_SECRET` | - | Required. 32 random bytes. |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public origin. |
| `ADMIN_EMAILS` | empty | Addresses with admin access. Checked on every request, so you can add or remove an admin without touching the database. |
| `AUTH_ALLOW_SIGNUP` | `true` | Set `false` to lock a private instance. |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `true` | Email/password accounts must confirm their address. Google accounts are already verified by Google. Configure SMTP before opening public sign-up. |
| `CATALOG_LANGUAGES` | `en,fr,es,pt,it,ja` | Printed card languages to ingest. Trim to cut sync time and database size. |
| `PRICING_PROVIDERS` | `tcgdex` | Comma-separated provider keys. |
| `PRICE_SYNC_MAX_VARIANTS` | `0` (all) | Cap a price run. `0` prices the entire catalog. |
| `DEFAULT_CURRENCY` | `EUR` | `EUR` or `USD`. |
| `SMTP_URL` | empty | Without it, password-reset links are written to the logs. |
| `GOOGLE_CLIENT_ID` / `_SECRET` | empty | Filling both enables Google sign-in. |
| `CRON_SECRET` | empty | Enables `POST /api/cron/<job>`. |

---

## Scheduled jobs

Three jobs, each safe to re-run and protected by a Postgres advisory lock so two
copies never run at once:

| Job | Suggested cadence | What it does |
| --- | --- | --- |
| `catalog` | weekly | New sets and cards, updated printings and market ids. |
| `prices` | daily | Prices the **entire catalog**. Ordered owned/wishlisted first, then newest sets, then stalest, so an interrupted run still covers what matters. |
| `snapshot` | daily, after `prices` | Writes price history and each user's portfolio value. |

Drive them however your platform prefers:

```bash
# Host cron
0 3 * * * curl -fsS -X POST -H "authorization: Bearer $CRON_SECRET" https://your-host/api/cron/prices
0 4 * * * curl -fsS -X POST -H "authorization: Bearer $CRON_SECRET" https://your-host/api/cron/snapshot
0 5 * * 1 curl -fsS -X POST -H "authorization: Bearer $CRON_SECRET" https://your-host/api/cron/catalog
```

Or the `jobs` compose profile, or the buttons in the admin area.

**Price history starts the day you deploy.** No provider sells historical
Pokémon TCG prices, so the charts are built from these snapshots. The UI says so
rather than showing an empty chart as if data were missing.

---

## Deploying elsewhere

The app is a standard Next.js standalone build with one dependency, Postgres.
Nothing is coupled to a specific host.

- **VPS / Coolify / Dokploy** - `docker compose up -d` behind your reverse proxy.
  Set `APP_URL` to the public HTTPS origin so secure cookies are enabled.
- **Fly.io** - `fly launch` picks up the Dockerfile; attach Fly Postgres and set
  the secrets. Use Fly machines or an external scheduler for the cron endpoints.
- **Railway / Render** - deploy from the Dockerfile, attach their Postgres, and
  use their cron feature to hit `/api/cron/*`.
- **Vercel** - works, with two caveats: run the catalog import from your own
  machine or a container (it far exceeds any serverless timeout), and use Vercel
  Cron for the nightly jobs rather than the compose profile.
- **Supabase** - fine as *just* a Postgres host; set `DATABASE_URL` to the pooled
  connection string with `?sslmode=require`. Auth stays in this app.

`GET /api/health` reports process and database health for uptime checks and
container probes.

---

## Backups

Everything is in Postgres. There is no object storage and no uploaded media -
card art is served from the provider's CDN and never copied.

```bash
# Back up
docker compose exec -T db pg_dump -U trackmydex -Fc trackmydex > trackmydex-$(date +%F).dump

# Restore into an empty database
docker compose exec -T db pg_restore -U trackmydex -d trackmydex --clean --if-exists < trackmydex-2026-09-19.dump
```

What is worth backing up and what is not:

- **Irreplaceable** - `user`, `account`, `collection_item`, `wishlist_item`,
  `portfolio_snapshot`, `card_price_snapshot`. Losing these loses user data and
  accumulated history.
- **Rebuildable** - `series`, `set`, `card`, `card_variant`, the translation
  tables and `card_price`. A catalog re-import restores them.

For a smaller, faster backup of only what matters:

```bash
docker compose exec -T db pg_dump -U trackmydex -Fc \
  -t 'user' -t account -t session -t collection_item -t wishlist_item \
  -t portfolio_snapshot -t card_price_snapshot trackmydex > trackmydex-userdata.dump
```

Restore order matters: import the catalog first, then restore user data, because
collection rows reference cards by foreign key.

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | The research behind every technical choice, the provider comparison, and what is deliberately not claimed. |
| [`docs/DATA-SOURCES.md`](./docs/DATA-SOURCES.md) | Provider terms, licensing, rate limits and known coverage gaps. |
| [`docs/SCHEMA.md`](./docs/SCHEMA.md) | The data model, table by table, and why it is shaped this way. |
| [`docs/DESIGN.md`](./docs/DESIGN.md) | The visual system and the mobile interaction rules. |

---

## Honest limitations

These are design constraints, not bugs. Each is explained in the docs.

1. **Cardmarket's API is closed to new applicants**, so prices come from a
   provider that republishes Cardmarket aggregates. Product links are built from
   exact product ids, never from keyword searches.
2. **Prices are not condition-resolved.** Non-near-mint values are estimated with
   a documented multiplier table and labelled approximate.
3. **Language pricing is rule-based.** Western prints of a western set share one
   Cardmarket product and are priced exactly; Asian sets are priced exactly
   against their own products. Anything else is flagged as a substitution.
4. **Price history begins at first deployment.**
5. **Non-English metadata is incomplete for some older sets.** The UI falls back
   to the English name and says the card is unverified in that language.

---

## Legal

TrackMyDex is an unofficial fan project. Pokémon and the Pokémon TCG are
trademarks of Nintendo, Creatures Inc. and GAME FREAK Inc. This project is not
affiliated with, endorsed by, or sponsored by any of them, nor by Cardmarket or
TCGplayer.

Card images and card data are served from third-party providers under their own
terms; see [`docs/DATA-SOURCES.md`](./docs/DATA-SOURCES.md). Displayed prices are
estimates aggregated from public marketplace data. They are not an appraisal, not
an offer, and not investment advice.

The application source is MIT licensed. That licence covers this code only - not
the card data, the artwork, or the trademarks.
