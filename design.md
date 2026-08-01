# Design — BoothCall

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

## Genre
editorial (silent default — no SaaS/atmospheric/playful signal fired; brief is a
functional two-screen ops tool for a trade-show coffee booth)

## Mood
warm-craft — user-selected. Warm oat-cream paper, leaf-green + terracotta-clay
accents, an artisan-market register (think farmers-market chalkboard signage,
kraft paper, a coffee bag) rather than glossy SaaS chrome.

## Page-type note — this app has no marketing pages

BoothCall has exactly two screens and neither is a landing page:

- **`/display`** — a kiosk signage screen. No nav, no footer, no scroll. One job:
  make the calling number unmissable from across a trade-show floor.
- **`/admin`** — a staff control panel (kanban-style ticket queue). One job: fast,
  low-error status changes with a thumb.

Hallmark's 21 macrostructures and N#/Ft# nav/footer archetypes are built for
marketing pages (hero → features → CTA → footer). Neither screen has that
shape, and forcing one on would be worse than admitting the mismatch. This
system borrows Hallmark's *token discipline* (colour, type, spacing, motion,
states, contrast, honest copy) in full, and treats macrostructure loosely:

- `/display` genuinely fits **Stat-Led** (H4) — a giant number is the hero,
  supporting content qualifies it below — so that macrostructure is used as
  designed, with the deliberate exception noted below.
- `/admin` fits no catalog macrostructure. It is built as a **kanban dashboard**
  using the component-cookbook's button/card/input state discipline directly,
  not dressed up as a landing page.
- **Nav and footer archetypes (N#/Ft#) are skipped entirely on both screens.**
  A kiosk sign has no navigation destinations and no footer content; the admin
  panel is a single route with a functional header bar, not a marketing nav.

## Deliberate exception — accent restraint on the CALLING number

Hallmark's colour rule caps the accent at ≤ 3–5 % of any viewport. `/display`'s
entire job is the opposite: the calling number must be the loudest, least
missable thing in the room, readable from across a booth aisle. The hero
figure is the **one** disclosed exception to the accent-restraint rule — it is
allowed to dominate the upper two-thirds of the screen in the accent-2 (clay)
colour. Restraint still governs everywhere else: admin UI, connection badges,
labels, secondary buttons. The 2026-08-01 `/admin` NFC additions (scan-panel
active border, card-locate ring, reader-status badge) are accent-tinted but
each occupies well under 1% of the viewport; they sit inside the ≤3–5% budget
and are explicitly not a second exception.

## Macrostructure family
- `/display`: **Stat-Led** (H4) — giant tabular-nums figure + worded state,
  supporting list below.
- `/admin`: **Kanban dashboard** (no catalog match — component-cookbook state
  discipline applied directly; see Per-page allowances).

## Theme
Catalog theme: **Garden** — warm botanical-almanac register, oat-cream paper,
living leaf-green primary accent, earthy clay/terracotta secondary accent.

- `--color-paper`     oklch(95.5% 0.022 92)
- `--color-paper-2`   oklch(92.5% 0.026 92)
- `--color-paper-3`   oklch(88.5% 0.030 90)
- `--color-rule`      oklch(83%   0.028 115)
- `--color-rule-2`    oklch(62%   0.045 132)
- `--color-muted`     oklch(48%   0.040 138)
- `--color-neutral`   oklch(40%   0.045 142)
- `--color-ink-2`     oklch(33%   0.050 150)
- `--color-ink`       oklch(24%   0.052 152)
- `--color-accent`    oklch(47%   0.13  140)   /* leaf-green — primary: focus, links, connected state */
- `--color-accent-2`  oklch(54%   0.14  46)    /* clay/terracotta — CALLING hero only */
- `--color-accent-ink` oklch(96%  0.02  92)    /* text on either accent fill */
- `--color-focus`     oklch(47%   0.13  140)

Dark-paper variant (kiosk display runs the same hue anchor, shifted dark per
the dark-mode recipe — never switch hue between modes):

- `--color-paper-dark`   oklch(15%  0.020 92)
- `--color-paper-2-dark` oklch(19%  0.022 92)
- `--color-ink-dark`     oklch(94%  0.015 92)
- `--color-accent-2-dark` oklch(64% 0.16  46)  /* lifted lightness for dark ground */

## Typography
- Display: **Young Serif**, weight 400, style normal (roman only — organic,
  botanical-adjacent serif; used for section labels and the display headline
  on admin; NOT used for the ticket numerals — see Outlier)
- Body: **Hanken Grotesk**, weight 400 (UI copy, buttons, captions)
- Outlier (numerals, plus the IDm caption — see role 3): **Geist Mono** —
  already loaded by the project; reused deliberately so the giant ticket
  numbers get maximum tabular-figure legibility at a glance, distinct from the
  warm serif brand voice. Outlier appears in exactly three roles: (1) the
  CALLING hero figure, (2) every other ticket number badge (PREPARING list,
  admin cards), and (3) — added 2026-08-01 — the truncated FeliCa card IDm
  label on `/admin` ticket cards, at 11px / `--color-muted`, last 4 hex
  characters only, uppercased. Role 3 is the one place Outlier carries
  non-numeric glyphs (hex a–f); it is admitted because the label's entire job
  is glyph-level disambiguation against a physical card, and a proportional
  face would invite 0/O and 1/l misreads. Role 3 must never grow past a
  caption: never a heading, never larger than 11px, never shown on `/display`.
- Display tracking: -0.006em
- Type scale anchor: `--text-display: clamp(2.85rem, 5.2vw + 1rem, 5rem)`
  (admin headings); the `/display` hero figure is its own scale — see
  per-page allowances, it deliberately exceeds the 5.5rem display ceiling
  because a single tabular numeral group is the named exception in
  typography.md ("a single-line, single-word display that occupies ≤ 12 ch
  can grow to 7rem" — the ticket figure is 3 digits, well under that).
  2026-08-01 revision: the hero figure's `clamp()` (`--text-hero-figure` in
  `app/globals.css`) is now bounded by **available height (`dvh`), not just
  width** — a booth PC's actual window/monitor size isn't known in advance,
  and a purely width-driven clamp let the figure overflow its flex section
  on any wide-but-short viewport, silently center-cropping the label above
  it and the secondary CALLING numbers below it (both siblings share the
  section under `overflow-hidden`). The figure still tops out at 18rem —
  identical to the pre-fix appearance — on any viewport ≥ 758px tall; below
  that it shrinks smoothly instead of clipping. The same dvh-aware
  treatment applies to the 呼び出し中 label, the secondary CALLING numbers
  (now capped at 4 visible + a 「他 N 件」 overflow, mirroring 準備中's
  existing pattern), and the 準備中 queue numbers.

## Spacing
4-pt named scale (`layout-and-space.md`), values in `tokens.css`. Pages use
named tokens (`var(--space-md)`), never raw values.

## Motion
- Easings: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-in:
  cubic-bezier(0.7, 0, 0.84, 0)`, `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`
- Garden duration multiplier: 1.2× the base canon (calm, springs welcome)
- Reveal pattern: number-tick reveal on the CALLING hero only, one-shot per
  ticket; no scroll-*triggered* reveals; `/admin` may scroll programmatically
  to bring a located ticket card into view (primitive 4), which is not a
  scroll reveal.
- Reduced-motion fallback: opacity-only, ≤150ms
- Four primitives total, project-wide (the ceiling): (1) CALLING number-tick
  reveal, (2) button press feedback (scale + colour), (3) optimistic
  delete-with-undo toast slide, (4) **card-locate highlight** — a one-shot
  ring + background wash on the `/admin` ticket card matching a physically
  tapped FeliCa card, ≤ `--dur-long`, non-repeating, paired with a
  programmatic `scrollIntoView`. Added 2026-08-01 for the NFC pickup-card
  workflow: the tap happens away from the screen, so the software must answer
  "which row did I just touch?" — without it, staff hunt three columns by eye
  while a customer waits.

## Microinteractions stance
- Silent success on status changes (call / complete / skip / revert) — the
  ticket visibly moves column/state, no toast.
- Blocked actions are never silent. 渡済み stays visible and
  `disabled:opacity-50` with a persistent inline reason beneath it
  (「名刺の受け取り待ち」) — a disabled control must explain itself.
  Server-side rejections (`card_in_use`, `card_reissued`, `meishi_required`)
  surface as a one-line inline message on the scan panel or the ticket card —
  never a toast; the toast slot is reserved for the delete/undo primitive.
- Optimistic delete + 5–10s Undo toast (replaces the old no-feedback delete).
- Full-session reset keeps its two-stage inline confirm (genuinely
  destructive/irreversible mid-show) — this is the one confirm-style
  interaction in the app, and it's justified per `interaction-and-states.md`
  § Undo over confirm. The NFC scan panel's 「この番号で発行」 is not a
  second confirm-style interaction in this sense: it is the primary action
  itself. A tap only *selects* a card — nothing has yet happened that needs
  confirming.
- Hover delay 800ms / focus delay 0ms wherever a tooltip is used.

## CTA voice
- Primary action (issue ticket, call, complete): filled, `--color-accent`
  fill + `--color-accent-ink` text, rectangular with `--radius-card` corners
  (Garden's soft-rounded register, not a pill — pill is reserved for status
  badges only). Issuance is now two-step (tap → confirm); the filled-accent
  treatment belongs to the 「この番号で発行」 confirm button only. The idle
  scan panel is a passive drop target, not a button, and is deliberately not
  accent-filled.
- Secondary action (skip, revert): outline chip, 1px `--color-rule-2` border,
  transparent fill.
- Destructive (delete): ghost/icon button, red on hover/focus only — never a
  filled red button sitting at rest.

## Per-page allowances
- `/display` MUST NOT use any enrichment tier — it is pure typography, and the
  hero figure is the sanctioned accent-restraint exception described above.
- `/admin` MUST NOT use enrichment — function carries the page.
- Neither page gets a nav or footer archetype (see Page-type note above).

## What pages MUST share
- Garden token set (colour, type, spacing, motion) in full.
- The outlier-mono numeral treatment for every ticket number, everywhere.
- The CTA voice (fill/outline/ghost roles above).
- Focus-ring, contrast, and reduced-motion discipline.

## What pages MAY differ on
- `/display` runs the dark-paper variant (kiosk, high-contrast-from-distance);
  `/admin` runs the light oat-cream paper (a screen staff sit close to, all
  day — light paper reduces glare/eye strain relative to a dark control
  panel and matches the warm-craft mood better for a hands-on tool).
- `/display` has zero interactive controls other than the sound toggle;
  `/admin` is control-dense.

## Exports

### tokens.css
```css
:root {
  --color-paper:      oklch(95.5% 0.022 92);
  --color-paper-2:    oklch(92.5% 0.026 92);
  --color-paper-3:    oklch(88.5% 0.030 90);
  --color-rule:       oklch(83%   0.028 115);
  --color-rule-2:     oklch(62%   0.045 132);
  --color-muted:      oklch(48%   0.040 138);
  --color-neutral:    oklch(40%   0.045 142);
  --color-ink-2:      oklch(33%   0.050 150);
  --color-ink:        oklch(24%   0.052 152);
  --color-accent:     oklch(47%   0.13  140);
  --color-accent-2:   oklch(54%   0.14  46);
  --color-accent-ink: oklch(96%   0.02  92);
  --color-focus:      oklch(47%   0.13  140);

  --font-display: "Young Serif", ui-serif, Georgia, serif;
  --font-body:    "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-outlier: "Geist Mono", ui-monospace, monospace;

  --space-3xs: 0.125rem; --space-2xs: 0.25rem; --space-xs: 0.5rem;
  --space-sm:  0.75rem;  --space-md:  1rem;    --space-lg: 1.5rem;
  --space-xl:  2.5rem;   --space-2xl: 4rem;    --space-3xl: 6rem;

  --text-display:   clamp(2.85rem, 5.2vw + 1rem, 5rem);
  --text-display-s: clamp(2.1rem, 3.2vw + 1rem, 3.25rem);

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in:  cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-micro: 144ms; --dur-short: 264ms; --dur-long: 504ms; /* 1.2x Garden multiplier */

  --radius-card: 10px; --radius-pill: 8px; --radius-input: 8px;
}
```

## Provenance
- Built by `hallmark redesign app/display and app/admin` on the existing
  Next.js 16 / Tailwind v4 / lucide-react scaffold.
- Pre-flight: Geist Sans + Geist Mono via `next/font` (Geist Mono retained as
  the outlier; Geist Sans retired in favour of Hanken Grotesk body). No prior
  design tokens beyond default Tailwind utility colours. No motion library
  (motion-cut) — kept motion-cut, added the three CSS-only primitives above.
- 2026-08-01 amendment (hand-edited, not a hallmark run): NFC (FeliCa)
  pickup-card workflow on `/admin` — motion primitive 4 (card-locate),
  Outlier role 3 (IDm caption), scan-panel component, reader-status badge,
  meishi gate on 渡済み. No `/display` change, no macrostructure change.
- 2026-08-01 amendment (hand-edited, not a hallmark run): viewport-fit layout
  fix. `/display` type scale made dvh-aware (see Typography above) to stop
  content clipping on short/wide windows. `/admin` locked to `h-dvh` at `md`+
  with per-column scroll lanes instead of whole-page scroll, so the header,
  scan panel, and column headers stay on screen regardless of ticket count.
  No new colours, no new font roles, no change to the accent-exception or
  motion-primitive counts.
