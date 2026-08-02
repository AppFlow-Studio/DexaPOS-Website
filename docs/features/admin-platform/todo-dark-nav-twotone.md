# Dashboard left-nav two-tone — dark-mode token coverage

## Goal
Add the dark half of the dashboard left-nav two-tone, at parity with the shipped
light treatment. Differentiation by surface *value*, not hue; in dark the
relationship inverts — content sits **elevated** above the rail (rail = deepest).

## Key findings (grounding)
- Two-tone is delivered via the `.dashboard-sidebar-theme` class on
  `SidebarProvider` ([app/dashboard/layout.tsx:1294](../../../app/dashboard/layout.tsx#L1294)),
  which scopes the `--sidebar-*` tokens to the dashboard only.
- Light values live in `.dashboard-sidebar-theme`
  ([app/globals.css:224-233](../../../app/globals.css#L224-L233)) and match the shipped
  light baseline exactly — DO NOT touch.
- A `.dark .dashboard-sidebar-theme` block already exists
  ([app/globals.css:235-244](../../../app/globals.css#L235-L244)) but holds generic oklch
  placeholders that do NOT match the dark spec. This is the missing half — rewrite it.
- Dashboard uses `variant="inset"` with a custom `<main>` (not `SidebarInset`):
  - Rail surface = `--sidebar` (`bg-sidebar`, also behind inset margins via
    `has-data-[variant=inset]:bg-sidebar`)
  - Content canvas = `--background` (body/main)
  - Cards = `--card`
  - Active item bg = `--sidebar-accent`; active text/icon = `--sidebar-accent-foreground`
  - Inactive text = `--sidebar-foreground`
  - Section label = `--sidebar-foreground/70` (DERIVED, not a separate token —
    same as shipped light; component sets `text-sidebar-foreground/70` in
    [components/ui/sidebar.tsx:421](../../../components/ui/sidebar.tsx#L421))
- Shared `SidebarMenuButton` collapses hover into `--sidebar-accent`
  (`hover:bg-sidebar-accent`, [components/ui/sidebar.tsx:490](../../../components/ui/sidebar.tsx#L490)).
  **User decision:** honor the dark spec's distinct **neutral** hover via a scoped
  CSS rule (no component edit, hex stays in globals.css).

## Token mapping (dark spec -> existing tokens)
| Role (spec) | Value | Token |
| --- | --- | --- |
| Nav rail (deepest) | `#0F1115` | `--sidebar` |
| Content canvas (raised) | `#16181D` | `--background` (scoped override) |
| Cards (one step up) | `#1C1F26` | `--card` (scoped override) |
| Rail <-> content divider | `#232730` | `--sidebar-border` |
| Inactive text | `#9CA3AF` | `--sidebar-foreground` |
| Section label | `#6B7178` (~ derived /70) | `--sidebar-foreground/70` |
| Active item bg | `#182338` | `--sidebar-accent` |
| Active text + icon | `#6CA0FF` | `--sidebar-accent-foreground` + `--sidebar-ring` |
| Brand fill blue | `#0C4FD1` | `--sidebar-primary` |
| Hover bg (neutral) | `#1B1E25` | scoped `:hover` rule (separate) |

## Plan
1. Rewrite `.dark .dashboard-sidebar-theme` in [app/globals.css](../../../app/globals.css)
   with the exact dark spec hex, mapping each role to its existing token above.
   Add scoped `--background` and `--card` overrides so the canvas/cards sit
   elevated above the rail in dark (the locked inversion).
2. Add a scoped neutral-hover rule inside the dark dashboard sidebar theme:
   inactive menu buttons hover to `#1B1E25`, active stays blue `#182338`.
   Targets `[data-sidebar=menu-button]:not([data-active=true]):hover` — no
   component edit, hex stays in CSS.
3. Verify in browser (dark mode) against the AC.

## Acceptance criteria (from ticket)
- [ ] Dark: rail visually distinct, deepest; content elevated
- [ ] Active nav item blue `#6CA0FF` text/icon, reads as selected
- [ ] Inactive labels AA (>=4.5:1) on dark rail
- [ ] Section labels recede but legible
- [ ] Hover visible, not jarring
- [ ] Dark = semantic tokens, same names as light, zero hardcoded hex in components
- [ ] Mode toggle persists on reload, no FOUC
- [ ] Visual parity w/ shipped light structure + single-active-item logic
- [ ] No regression to impersonation banner / status / toast colors

## Review

**Change:** Single file — [app/globals.css](../../../app/globals.css). Rewrote the
`.dark .dashboard-sidebar-theme` block (was generic oklch placeholders) with the
exact dark spec hex mapped onto the existing `--sidebar-*` tokens, added scoped
`--background`/`--card` overrides for the elevated content/cards, and added one
scoped neutral-hover rule. No component edits; zero hardcoded hex in components.

**Verified in browser (dark mode), via a faithful DOM probe under
`.dark .dashboard-sidebar-theme`:**
- Token resolution exact: rail `#0F1115`, content `#16181D`, card `#1C1F26`,
  divider `#232730`, inactive `#9CA3AF`, active bg `#182338`, active text
  `#6CA0FF`, brand fill `#0C4FD1`.
- Surface ordering confirms inversion: rail L=0.0056 < content L=0.0091 < card.
- Hover rule resolves to `#1B1E25` (distinct neutral; active stays blue).
- Contrast (WCAG): inactive-on-rail **7.44:1**, active-text-on-active-bg
  **6.07:1**, inactive-on-hover **6.57:1** — all pass AA (≥4.5).
- Screenshot: rail visibly deepest, content elevated, single blue active item,
  recessed-but-legible section labels, subtle non-jarring hover.

**AC status:** all met.
- [x] Rail distinct/deepest, content elevated
- [x] Active item blue `#6CA0FF`, reads selected
- [x] Inactive labels AA (7.44:1)
- [x] Section labels recede but legible (derived /70, same as light)
- [x] Hover visible, not jarring (`#1B1E25`)
- [x] Semantic tokens, same names as light, zero hardcoded hex in components
- [x] Persistence/FOUC unaffected — same `.dark` class that already drove the
      prior dark block; no JS added
- [x] Visual parity w/ shipped light structure + single-active-item logic
- [x] No regression: ImpersonationBanner uses literal `bg-white/zinc-900` +
      red/amber colors (no sidebar/`--background`/`--card` tokens); toasts use
      sonner/`destructive` defaults — both untouched

## QA matrix (both modes, real component-class cascade)

Verified by injecting the **real** `SidebarMenuButton`/`SidebarGroupLabel` class
strings under `<... class="dashboard-sidebar-theme">` so the real
`hover:bg-sidebar-accent`, `data-[active=true]:*`, and `text-sidebar-foreground/70`
utilities drive the result (HQ redirect blocks mounting the live `/dashboard` nav).

| Check | Light | Dark |
| --- | --- | --- |
| Rail distinct from content, no floating | ✅ rail `#F8FAFC` vs `#FFFFFF` | ✅ rail `#0F1115` < content `#16181D` (L 0.0056<0.0091) |
| Active item legible + reads as selected | ✅ `#EEF3FE`/`#0C4FD1` | ✅ `#182338`/`#6CA0FF` |
| Inactive labels pass AA (4.5:1) | ✅ `#475569` on `#F8FAFC` | ✅ **7.44:1** (`#9CA3AF` on `#0F1115`) |
| Section labels readable but recessed | ✅ `--sidebar-foreground/70` | ✅ `--sidebar-foreground/70` |
| Hover visible, not jarring | ✅ shipped `#EEF3FE` (unchanged) | ✅ override wins: `#1B1E25` (proved ≠ active `#182338`) |
| Toggle: no flash, persists on reload | ✅ (after FOUC fix) | ✅ reload restores `.dark` from `localStorage.theme`, pre-paint |
| Impersonation banner intact | ✅ literal colors, no token dep | ✅ same |

Active-text-on-active-bg contrast dark = **6.07:1** (AA pass).

## FOUC / persistence fix (added — was a pre-existing app-wide bug)

QA found the theme toggle did **not** persist on reload: `AnimatedThemeToggler`
writes `localStorage.theme` + toggles `.dark` at runtime, but nothing re-applied
`.dark` on load (no `next-themes` ThemeProvider, no inline bootstrap). Verified:
set dark → reload → page came back light. This blocked the matrix persistence row
and the DoN even though the dark tokens themselves were correct.

Fix (user-approved): added a blocking anti-FOUC inline `<script>` in the `<head>`
of [app/layout.tsx](../../../app/layout.tsx) that applies `.dark` from `localStorage.theme`
(fallback `prefers-color-scheme`) before first paint. ~1 statement, no new deps,
fixes persistence app-wide. Re-verified: set dark → reload → `<html class="dark">`,
no flash. Reuses the single source of truth (`localStorage.theme` + `.dark` on
`<html>`) — no nav-local override, no second flag.

## Token-naming reconciliation (for reviewer)

The ticket's "Deep implementation context" lists illustrative names
(`--surface-rail`, `--nav-active-bg`, `--brand-on-dark`, …, prefixed "e.g.").
Those names exist **only** in the marketing site / POS demo — the shipped light
two-tone (Task 2) used the **Shadcn `--sidebar-*` semantic tokens** in
`.dashboard-sidebar-theme`. The DoN criterion is "reuse the **light** token
names": dark reuses the identical `--sidebar-*` names. Introducing `--surface-*`
would *violate* "same names as light", since light never used them. `--brand`
(`#0C4FD1`, `--sidebar-primary`) is kept separate from the active-fg
`#6CA0FF` (`--sidebar-accent-foreground`/`--sidebar-ring`), satisfying the
brand-vs-active-fg split.

## Notes:
- Scoping `--background`/`--card` inside the theme shifts ALL dashboard dark
  surfaces to the neutral two-tone values. Intentional per spec (canvas
  `#16181D`, cards `#1C1F26`); delta from the prior blue-tinted global dark
  `--background` (~`#191b22`) is small. The banner's loading overlay
  (`bg-background/70`, `bg-card`) now matches the dashboard surface — correct.
- HQ-account redirect (`/dashboard/*` → `/manage`) prevented mounting the real
  nav; verified via a faithful DOM probe carrying the identical class +
  `data-sidebar`/`data-active` structure the sidebar emits.
