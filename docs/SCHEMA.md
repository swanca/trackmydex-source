# Data model

22 tables in four layers. Definitions live in `src/db/schema/`; the generated SQL
is `drizzle/0000_init.sql`.

```
era ─< series ─< set ─< card ─< card_variant ─┬─< card_price
                 │        │                    ├─< card_price_snapshot
                 │        │                    ├─< collection_item >─ user
                 │        │                    └─< wishlist_item   >─ user
                 │        └─< card_translation
                 └─< set_translation
```

---

## 1. Catalog

Canonical, provider-neutral card information. Anything specific to one upstream
source is confined to `externalId`-style columns, so a second catalog provider
can be added without reshaping the model.

| Table | Purpose | Notes worth knowing |
| --- | --- | --- |
| `era` | Top level of the hierarchy the brief asks for | **Ours, not the provider's.** No API models eras; they are seeded from `src/lib/catalog/eras.ts`. |
| `series` | Provider's series (`base`, `swsh`, `sv`…) | Mapped to an era at ingestion. |
| `set` | One expansion, promo set or trainer kit | `languages` is a `card_language[]` discovered during the translation pass, so the UI only offers languages a set was actually printed in. |
| `card` | One card, canonical (English) | `extra` jsonb holds fields the UI does not model yet, so a provider change does not lose data. |
| `card_variant` | **One printing**: normal, holo, reverse, 1st edition… | The unit everything else points at. |
| `series_translation`, `set_translation`, `card_translation` | Per-printed-language names and images | A row exists only where the thing was actually released in that language. |

### Three decisions that matter

**`card.sortIndex`** - card numbers are not numbers. Across 27 years they are
`4`, `H12`, `SV45`, `TG08`, `GG31`, `001`, `?`, `!`, `RC5`. Sorting lexically
puts 10 before 2; sorting as integers throws away the prefix. So each number is
projected onto a numeric key (`src/lib/catalog/sort.ts`): plain numbers sort as
themselves, prefixed numbers go into a stable per-prefix band after them,
lettered suffixes sort just after their base, and symbol-only numbers go last.

**`card_variant` is the pricing and ownership unit, not `card`.** Valuing a
reverse holo with a normal-print figure is wrong by an order of magnitude on many
cards. The deterministic id (`swsh3-136::reverse`) is human-readable and stable
across re-syncs, which also makes it usable as a CSV identity column.

**`card_variant.mappingLocked`** - when an admin pins a Cardmarket product id by
hand, the nightly sync must not silently revert it. The upsert honours the flag
in SQL (`case when mapping_locked then <existing> else excluded.… end`).

---

## 2. Pricing

| Table | Purpose |
| --- | --- |
| `card_price` | Current reading per (printing, provider). One row per provider, so Cardmarket EUR and TCGplayer USD coexist. |
| `card_price_snapshot` | Daily history, keyed (printing, provider, date). |
| `fx_rate` | Daily EUR↔USD, so a mixed portfolio has one rate per day rather than a different total on every refresh. |

Money is `numeric(12,2)`, never a float: these values are summed across thousands
of rows to produce a portfolio total, and binary floats drift.

Every price row carries `confidence` and, when approximate, a machine-readable
`approximationReason` (`variant-substitution:reverse->normal`,
`language-substitution:ja->en`, `condition-adjusted:played`,
`currency-converted:EUR->USD`). The UI translates those into sentences. There is
no state in which a number is shown without its provenance.

A page render only ever *reads* `card_price` - it never calls an upstream API -
which is what keeps browsing fast and keeps us inside provider rate limits.

---

## 3. Users and collections

| Table | Purpose |
| --- | --- |
| `user`, `session`, `account`, `verification` | Better Auth, in our own Postgres. `user` carries the three preference columns. |
| `collection_item` | A **stack**: same printing, same printed language, same condition, with a quantity. |
| `wishlist_item` | Wanted printing with an optional target price and 1-5 priority. |
| `portfolio_snapshot` | One row per user per day. |

**Why a stack and not a row per copy** - one-tap `+` has to be a single indexed
upsert, and a user with 4,000 cards should not have 4,000 rows of duplicates.
`unique(user_id, card_variant_id, language, condition)` makes a double-tapped
button idempotent by construction.

`collection_item.cardId` is denormalised alongside `cardVariantId` so the hot
"do I own this card at all" query on a 250-card set page is one index scan.

Database `check` constraints back up the Zod validation rather than replacing it:
quantity must be positive, purchase price non-negative, and price and currency
must be set together or not at all. Ownership is enforced both in every query
(`where userId = session.user.id`) and by `on delete cascade` foreign keys.

---

## 4. Operations

| Table | Purpose |
| --- | --- |
| `sync_run` | One row per job, with status, stats and duration. |
| `sync_error` | Failures attached to a run, surfaced in the admin area. |
| `rate_limit_bucket` | Token bucket in Postgres - no Redis in the dependency list. |
| `app_setting` | Small key/value store for runtime settings. |

A job that half-fails is recorded as `partial` with its errors attached, rather
than a green tick over an inconsistent catalog.

---

## 5. Indexes

The ones that earn their keep at ~24,000 cards and potentially millions of
collection rows:

| Index | Why |
| --- | --- |
| `card_name_trgm_idx`, `card_translation_name_trgm_idx` (GIN, `gin_trgm_ops`) | Turns `ilike '%pika%'` into an index scan. Requires `pg_trgm`, created by `db:migrate` before the generated SQL runs. |
| `card_set_sort_idx (set_id, sort_index)` | Set pages read in printed order. |
| `card_set_local_idx (set_id, local_id)` unique | Natural key; also what CSV import resolves against. |
| `collection_item_stack_idx` unique | Makes the one-tap upsert correct under concurrency. |
| `collection_item_user_card_idx (user_id, card_id)` | Ownership overlay on every set page. |
| `collection_item_user_recent_idx (user_id, created_at desc)` | "Recently added" without a sort. |
| `card_price_variant_provider_idx` unique | Upsert target for every price write. |
| `card_variant_unmapped_idx` **partial**, `where cardmarket_product_id is null` | The admin backlog query touches only unmapped rows. |
| `card_dex_idx` (GIN) | "All Pikachu cards" across every set. |

---

## 6. Extending it

The model is built to absorb printing conventions that do not exist yet - which
they will, as they have repeatedly since 1999.

- **A new printing type** - add to `VARIANT_TYPES` in `enums.ts`. Nothing else
  changes shape; pricing falls back to `other` with an approximate flag until a
  mapping is added.
- **A new printed language** - add to `CARD_LANGUAGES` and to
  `CATALOG_LANGUAGES`. Translation tables are keyed by language, not columned by
  it, so this is a data change and not a migration of every card row.
- **A new interface language** - add to `UI_LOCALES` in
  `src/lib/catalog/languages.ts`, add `messages/<locale>.json`, and add its
  column to `LANGUAGE_LABELS`. `tests/i18n.test.ts` fails the build if any key or
  ICU placeholder is missing.
- **A new pricing provider** - implement `PricingProvider`, register it, list its
  key in `PRICING_PROVIDERS`. If it reads an upstream document another provider
  already fetches, declare the same `payloadSource` and the sync will share one
  fetch between them.
- **A new field on a card** - it is already being stored in `card.extra`; promote
  it to a column when the UI needs to query it.
