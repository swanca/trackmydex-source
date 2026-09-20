# TrackMyDex - Technical research & architecture decisions

> Research performed 2026-09-19. Every external service listed below was probed live
> (HTTP requests, GraphQL schema introspection) rather than assumed from memory, because
> the Pokémon TCG data ecosystem changes frequently.

---

## 1. Data source research

### Candidates evaluated

| Source | Coverage | Languages | Variants | Market IDs | Prices | Key | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **TCGdex** (`api.tcgdex.net/v2`) | 220 EN sets incl. promos, trainer kits, misc; 23,736 EN cards | **16** (en, fr, de, es, it, pt, pt-br, ja, ko, zh-tw, zh-cn, id, th, nl, pl, ru) | `variants_detailed[]`, stable `variantId` per printing | **Cardmarket `idProduct` + TCGplayer `productId` per variant** | **Cardmarket (EUR) + TCGplayer (USD) embedded** | none | **Primary** |
| pokemontcg.io v2 | EN only | 1 | limited | cardmarket/tcgplayer URLs | yes | optional | **Returned HTTP 500** on `/v2/sets` during testing - not dependable as a primary source. Kept as an *optional* secondary provider. |
| Cardmarket official API (`apiv2.cardmarket.com`) | full EU marketplace | - | - | native | native | OAuth1 | **Not accepting new API applications**; gated behind professional-seller status. Cannot be a dependency. |
| TCGplayer API | US marketplace | EN | yes | native | native | partner approval | Closed partner programme. |
| Scrydex | multi-TCG | multi | yes | yes | yes | paid | No free tier (from $29/mo). Optional provider only. |
| JustTCG | multi-TCG | EN | condition-level | yes | yes | free tier 1,000 calls/**month** | Too small a free tier for a 23k-card catalog. Optional provider only. |
| Scraping Cardmarket / TCGplayer HTML | - | - | - | - | - | - | Prohibited by both sites' terms. Explicitly excluded. |

### Decision

**TCGdex is the canonical catalog and the baseline pricing provider.**

Why:

1. **It is the only free source that covers every era in every printed language.**
   Base Set (1999) through the current era, plus POP, trainer kits, promos and
   `misc` one-offs. Asian-language data (`ja`, `ko`, `zh-tw`, `zh-cn`, `th`, `id`)
   is maintained alongside western data.
2. **It models variants natively.** A card exposes
   `variants {normal, holo, reverse, firstEdition, wPromo}` *and*
   `variants_detailed[]` where each entry carries its own stable `variantId`,
   a `thirdParty` block and its own `pricing` block. That is exactly the
   granularity the product needs, so an approximate cross-variant match never has
   to masquerade as a market valuation.
3. **It yields an exact Cardmarket product mapping** (`thirdParty.cardmarket` is the
   Cardmarket `idProduct`) without Cardmarket API credentials, so we can link to a
   real product page instead of fabricating a search URL.
4. The underlying dataset (`github.com/tcgdex/cards-database`) is **MIT-licensed**
   and self-hostable, so the project is not hostage to one hosted endpoint.
5. No API key and no per-seat cost, so the core product stays usable by a
   self-hoster with zero paid subscriptions.

Documented limitations live in [`DATA-SOURCES.md`](./DATA-SOURCES.md): non-English
metadata coverage is partial for some old sets, and pricing is language-agnostic
(see section 2).

### Ingestion strategy

TCGdex publishes no bulk dump, and its FAQ asks consumers to cache responses
locally rather than re-fetching the same data. So:

* The catalog is **mirrored into PostgreSQL** and served from there. The browser
  never talks to TCGdex and never receives the whole catalog.
* **English is the canonical pass for western sets.** One `GET /v2/en/cards/{id}`
  per card gives rarity, illustrator, category, types, `variants_detailed`,
  market ids and prices.
* **Asian releases get their own canonical pass.** Japanese, Korean and Chinese
  sets are separate products with their own ids, series and marketplace
  entries - 180, 95 and 98 sets respectively that do not exist in the English
  catalogue at all. A second discovery pass ingests them in their own language
  and records `set.originLanguage`, which is what lets a Japanese card in a
  Japanese set be priced exactly rather than flagged as a substitution.
* **Translations are a cheap second pass.** `GET /v2/{lang}/sets/{setId}` returns
  every card of that set with its localized `name`, `localId` and image base URL in
  a single request. Roughly 1,800 requests covers all 16 languages.
* Sync is **incremental and idempotent**. Sets are compared on `cardCount` plus
  `releaseDate`; cards on the provider `updated` timestamp and a content hash.
  Re-running a sync never duplicates rows - every write is an upsert against a
  natural key.
* Concurrency is capped and retried with exponential backoff. Every failure is
  written to `sync_error` and surfaced in the admin area.

Images are **never re-hosted**. We store the TCGdex asset base URL and render
`{base}/{quality}.{ext}` through the Next.js image pipeline (`low.webp` in grids,
`high.png` on detail views). This respects the asset licence and keeps storage at zero.

---

## 2. Pricing architecture

### The constraint

Cardmarket is closed to new API applicants. TCGplayer's partner programme is closed.
Scraping either is prohibited by their terms. **No self-hostable application can
obtain authoritative, condition-level, per-language market prices for free.** The
honest response is to design around that rather than pretend otherwise.

### What we can honestly do

TCGdex republishes daily Cardmarket aggregates (`avg`, `low`, `trend`, `avg1`,
`avg7`, `avg30`, plus `-holo` counterparts) and TCGplayer per-finish aggregates
(`lowPrice`, `midPrice`, `highPrice`, `marketPrice`, `directLowPrice`) keyed by the
exact product ids. That is a genuine market signal, so:

* `PricingProvider` is an interface (`src/providers/pricing/types.ts`).
  `TcgdexPricingProvider` is the default, zero-config implementation.
  `PokemonTcgIoPricingProvider` and any commercial provider are **env-gated and
  optional**; the app is fully functional with none of them enabled.
* Every stored price carries `confidence` (`exact` or `approximate`) plus the
  provider, the currency, the source variant and `fetchedAt`.
  * `exact` - the price came from the provider's own record for *this* card and
    *this* variant.
  * `approximate` - a printing with no dedicated price point, a condition
    adjustment, a currency conversion, or a language the set's marketplace
    product does not cover. The UI renders these with a distinct "~" treatment
    and names the substitution. They are never labelled as market value.
* **Price history is generated by us.** No free provider sells history, so a daily
  job writes `card_price_snapshot` rows (one per priced variant per provider) and
  `portfolio_snapshot` rows (one per user). Charts therefore start empty and fill in
  from the day of deployment; the UI says so instead of faking a back-history.
* Conditions: Cardmarket aggregates are near-mint-ish, not condition-resolved. We
  apply a **transparent, configurable condition multiplier table**
  (`src/lib/pricing/condition.ts`) to estimate non-NM value and mark the result
  approximate. The multipliers are documented and editable, not hidden magic.
* A refresh covers the **entire catalog**, not just owned cards: a tracker that
  only prices what you already have cannot tell you what the cards you are
  missing would cost, which is half the point of a wishlist. Because prices are
  embedded in the card document, and because every provider reading the same
  document shares one fetch, a full pass is ~24,000 requests rather than one
  pass per provider. Work commits batch by batch and is ordered
  owned/wishlisted → newest sets → stalest, so an interrupted or deliberately
  capped run still refreshes what people look at first.
* Results are cached in `card_price`, so a page view never triggers an upstream
  call.

### Currency

Cardmarket quotes EUR, TCGplayer quotes USD. We store `amountMinor` plus `currency`
per price point and convert at display time from a daily `fx_rate` row, seeded from a
configurable source and overridable. Totals are rendered in the user's chosen display
currency with the conversion disclosed.

---

## 3. Stack

| Layer | Choice | Rationale |
| --- | --- | --- |
| Framework | **Next.js 16 (App Router) + React 19** | Server Components keep a 23k-card catalog on the server; route handlers plus server actions remove the need for a separate API service; `output: 'standalone'` gives a small Docker image; deployable on Vercel, Fly, Render, Railway, Coolify or a plain VPS without code changes. |
| Language | **TypeScript, strict** | Required by the brief. |
| Database | **PostgreSQL 16** | Relational catalog with heavy joins, partial and composite indexes, `pg_trgm` fuzzy search, `numeric` money. Validated as the right fit for this shape of data. |
| ORM | **Drizzle ORM** | SQL-first and fully typed; migrations are plain reviewable SQL files, which matters for self-hosters; no engine binary and a tiny runtime. |
| Auth | **Better Auth** | TypeScript-native, owns its tables in *our* Postgres with no external identity vendor; ships email+password, verification, password reset, session rotation and secure cookies; adding Google later is a config block rather than a migration. |
| i18n | **next-intl** | App-Router-native, locale-segmented routes for six interface languages (en, fr, es, pt, it, ja), type-safe message keys, and a test that fails the build if a catalogue drifts. UI locale is deliberately independent from card language. |
| Styling | **Tailwind CSS v4** | Design tokens as CSS variables; produces the restrained dark system described in [`DESIGN.md`](./DESIGN.md) rather than a Bootstrap look. |
| Client data | **TanStack Query** | Optimistic quantity +/- with rollback, request de-duplication, infinite card grids. |
| Validation | **Zod 4** | One schema shared by server actions, route handlers, CSV rows and env parsing. |
| PWA | **Hand-written service worker** plus web manifest | `@serwist/next` does not support Turbopack, which Next 16 builds with by default, and silently emitted no worker at all. The needs here are small - precached shell, cache-first card images with expiry, offline fallback - so a ~160-line audited worker beats an experimental build plugin. |
| Jobs | **Node scripts plus Postgres advisory locks** | Run via `docker compose --profile jobs`, host cron, or the admin panel. No Redis and no queue broker, because a self-hoster must not need extra infrastructure. |
| Tests | **Vitest** | Unit tests over the logic that actually breaks: CSV round-trip, pricing selection and confidence, condition multipliers, variant mapping, completion maths. |

### Rejected alternatives

* **Prisma** - heavier runtime, opaque migrations, worse fit for the hand-tuned
  indexes this catalog needs.
* **Supabase-only architecture** - would couple auth, database and storage to one
  vendor; the brief requires provider neutrality. Supabase still works as *just* a
  Postgres host, since `DATABASE_URL` is all we need.
* **SQLite** - attractive for self-hosting, but loses `pg_trgm`, concurrent writers
  and partial indexes at the scale assumed (millions of collection rows).
* **A separate Nest/Express API** - a second deployable for no benefit here.
* **Client-side catalog mirror in IndexedDB** - forbidden by the brief and hostile to
  mid-range phones.

---

## 4. Security posture

* All mutations go through server actions or route handlers that re-derive the user
  from the Better Auth session. The client never supplies a `userId`.
* Ownership is enforced in the query (`where userId = session.user.id`) **and** by
  foreign keys with `on delete cascade`.
* Zod validates every input; numeric bounds are also database `check` constraints.
* Rate limiting on auth, search, CSV import and admin sync triggers, implemented as a
  token bucket in Postgres so it works across replicas without Redis.
* Secrets live only in env. Nothing prefixed `NEXT_PUBLIC_` carries a secret.
* CSV import uses a hardened parser and a row cap; CSV export neutralises formula
  injection by quoting leading `=`, `+`, `-` and `@`.
* Admin routes are role-gated server-side, not merely hidden in the UI.

---

## 5. What is deliberately *not* claimed

* We do not claim condition-accurate market prices. We estimate, and we say so.
* Western prints of a western set share one Cardmarket product, so they are
  priced exactly; Asian sets are priced exactly against their own products. Any
  other language/set combination is flagged approximate rather than presented as
  a market price.
* Price history before first deployment does not exist and is shown as such.
* Some old sets lack full non-English metadata upstream. The UI falls back to the
  English name and marks the card as unverified in that language.
