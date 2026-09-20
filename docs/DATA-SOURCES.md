# Data sources

Every source here was probed live on 2026-09-19 before being chosen or rejected.
The comparison table and the reasoning live in
[`ARCHITECTURE.md`](./ARCHITECTURE.md); this document covers the operational
detail: what we take, under what terms, and where the data is thin.

---

## 1. TCGdex - catalog and baseline pricing

**Endpoint** `https://api.tcgdex.net/v2` · **Key** none · **Licence** MIT
(dataset: [`tcgdex/cards-database`](https://github.com/tcgdex/cards-database))

### What we take

| Data | Endpoint | Cost per full sync |
| --- | --- | --- |
| Series | `GET /v2/{lang}/series` | 1 request per ingested language |
| Series membership | `GET /v2/{lang}/series/{id}` | ~20 requests per language with its own sets |
| Set detail | `GET /v2/{lang}/sets/{id}` | ~220 western + ~180 JA + ~95 KO + ~98 ZH |
| Card detail (canonical) | `GET /v2/{lang}/cards/{id}` | ~23,700 western, plus the cards of each foreign-origin set |
| Foreign set discovery | `GET /v2/{lang}/sets` | 1 request per language |
| Translations | `GET /v2/{lang}/sets/{id}` | ~1,800 requests for all 16 languages |
| Prices | embedded in the card payload | 0 additional requests |

The flat `GET /v2/{lang}/sets` listing is **not** used to build sets - it omits
both the parent series and the release date - but it *is* used for discovery,
because it is the cheapest way to learn which set ids exist in a language.

### Asian releases are separate sets, not translations

This is the single most important structural fact about the data, and it was
found by diffing the set ids per language against the English catalogue:

| Language | Sets | Not present in the English catalogue |
| --- | --- | --- |
| `fr` | 202 | 3 |
| `es` | 156 | 0 |
| `it` | 193 | 0 |
| `pt` | 125 | 0 |
| `ja` | 184 | **180** |
| `ko` | 95 | **95** |
| `zh-tw` | 98 | **98** |

Western languages really are translations of the same set: `swsh3` exists in
`en`, `fr`, `es`, `it` and `pt` with the same id. Japanese, Korean and Chinese
releases are **different products entirely** - different ids (`SV1a`, `CS1a`,
`ADV1`), different series (`ポケモンカードゲーム スカーレット&バイオレット`),
different card counts, and **their own Cardmarket product ids with their own
prices**.

An implementation that only walks the English catalogue and then asks for
translations therefore omits 373 sets and every Japanese, Korean and Chinese
card. The sync runs a second discovery pass for exactly this reason, ingesting
those sets canonically in their own language and recording `set.originLanguage`.

That column then feeds the valuation rule: a Japanese card in a Japanese set is
priced **exactly** (verified: `SV1a-001` carries Cardmarket product `701036`),
while a Japanese card claimed against a western set is a flagged substitution.

### Rate limits

None published. The FAQ asks consumers to cache locally rather than re-fetch,
which is exactly what the mirror-into-Postgres design does. We additionally:

- cap concurrency at `SYNC_CONCURRENCY` (default 6);
- back off exponentially and honour `Retry-After`;
- skip cards whose provider `updated` timestamp and content hash are unchanged,
  so a weekly catalog re-sync is a few hundred writes rather than 24,000;
- fetch each card **once per price run**, not once per provider: the Cardmarket
  and TCGplayer readings come out of the same document, so a full-catalog price
  pass is ~24,000 requests, not ~48,000.

A full price pass takes 20-40 minutes at the default concurrency of 6 and is
intended as a nightly job. `PRICE_SYNC_MAX_VARIANTS` caps it if you need a
shorter window.

### Images

Served from `assets.tcgdex.net` and **never re-hosted**. We store the base URL
and append `/low.webp` (grids) or `/high.png` (detail). The Next.js image
pipeline is allow-listed for that host only.

### Known gaps

| Gap | Effect | How the app handles it |
| --- | --- | --- |
| Set `symbol` assets return HTTP 400 from the upstream bucket | Set symbols unavailable | The set logo is used; where there is no logo either, a monogram from the set code |
| Non-English metadata incomplete for some pre-2010 sets | Missing translated card names | Falls back to the English name and labels the card unverified in that language |
| Some cards predate `variants_detailed` | No per-printing market ids | The boolean `variants` object is used; those printings appear in the admin "unmapped" list |
| Percent-encoded ids (`exu-%3F`, the `?` Unown) | Would break URL handling | Decoded defensively during ingestion |
| `tcgp` (Pokémon TCG Pocket) is digital-only | Would pollute portfolio totals with unpriceable, non-physical cards | Excluded by default in `src/lib/catalog/eras.ts` |

---

## 2. Cardmarket - prices and product links

**Direct API access: not available.** Cardmarket is not accepting new API
applications, and access is gated behind professional-seller status. This is a
hard constraint, not a configuration we skipped.

What we do instead:

- Prices come from the Cardmarket aggregates TCGdex republishes daily: `avg`,
  `low`, `trend`, `avg1`, `avg7`, `avg30`, plus the `-holo` series that
  describes the reverse-holo printing of the same product.
- Product links are built from the exact `idProduct` carried per printing. The
  brief forbids fabricating keyword-search URLs when an exact mapping exists, so
  a card with no product id gets **no link at all** rather than a guess.
- The URL template is overridable via `CARDMARKET_PRODUCT_URL_TEMPLATE`
  (`{id}` and `{locale}` substitutions) because Cardmarket's public URL shape is
  not covered by a published contract and the site blocks automated
  verification.

We do not scrape Cardmarket. Their terms prohibit it and a scraper would break.

---

## 3. TCGplayer - prices

Same situation: the partner API programme is closed. Per-finish aggregates
(`lowPrice`, `midPrice`, `highPrice`, `marketPrice`, `directLowPrice`) come
through TCGdex, keyed by `productId`, and product links use the stable
`tcgplayer.com/product/{id}` form.

---

## 4. Optional providers

All disabled by default. Enabling one is a comma-separated entry in
`PRICING_PROVIDERS` plus whatever key it needs. **The application is fully
functional with none of them.**

| Provider | Status | Why it is optional |
| --- | --- | --- |
| `pokemontcgio` | Implemented, off by default | `GET /v2/sets` returned **HTTP 500** during evaluation. English only. Kept as proof the abstraction is real. |
| Scrydex | Not implemented | No free tier; from $29/month. |
| JustTCG | Not implemented | Free tier is 1,000 calls **per month** - under 5% of one catalog pass. |
| tcgapi.dev | Not implemented | Free tier is 100 requests/day and 3 days of history. |
| PokemonPriceTracker | Not implemented | Would need evaluation against its own terms before shipping. |

Adding one means implementing `PricingProvider`
(`src/providers/pricing/types.ts`), registering it, and listing its key in
`PRICING_PROVIDERS`. Nothing downstream changes.

---

## 5. Foreign exchange

Cardmarket quotes EUR and TCGplayer quotes USD, so a mixed portfolio needs a
rate. With no `FX_RATE_URL` configured, the static `FX_EUR_USD` value is used
and recorded as `source = 'static'`, which is honest about its precision. Any
endpoint returning `{rates:{USD}}`, `{usd}`, `{eur:{usd}}` or `{data:{USD}}`
works if you want live rates. Rates are stored daily, never fetched per request:
a dashboard whose total changes between two refreshes of the same page is worse
than one that is a day old.

---

## 6. Intellectual property

- Pokémon and the Pokémon TCG are trademarks of Nintendo, Creatures Inc. and
  GAME FREAK Inc. This project is unofficial and unaffiliated.
- Card artwork is displayed from the provider's CDN under their terms. It is not
  copied, re-hosted, modified or redistributed by this application.
- Prices are aggregated public marketplace data, presented as estimates. They
  are not an appraisal, an offer, or investment advice, and the UI says so on
  every screen that shows a total.
- The MIT licence on this repository covers the application source only.

---

## 7. Replacing the catalog provider

The catalog sits behind `CatalogProvider`
(`src/providers/catalog/types.ts`). A replacement implements seven methods and
registers itself; `syncCatalog` and `syncTranslations` are provider-agnostic.
The likely reasons you would:

- **Self-hosting TCGdex.** The dataset is MIT and the API is open source - point
  `TCGDEX_API_URL` at your own instance and nothing else changes.
- **A licensed dataset.** Implement the interface over it, keeping
  `cardmarketProductId` / `tcgplayerProductId` populated so market links and
  pricing continue to work.
