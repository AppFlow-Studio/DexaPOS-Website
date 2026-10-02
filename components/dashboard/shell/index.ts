/**
 * Shared shell for the merchant dashboard.
 *
 * Import from here rather than copying class strings into a page: a change to
 * the design language then costs one edit instead of sixty.
 *
 * ```tsx
 * import { PageShell, PageHeader, Panel, PanelSection, StatTile, StatRow }
 *   from '@/components/dashboard/shell'
 * ```
 *
 * See `docs/UI-DESIGN-SYSTEM.md` for the rules and the decision log.
 */

export { PageShell } from './PageShell'
export { PageHeader } from './PageHeader'
export { Panel, PanelGrid } from './Panel'
export { PanelSection, PanelRow, PanelSubLabel } from './PanelSection'
export { StatTile, StatRow, InsetTile } from './StatTile'
export { ChartEmpty, isEmptySeries } from './ChartEmpty'
export { ConfirmDialog, CENTRED_DIALOG } from './ConfirmDialog'
export { useRailAutoScroll } from './useRailAutoScroll'

export * from './tokens'

/**
 * Recharts styling shared with Orders → Analytics. Re-exported, not
 * duplicated, so there is one definition.
 *
 * ⚠️ These read raw `oklch()`/hex custom properties. Never wrap a token in
 * `hsl(...)` — it produces invalid CSS and Recharts silently falls back to its
 * own defaults rather than erroring.
 */
export {
  CHART_GRID,
  CHART_TICK,
  CHART_CURSOR_FILL,
  ChartTooltipPanel,
} from '@/components/dashboard/orders/analytics/AnalyticsPrimitives'
