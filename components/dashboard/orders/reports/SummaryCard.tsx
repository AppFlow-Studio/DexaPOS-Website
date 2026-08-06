'use client'

/**
 * Report summary tiles.
 *
 * These are now the shared shell primitives — a report's headline figures and
 * an analytics page's stat tiles were the same element styled two ways, which
 * is exactly the drift the shell exists to stop.
 *
 * Prefer importing `StatTile` / `StatRow` / `InsetTile` from
 * `@/components/dashboard/shell` directly in new code.
 */

import {
  BRAND_ACCENT,
  InsetTile,
  StatRow,
  StatTile,
} from '@/components/dashboard/shell'

/**
 * @deprecated Import `BRAND_ACCENT` from `@/components/dashboard/shell`.
 * Both resolve to the `--brand` token.
 */
export const REPORT_ACCENT = BRAND_ACCENT

/**
 * @deprecated Use `StatTile`.
 *
 * The label is now `text-muted-foreground` rather than brand blue (D-03):
 * blue marks a section heading, and when every tile label carried it too the
 * accent stopped signalling anything.
 */
export const SummaryCard = StatTile

/** @deprecated Use `StatRow`. */
export const SummaryCardRow = StatRow

/** @deprecated Use `InsetTile`. */
export const ChannelCard = InsetTile
