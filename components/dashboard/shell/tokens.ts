/**
 * Canonical class strings for the merchant dashboard.
 *
 * ⚠️ **These are reference values, not a rendering mechanism.**
 *
 * Tailwind v4 does not extract class names from this `.ts` file — its content
 * scanner does not treat it as a source. A class that exists *only* here never
 * gets a CSS rule generated, so any element using it renders unstyled. This is
 * a silent failure: the class lands in the DOM, nothing defines it, and the
 * element quietly inherits (a blue heading renders black).
 *
 * That is why every component in this directory writes its classes as
 * **literal strings in the `.tsx` file**. Use these constants to look up the
 * canonical value and copy it — do not `className={SOME_TOKEN}` for anything
 * whose class isn't also spelled out literally in a `.tsx` somewhere.
 *
 * Values safe to reference programmatically are those Tailwind already emits
 * because a `.tsx` file spells them out too.
 *
 * See `docs/UI-DESIGN-SYSTEM.md` §1 C7 for the full explanation.
 */

/* -------------------------------------------------------------------------- */
/* Accent                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Brand blue, resolved from the `--brand` token (`#0C4FD1` light / `#6CA0FF`
 * dark — the dark value is lighter because `#0C4FD1` fails contrast on the
 * dark card surface).
 *
 * Section headings ONLY (D-03). Not stat-tile labels: when every label is
 * blue the accent stops signalling anything, and tinted figures competed with
 * the headings badly enough that the analytics `StatTile` already dropped it.
 */
export const BRAND_ACCENT = 'text-[#0C4FD1] dark:text-[#6CA0FF]'

/* -------------------------------------------------------------------------- */
/* Surfaces (D-02 — a closed three-tier radius scale)                         */
/* -------------------------------------------------------------------------- */

/** Tier 1 — a top-level page panel. One per page section. */
export const PANEL = 'rounded-3xl border bg-card'

/** Tier 2 — a card nested inside a panel, or a detail-record card. */
export const PANEL_NESTED = 'rounded-2xl border bg-card'

/** Tier 2 — overlay surfaces: dropdown, select, popover content. */
export const OVERLAY = 'rounded-2xl'

/**
 * Tier 3 — an inset well inside a panel: borderless, tinted. Same material as
 * the search field, so the two read as one system rather than two boxes.
 */
export const INSET = 'rounded-2xl border-0 bg-muted/60 shadow-none'

/** The hairline that separates sections and table rows. Never a full border. */
export const HAIRLINE = 'border-border/60'

/** Standard padding for one section inside a panel. */
export const SECTION_PADDING = 'px-6 py-8'

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every pill control: date-range trigger, export button, select trigger,
 * pagination. Pair with shadcn `variant="outline"`.
 */
export const PILL_CONTROL =
  'h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm'

/**
 * A filled, borderless search field. Assumes a `left-3` search icon, hence
 * `pl-9` — drop that if there is no icon.
 */
export const FILLED_INPUT =
  'h-9 rounded-full border-0 bg-muted/60 pl-9 text-[0.8125rem] shadow-none focus-visible:bg-background'

/** The icon inside a `FILLED_INPUT`. */
export const FILLED_INPUT_ICON =
  'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50'

/**
 * A close (✕) button — dialogs, sheets, dismissible banners.
 *
 * Same material as `FILLED_INPUT`: a borderless `bg-muted/60` fill with no
 * shadow, so the control reads as part of the same system. The only
 * difference is the shape — a circle rather than a pill, because the content
 * is a single square glyph.
 *
 * Deliberately visible at rest rather than appearing on hover: a close
 * affordance the user has to discover by hovering is a close affordance they
 * may not find. The focus ring is left to the primitive's own
 * `focus-visible` handling.
 */
export const CLOSE_BUTTON =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-full border-0 bg-muted/60 text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground'

/**
 * A tinted filter chip — the dropdown/menu triggers in a filter row. Quieter
 * than `PILL_CONTROL` on purpose: outlined chips added a second competing set
 * of boxes next to the panel edge.
 */
export const FILTER_TRIGGER =
  'rounded-full border-0 bg-muted/60 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground'

/** A ghost "Back to X" pill. Sits above the page header. */
export const BACK_PILL = '-ml-2 h-8 gap-1.5 rounded-full text-muted-foreground'

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

/** Wrap `TAB_RAIL` in this so a long tab set scrolls instead of wrapping. */
export const TAB_SCROLLER = 'w-full min-w-0 overflow-x-auto pb-1'

/** The segmented rail a set of tab pills sits in. */
export const TAB_RAIL =
  'inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1'

/** One tab pill. For Radix `TabsTrigger` — uses `data-[state=active]`. */
export const TAB_PILL =
  'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border'

/**
 * The same pill for a hand-rolled `<button>` segmented control (range presets,
 * view toggles) where Radix Tabs would be overkill. Compose with
 * `TAB_PILL_ACTIVE` / `TAB_PILL_INACTIVE`.
 */
export const TAB_PILL_BUTTON =
  'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium transition-colors'
export const TAB_PILL_ACTIVE =
  'bg-background text-foreground shadow-sm ring-1 ring-border'
export const TAB_PILL_INACTIVE = 'text-muted-foreground hover:text-foreground'

/* -------------------------------------------------------------------------- */
/* Typography                                                                 */
/* -------------------------------------------------------------------------- */

/** Page title (D-01). Rendered by `PageHeader` — rarely needed directly. */
export const PAGE_TITLE = 'text-[1.75rem] font-semibold tracking-[-0.02em]'

/** The line under a page title. */
export const PAGE_SUBTITLE = 'mt-1 text-sm text-muted-foreground'

/** A blue section heading inside a panel. */
export const SECTION_HEADING =
  'flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]'

/** The icon in a section heading. */
export const SECTION_HEADING_ICON = 'h-[1.125rem] w-[1.125rem] shrink-0'

/** A section-level headline figure — the largest number on the page. */
export const SECTION_FIGURE =
  'mt-1 text-[2rem] font-medium leading-tight tracking-[-0.02em] tabular-nums'

/** A stat-tile figure. One step down from `SECTION_FIGURE`. */
export const STAT_FIGURE =
  'mt-1 text-[1.75rem] font-medium leading-tight tracking-[-0.02em] tabular-nums'

/** A quiet caption above a figure, or a sub-label above a group. */
export const SUB_LABEL = 'mb-3 text-sm text-muted-foreground'

/* -------------------------------------------------------------------------- */
/* Motion                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The page entrance fade (D-05).
 *
 * Apply to the HEADER BLOCK, never the page root: `animate-in` animates
 * `transform`, which makes the element a containing block and breaks any
 * `sticky` descendant (the dashboard Overview's sticky range bar is the
 * casualty). `PageHeader` already scopes this correctly.
 */
export const PAGE_ENTRANCE = 'animate-in fade-in duration-500'
