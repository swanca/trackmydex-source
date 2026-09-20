# Design system

The brief supplied a reference screenshot and a direction: very dark navy, subtle
blue-violet gradients, thin borders, soft glow, rounded cards, large type,
elegant progress bars, minimal noise, card art carrying the colour. This document
records how that was turned into a system, and which choices were ours.

---

## 1. The idea

**A vault, not a dashboard.**

The interface is deliberately colourless so that card art is the only saturated
thing on screen. A collector's own cards should be the most interesting object in
any viewport - the chrome's job is to get out of the way and be legible at a
glance while they are standing in front of a binder.

That produces one hard rule, which every component obeys:

> **The accent has exactly three jobs.** Progress fills, the scan control, and
> focus rings. Nothing else glows.

The brief's list of things to avoid - excessive gradients, glassmorphism
everywhere, cartoonish components, overuse of franchise colours - all follow from
holding that line rather than from being policed individually.

---

## 2. Signature devices

Two elements do the identity work. Both come from the subject's own world rather
than from decoration.

### The empty sleeve

A card you do not own is **a pocket in a binder**, not a grey box with a cross
through it. `.sleeve` in `globals.css` is recessed into the page with an inner
shadow and a faint diagonal highlight - the light catching a plastic pocket - and
it keeps the card number embossed in the middle, so a half-collected set still
reads as a set rather than as a grid of holes.

Where art exists, the missing card shows it at 25% opacity and reduced
saturation. You want to recognise the card you are hunting, not just know that
something is absent.

This is what satisfies "cards missing from a set should be visually
distinguishable without making the interface noisy".

### The card fan

Era headers in the reference show a row of Pokémon sprites. This is a *card*
product, so the sprites are replaced by three overlapping, slightly rotated
pieces of art - a hand held out - drawn from **the user's own most valuable cards
in that era**. The header is a snapshot of their collection rather than stock
artwork.

---

## 3. Tokens

All defined in `src/app/globals.css` under `@theme`.

### Colour

| Token | Value | Role |
| --- | --- | --- |
| `--color-ink` | `#05070f` | Page ground |
| `--color-ink-soft` | `#080c18` | Sleeve interior, image backing |
| `--color-slate` | `#0b1120` | Raised surface |
| `--color-slate-hi` | `#121a2e` | Hover / secondary button |
| `--color-paper` | `#e8ecf7` | Primary text |
| `--color-muted` | `#8792b0` | Secondary text |
| `--color-faint` | `#5a6486` | Tertiary text, eyebrows |
| `--color-violet` → `--color-azure` | `#8b5cf6` → `#3b82f6` | The accent gradient |
| `--color-mint` | `#34d399` | Complete, at target, exact |
| `--color-amber` | `#f5b544` | Approximate values, warnings |
| `--color-rose` | `#f0576f` | Destructive, errors |
| `--color-hairline` | `rgb(148 163 208 / 0.14)` | The thin border, everywhere |

Amber is load-bearing, not decorative: it is the colour of *an estimate we cannot
vouch for exactly*, and it appears on the `~` marker, approximate prices and the
substitution reasons beneath them.

### Type

One superfamily, two widths - a real pairing that still reads as one voice.

- **Archivo** (variable, `wdth` axis). Set names, portfolio totals and page
  titles use the wide, heavy end (`font-stretch: 108-112%`) for the confident,
  poster-like headline the reference leans on. Body copy stays at normal width.
- **IBM Plex Mono** for card numbers, set codes, product ids and eyebrow labels.
  These are catalogue data, and a ledger face makes them scannable instead of
  decorative.

`.tnum` (tabular figures) is applied to every number that changes in place -
quantities, prices, counts - so nothing jitters when it updates.

### Shape and motion

Radii step 12 → 18 (`--radius-tile`) → 22 (`--radius-card`). Motion is limited to
a 700 ms progress fill on mount, 150 ms press states, a sheet rise, and a
skeleton shimmer. `prefers-reduced-motion` collapses all of it.

---

## 4. Mobile rules

The brief treats mobile as the primary target, not a reduced desktop. What that
means concretely here:

- **Bottom navigation** - five destinations, search raised into a centre control
  at the thumb's natural arc. Opaque, not translucent-over-content, and every
  scroll container reserves `--nav-height` plus the safe-area inset beneath it,
  so the bar never covers anything.
- **No Poké Ball.** The reference's centre control is a Poké Ball. That is both a
  trademark liability and the "cartoonish UI" the brief rules out, so the *shape*
  is kept - a ring lifted off the bar - carrying the accent gradient.
- **Touch targets** - 44 px minimum on anything interactive; nav items are 56 px.
- **Bottom sheets, not dialogs** - the only modal pattern on phones. Built on
  `<dialog>` for free focus trapping and Escape handling, with a grab handle and
  backdrop dismissal. Filters live in one so they never push the grid off screen.
- **One-tap quantity** - at zero the stepper collapses to a single wide `+`,
  because adding the first copy is the common case and deserves the biggest
  target in the tile.
- **Safe areas** - `viewportFit: 'cover'` plus `env(safe-area-inset-*)` on the
  nav, sheets and the install prompt.
- **Zoom stays enabled** - `maximumScale: 5`. Capping it fails WCAG 1.4.4 and
  punishes anyone reading a card number on a small screen.
- **No horizontal scroll** - except in three deliberate places, each in its own
  `overflow-x: auto` container: the card rails on the dashboard, the segmented
  filter controls, and the CSV preview table.

---

## 5. Accessibility

- Every interactive element has a visible focus ring (the accent's third job).
- Progress bars are real `role="progressbar"` with min/max/now and a label.
- The quantity readout is `aria-live="polite"` so a change is announced once.
- Icon-only controls carry `aria-label`; decorative SVGs are `aria-hidden`.
- Colour is never the only signal: approximate prices carry a `~` glyph and a
  sentence, completion carries a number, ownership carries a count.
- A skip link precedes the navigation on every page.
- Contrast: `--color-paper` on `--color-ink` is ~15:1; `--color-muted` on
  surfaces clears 4.5:1. `--color-faint` is used only for non-essential
  metadata that is duplicated elsewhere.

---

## 6. Loading, empty, error

Three states, treated as design surfaces rather than afterthoughts:

- **Skeletons mirror the real layout.** On a 200-card set page the reflow when
  data lands is the most visible jank in the app, so `loading.tsx` reproduces the
  header block, filter row and grid at the right dimensions.
- **Empty states name the next action.** "Your vault is empty / Browse a set and
  tap + on any card" with a button, never just a statement of absence.
- **Errors are specific and non-apologetic.** The boundary shows the error digest
  so a user report can be tied to a server log line, but never the message, which
  can leak internals.
