import { Panel, PageShell } from '@/components/dashboard/shell'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type DataPageSkeletonVariant =
  | 'analytics'
  | 'orders'
  | 'report'
  | 'catalog'
  | 'table'
  | 'detail'
  | 'payments'
  | 'financials'
  | 'thread'
  | 'profile'
  | 'stations'
  | 'pos-settings'
  | 'media-gallery'

type DataPageSkeletonProps = {
  variant: DataPageSkeletonVariant
  label: string
  /**
   * `page` (default) wraps the skeleton in `PageShell`, matching merchant
   * dashboard routes. HQ routes under `/manage` lay themselves out with a
   * plain `space-y-6` div, so they pass `plain` to avoid a second `<main>`.
   */
  shell?: 'page' | 'plain'
  /** Renders the page title/subtitle/action block. HQ detail routes that own
   * their own breadcrumb pass `false` and get the breadcrumb line instead. */
  showHeader?: boolean
  /**
   * Mirrors `PageShell`'s own `width`. Routes that render inside
   * `PageShell width="narrow"` — profile, the support thread — must say so,
   * or the skeleton spans the full width and the page visibly narrows the
   * moment it arrives.
   */
  width?: 'full' | 'narrow'
  /**
   * `report` only. Report pages share a KPI row but diverge below it, so each
   * route states its own shape rather than inheriting a generic one that
   * promises panels it will never render.
   */
  report?: {
    /** KPI tiles in the stat row. Every report page uses `StatRow columns={4}`,
     * so 4 is the norm; pass the real count where it differs. */
    stats?: number
    /** Draw the pill tab strip above the body. */
    tabs?: number
    /** What fills the space under the KPI row. */
    body?: 'table' | 'chart' | 'panels'
    /** `panels` only: how many. */
    panels?: number
  }
}

function LoadingBlock({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn(
        'rounded-2xl bg-muted/70 motion-reduce:animate-none',
        className,
      )}
    />
  )
}

function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <LoadingBlock className="h-9 w-52 max-w-[72vw]" />
        <LoadingBlock className="h-4 w-72 max-w-[84vw] rounded-full" />
      </div>
      {/* Pages whose PageHeader takes no `actions` must not promise a button
          here — it vanishes on load and drags the header's height with it. */}
      {action ? <LoadingBlock className="h-9 w-full rounded-full sm:w-48" /> : null}
    </div>
  )
}

function StatSkeletons({ count = 4 }: { count?: number }) {
  if (count <= 0) return null

  return (
    <Panel>
      <div className="grid grid-cols-2 gap-x-5 gap-y-6 px-4 py-6 sm:px-6 lg:grid-cols-4">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="min-w-0 space-y-3">
            <LoadingBlock className="h-3 w-20 rounded-full" />
            <LoadingBlock className="h-8 w-28 max-w-full" />
            <LoadingBlock className="h-3 w-24 max-w-full rounded-full" />
          </div>
        ))}
      </div>
    </Panel>
  )
}

function AnalyticsSkeleton() {
  return (
    <>
      <Panel padded>
        <div className="flex min-h-[22rem] flex-col gap-5 sm:min-h-[25rem]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <LoadingBlock className="h-10 w-44" />
              <LoadingBlock className="h-4 w-28 rounded-full" />
            </div>
            <LoadingBlock className="h-9 w-36 rounded-full" />
          </div>
          <LoadingBlock className="min-h-52 flex-1" />
          <div className="flex justify-center gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <LoadingBlock key={index} className="h-8 w-12 rounded-full" />
            ))}
          </div>
        </div>
      </Panel>

      <StatSkeletons />

      {/* Scrolls rather than clips: at 360px three pills exceed the row, and a
          half-cut pill reads as a rendering bug. Matches the real page's
          scrollable tab strip. */}
      <div className="flex gap-2 overflow-x-auto rounded-full bg-muted/40 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <LoadingBlock key={index} className="h-9 w-32 shrink-0 rounded-full" />
        ))}
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Panel key={index} padded className="space-y-5">
            <LoadingBlock className="h-5 w-36" />
            {Array.from({ length: 4 }).map((__, rowIndex) => (
              <div
                key={rowIndex}
                className="flex items-center justify-between gap-4"
              >
                <LoadingBlock className="h-4 w-28 rounded-full" />
                <LoadingBlock className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </Panel>
        ))}
      </div>
    </>
  )
}

function CatalogSkeleton() {
  return (
    <>
      <StatSkeletons />

      <Panel padded>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <LoadingBlock className="h-5 w-28" />
              <LoadingBlock className="h-3 w-20 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-2">
              <LoadingBlock className="h-9 w-full rounded-full sm:w-60" />
              <LoadingBlock className="h-9 w-24 rounded-full" />
              <LoadingBlock className="h-9 w-24 rounded-full" />
              <LoadingBlock className="h-9 w-28 rounded-full" />
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="min-h-80 rounded-2xl bg-muted/25 p-4"
              >
                <LoadingBlock className="h-40 w-full" />
                <div className="mt-5 space-y-3">
                  <LoadingBlock className="h-5 w-2/3" />
                  <LoadingBlock className="h-4 w-1/2 rounded-full" />
                  <div className="flex gap-2 pt-3">
                    <LoadingBlock className="h-7 w-20 rounded-full" />
                    <LoadingBlock className="h-7 w-24 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </>
  )
}

/**
 * Two containers, matching `/dashboard/orders` exactly:
 *
 *   1. Overview — range pills + resolved window, then a 5-across KPI row
 *      where each tile is label / figure / sparkline.
 *   2. All Orders — heading + Refresh, a filter chip row, then table rows.
 *
 * Deliberately NOT the `analytics` variant: that one draws a large chart
 * panel, a tab strip and four two-column summary panels, none of which this
 * page has. Reusing it made the skeleton promise a layout that never arrived.
 */
function OrdersSkeleton() {
  return (
    <>
      {/* 1 — Overview */}
      <div className="min-w-0 overflow-hidden rounded-3xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-6 py-4">
          <div className="flex items-center gap-0.5 rounded-full bg-muted/70 p-1">
            {Array.from({ length: 4 }).map((_, index) => (
              <LoadingBlock key={index} className="h-9 w-16 rounded-full" />
            ))}
          </div>
          <LoadingBlock className="h-4 w-36 rounded-full" />
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-6 px-2 pb-6 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="min-w-0 space-y-3 px-4">
              <LoadingBlock className="h-4 w-20 rounded-full" />
              <LoadingBlock className="h-9 w-24 max-w-full" />
              {/* Mirrors the tile's `mt-4 h-12` sparkline slot. */}
              <LoadingBlock className="h-12 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* 2 — All Orders */}
      <div className="min-w-0 overflow-hidden rounded-3xl border bg-card px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <LoadingBlock className="h-5 w-28" />
          <LoadingBlock className="h-8 w-24 rounded-full" />
        </div>

        {/* Widths are literal, never interpolated: Tailwind scans source text,
            so a class built at runtime gets no rule and renders unstyled. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <LoadingBlock className="h-9 w-40 rounded-full" />
          <LoadingBlock className="h-9 w-24 rounded-full" />
          <LoadingBlock className="h-9 w-20 rounded-full" />
          <LoadingBlock className="h-9 w-28 rounded-full" />
          <LoadingBlock className="h-9 w-28 rounded-full" />
          <LoadingBlock className="h-9 w-28 rounded-full" />
          <LoadingBlock className="h-9 w-24 rounded-full" />
        </div>

        <LoadingBlock className="mt-4 h-10 w-full max-w-sm rounded-full" />

        <div className="mt-4 space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <LoadingBlock key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * Report pages: a KPI row, then whatever that particular report actually
 * shows. Deliberately configurable — the reports differ enough that a single
 * fixed shape would promise a chart to a page that renders a table, or four
 * summary panels to one that renders none.
 */
function ReportSkeleton({
  stats = 4,
  tabs = 0,
  body = 'table',
  panels = 4,
}: NonNullable<DataPageSkeletonProps['report']> = {}) {
  return (
    <>
      <StatSkeletons count={stats} />

      {tabs > 0 && (
        <div className="flex gap-2 overflow-x-auto rounded-full bg-muted/40 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Array.from({ length: tabs }).map((_, index) => (
            <LoadingBlock key={index} className="h-9 w-28 shrink-0 rounded-full" />
          ))}
        </div>
      )}

      {body === 'chart' && (
        <Panel padded>
          <div className="space-y-5">
            <LoadingBlock className="h-5 w-44 max-w-full" />
            <LoadingBlock className="h-64 w-full" />
          </div>
        </Panel>
      )}

      {body === 'table' && (
        <Panel padded>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <LoadingBlock className="h-5 w-40 max-w-full" />
              <LoadingBlock className="h-9 w-28 rounded-full" />
            </div>
            <div className="min-w-0 space-y-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <LoadingBlock key={index} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </Panel>
      )}

      {body === 'panels' && (
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          {Array.from({ length: panels }).map((_, index) => (
            <Panel key={index} padded className="space-y-5">
              <LoadingBlock className="h-5 w-36 max-w-full" />
              {Array.from({ length: 4 }).map((__, rowIndex) => (
                <div
                  key={rowIndex}
                  className="flex items-center justify-between gap-4"
                >
                  <LoadingBlock className="h-4 w-28 max-w-full rounded-full" />
                  <LoadingBlock className="h-5 w-20 shrink-0 rounded-full" />
                </div>
              ))}
            </Panel>
          ))}
        </div>
      )}
    </>
  )
}

/**
 * A filter bar over a row-based list. Used by routes whose payload is a table
 * or a stack of record rows rather than a media grid.
 */
function TableSkeleton() {
  return (
    <>
      <StatSkeletons />

      <Panel padded>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <LoadingBlock className="h-9 w-full rounded-full lg:w-72" />
            <div className="flex flex-wrap gap-2">
              <LoadingBlock className="h-9 w-28 rounded-full" />
              <LoadingBlock className="h-9 w-28 rounded-full" />
              <LoadingBlock className="h-9 w-24 rounded-full" />
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="flex min-w-0 items-center gap-4 rounded-2xl bg-muted/25 px-4 py-4"
              >
                <LoadingBlock className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <LoadingBlock className="h-4 w-40 max-w-full rounded-full" />
                  <LoadingBlock className="h-3 w-56 max-w-full rounded-full" />
                </div>
                <LoadingBlock className="hidden h-6 w-20 shrink-0 rounded-full sm:block" />
                <LoadingBlock className="h-8 w-8 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </>
  )
}

/**
 * A single record workspace: breadcrumb, identity header, summary strip, then
 * a tabbed body. Matches the HQ merchant/subscription/user detail geometry.
 */
function DetailSkeleton() {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <LoadingBlock className="h-3 w-20 rounded-full" />
        <LoadingBlock className="h-3 w-3 rounded-full" />
        <LoadingBlock className="h-3 w-32 max-w-[40vw] rounded-full" />
      </div>

      <Panel padded>
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <LoadingBlock className="h-14 w-14 shrink-0 rounded-2xl" />
            <div className="min-w-0 space-y-2">
              <LoadingBlock className="h-6 w-48 max-w-[60vw]" />
              <LoadingBlock className="h-3 w-32 max-w-[44vw] rounded-full" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <LoadingBlock className="h-9 w-28 rounded-full" />
            <LoadingBlock className="h-9 w-24 rounded-full" />
          </div>
        </div>
      </Panel>

      <StatSkeletons />

      <Panel padded className="space-y-5">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <LoadingBlock key={index} className="h-9 w-28 shrink-0 rounded-full" />
          ))}
        </div>

        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="min-w-0 space-y-2">
              <LoadingBlock className="h-3 w-24 rounded-full" />
              <LoadingBlock className="h-5 w-40 max-w-full rounded-full" />
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}

/**
 * `/dashboard/payments`: a two-pill tab strip, a 4-tile stat row, a
 * THREE-across chart grid, then the All Payments table panel.
 *
 * Not the `analytics` variant: that leads with one big hero chart and closes
 * with four two-column summary panels. This page has neither, so the generic
 * shape promised a layout that never arrived.
 */
function PaymentsSkeleton() {
  return (
    <>
      <div className="flex gap-2 overflow-x-auto rounded-full bg-muted/40 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <LoadingBlock className="h-9 w-32 shrink-0 rounded-full" />
        <LoadingBlock className="h-9 w-28 shrink-0 rounded-full" />
      </div>

      <StatSkeletons />

      {/* Mirrors PaymentCharts: three nested panels, each a title over a
          200px plot. */}
      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Panel key={index} nested className="min-w-0 px-4 py-4 sm:px-6">
            <LoadingBlock className="h-5 w-32 max-w-full" />
            <LoadingBlock className="mt-4 h-[200px] w-full" />
          </Panel>
        ))}
      </div>

      <Panel padded>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LoadingBlock className="h-5 w-32 max-w-full" />
            <LoadingBlock className="h-8 w-24 rounded-full" />
          </div>
          <div className="min-w-0 space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <LoadingBlock key={index} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </Panel>
    </>
  )
}

/**
 * `/dashboard/transactions`: hero chart panel, a 4-tile stat row, a
 * three-pill tab strip, then the overview tab's SIX summary cards in two
 * columns.
 *
 * Close to `analytics` but not equal to it: that variant draws four summary
 * panels and omits the panel wrapper this page puts around its stat row. The
 * route loader and the in-page loading gate both render this, so the two hand
 * off without the layout shifting.
 */
function FinancialsSkeleton() {
  return (
    <>
      <Panel padded>
        <div className="flex min-h-[22rem] flex-col gap-5 sm:min-h-[25rem]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <LoadingBlock className="h-10 w-44 max-w-full" />
              <LoadingBlock className="h-4 w-28 rounded-full" />
            </div>
            <LoadingBlock className="h-9 w-36 rounded-full" />
          </div>
          <LoadingBlock className="min-h-52 flex-1" />
        </div>
      </Panel>

      <StatSkeletons />

      <div className="flex gap-2 overflow-x-auto rounded-full bg-muted/40 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <LoadingBlock key={index} className="h-9 w-32 shrink-0 rounded-full" />
        ))}
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Panel key={index} padded className="space-y-5">
            <LoadingBlock className="h-5 w-36 max-w-full" />
            {Array.from({ length: 4 }).map((__, rowIndex) => (
              <div
                key={rowIndex}
                className="flex items-center justify-between gap-4"
              >
                <LoadingBlock className="h-4 w-28 max-w-full rounded-full" />
                <LoadingBlock className="h-5 w-20 shrink-0 rounded-full" />
              </div>
            ))}
          </Panel>
        ))}
      </div>
    </>
  )
}

/**
 * A support ticket conversation: a status/meta line, then the message thread
 * in one tall panel with a composer pinned under it.
 *
 * Alternating bubble alignment and widths are deliberate — a column of
 * identical full-width rows does not read as a conversation. The shapes are
 * fixed per index rather than random so server and client markup agree.
 */
const THREAD_BUBBLES = [
  { own: false, width: 'w-3/4', height: 'h-16' },
  { own: true, width: 'w-2/3', height: 'h-12' },
  { own: false, width: 'w-1/2', height: 'h-12' },
  { own: true, width: 'w-3/4', height: 'h-20' },
  { own: false, width: 'w-2/3', height: 'h-14' },
]

function ThreadSkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <LoadingBlock className="h-6 w-24 rounded-full" />
        <LoadingBlock className="h-6 w-20 rounded-full" />
      </div>

      <Panel
        padded
        className="flex h-[55dvh] flex-col sm:h-auto sm:min-h-[420px]"
      >
        <div className="min-h-0 flex-1 space-y-4">
          {THREAD_BUBBLES.map((bubble, index) => (
            <div key={index} className={cn('flex', bubble.own && 'justify-end')}>
              <LoadingBlock
                className={cn('max-w-[75%]', bubble.width, bubble.height)}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-end gap-2">
          <LoadingBlock className="h-11 flex-1 rounded-2xl" />
          <LoadingBlock className="h-11 w-11 shrink-0 rounded-full" />
        </div>
      </Panel>
    </>
  )
}

/**
 * `/dashboard/profile`: an identity panel (avatar beside name/email) over the
 * account-management panel. The lower block is Clerk's `<UserProfile>`, which
 * renders its own side nav beside a form, so the skeleton splits the same way
 * rather than drawing one undifferentiated slab.
 */
/**
 * Mirrors `/dashboard/profile`: an identity Panel over Clerk's `<UserProfile>`.
 *
 * Shapes are taken from the rendered widget rather than guessed — its nav is a
 * titled rail with exactly two items (Profile, Security), and the body is a
 * stack of read-only detail ROWS (label / value / action), not a form. An
 * earlier version drew three nav pills over three rounded inputs and a submit
 * button, none of which the page has.
 */
function ProfileSkeleton() {
  return (
    <>
      {/* Identity summary — avatar, name, email, org pill. */}
      <Panel padded>
        <div className="flex items-center gap-4">
          <LoadingBlock className="h-16 w-16 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <LoadingBlock className="h-5 w-40 max-w-full" />
            <LoadingBlock className="h-4 w-56 max-w-full rounded-full" />
            <LoadingBlock className="h-5 w-28 max-w-full rounded-full" />
          </div>
        </div>
      </Panel>

      <Panel padded>
        <div className="flex min-w-0 flex-col gap-6 sm:flex-row">
          {/* Clerk's nav rail: "Account" + subtitle, then Profile / Security. */}
          <div className="w-full shrink-0 space-y-4 sm:w-56">
            <div className="space-y-2">
              <LoadingBlock className="h-6 w-28 max-w-full" />
              <LoadingBlock className="h-3 w-40 max-w-full rounded-full" />
            </div>
            <div className="space-y-1.5">
              {Array.from({ length: 2 }).map((_, index) => (
                <LoadingBlock key={index} className="h-8 w-full rounded-full" />
              ))}
            </div>
          </div>

          {/* "Profile details" over its detail rows. */}
          <div className="min-w-0 flex-1 space-y-5">
            <LoadingBlock className="h-6 w-36 max-w-full" />
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="flex min-w-0 items-center justify-between gap-4"
              >
                <LoadingBlock className="h-4 w-28 shrink-0 rounded-full" />
                <LoadingBlock className="h-4 min-w-0 flex-1 rounded-full" />
                <LoadingBlock className="hidden h-4 w-20 shrink-0 rounded-full sm:block" />
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </>
  )
}

/**
 * One `PanelSection` heading: the brand-blue icon + label row, then the
 * caption line under it. Every settings panel opens this way, so the three
 * settings variants below share this rather than each redrawing it.
 */
function PanelHeadingSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-64 space-y-2">
        <div className="flex items-center gap-2">
          <LoadingBlock className="h-[1.125rem] w-[1.125rem] shrink-0 rounded-md" />
          <LoadingBlock className="h-5 w-44 max-w-full" />
        </div>
        <LoadingBlock className="h-4 w-64 max-w-full rounded-full" />
      </div>
      {action && <LoadingBlock className="h-6 w-12 shrink-0 rounded-full" />}
    </div>
  )
}

/** A label/description line beside a switch — the unit POS defaults is made of. */
function SettingRowSkeleton() {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 rounded-2xl bg-muted/25 px-4 py-4">
      <div className="min-w-0 flex-1 space-y-2">
        <LoadingBlock className="h-4 w-36 max-w-full rounded-full" />
        <LoadingBlock className="h-3 w-52 max-w-full rounded-full" />
      </div>
      <LoadingBlock className="h-5 w-9 shrink-0 rounded-full" />
    </div>
  )
}

/**
 * `/dashboard/settings/stations`: a search field and two filter pills over the
 * station list, which is a nine-column table at `xl` and a two-up card grid
 * below it, closing with the pagination row.
 *
 * Deliberately NOT the `table` variant: that one leads with a four-tile KPI
 * row this page never renders, and draws a single column of rows where this
 * page shows a responsive card grid on everything narrower than a desktop.
 */
export function StationsBodySkeleton() {
  return (
    <>
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
        <LoadingBlock className="h-10 w-full rounded-full sm:w-[300px]" />
        <LoadingBlock className="h-9 w-full rounded-full sm:w-[180px]" />
        <LoadingBlock className="h-9 w-full rounded-full sm:w-[140px]" />
      </div>

      {/* Desktop table — a header band over the rows, matching the real page's
          `hidden xl:block` split. */}
      <div className="hidden min-w-0 xl:block">
        <Panel>
          <div className="min-w-0 space-y-2 px-4 py-4 sm:px-6">
            <LoadingBlock className="h-10 w-full" />
            {Array.from({ length: 6 }).map((_, index) => (
              <LoadingBlock key={index} className="h-14 w-full" />
            ))}
          </div>
        </Panel>
      </div>

      {/* Card grid below `xl`, mirroring `grid-cols-1 sm:grid-cols-2`. */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="min-w-0 space-y-4 rounded-2xl bg-muted/25 p-4"
          >
            <div className="flex min-w-0 items-start gap-3">
              <LoadingBlock className="h-9 w-9 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <LoadingBlock className="h-4 w-32 max-w-full rounded-full" />
                <LoadingBlock className="h-3 w-24 max-w-full rounded-full" />
              </div>
              <LoadingBlock className="h-6 w-16 shrink-0 rounded-full" />
            </div>
            <LoadingBlock className="h-3 w-40 max-w-full rounded-full" />
          </div>
        ))}
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <LoadingBlock className="h-4 w-48 max-w-full rounded-full" />
        <div className="flex items-center gap-2">
          <LoadingBlock className="h-9 w-28 rounded-full" />
          <LoadingBlock className="h-9 w-24 rounded-full" />
        </div>
      </div>
    </>
  )
}

/**
 * `/dashboard/settings/pos`: the "how this resolves" alert, then a two-column
 * grid — three location-default panels of switch rows on the left, the station
 * override panel and the scope note on the right.
 *
 * The previous loader drew two equal 520px slabs, so the page visibly
 * rearranged itself into an alert plus an uneven `1.15fr / 0.85fr` split the
 * moment the settings arrived. The column ratio and the switch-row rhythm are
 * reproduced here for that reason.
 */
export function PosSettingsBodySkeleton() {
  return (
    <>
      <div className="flex min-w-0 items-start gap-3 rounded-2xl border bg-card px-4 py-4">
        <LoadingBlock className="mt-0.5 h-4 w-4 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1 space-y-2">
          <LoadingBlock className="h-4 w-48 max-w-full rounded-full" />
          <LoadingBlock className="h-3 w-full rounded-full" />
          <LoadingBlock className="h-3 w-3/4 rounded-full" />
        </div>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-w-0 space-y-6">
          {/* Receipt content and payment behaviour lay their switches out
              `md:grid-cols-2`; display and notifications is a single column. */}
          {[
            { rows: 6, columns: 2, action: true },
            { rows: 4, columns: 2, action: false },
            { rows: 4, columns: 1, action: false },
          ].map((panel, index) => (
            <Panel key={index}>
              <div className="min-w-0 space-y-5 px-4 py-8 sm:px-6">
                <PanelHeadingSkeleton action={panel.action} />
                <div
                  className={cn(
                    'grid min-w-0 gap-3',
                    panel.columns === 2 && 'md:grid-cols-2',
                  )}
                >
                  {Array.from({ length: panel.rows }).map((_, rowIndex) => (
                    <SettingRowSkeleton key={rowIndex} />
                  ))}
                </div>
              </div>
            </Panel>
          ))}
        </div>

        <div className="min-w-0 space-y-6">
          <Panel>
            <div className="min-w-0 space-y-5 px-4 py-8 sm:px-6">
              <PanelHeadingSkeleton />
              {/* Station picker, then the controls it can override. */}
              <div className="min-w-0 space-y-2">
                <LoadingBlock className="h-4 w-20 rounded-full" />
                <LoadingBlock className="h-10 w-full rounded-full" />
              </div>
              {Array.from({ length: 4 }).map((_, index) => (
                <SettingRowSkeleton key={index} />
              ))}
              <LoadingBlock className="h-9 w-32 rounded-full" />
            </div>
          </Panel>

          <Panel>
            <div className="min-w-0 space-y-5 px-4 py-8 sm:px-6">
              <PanelHeadingSkeleton />
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <LoadingBlock key={index} className="h-3 w-full rounded-full" />
                ))}
                <LoadingBlock className="h-3 w-2/3 rounded-full" />
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}

/**
 * The gallery tiles on their own. Each carries the real 16:9 aspect ratio, so
 * the uploaded images drop into place rather than pushing the page down.
 */
export function MediaGalleryGridSkeleton() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="min-w-0 overflow-hidden rounded-2xl bg-muted/45"
        >
          <LoadingBlock className="aspect-video w-full rounded-none" />
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <LoadingBlock className="h-3 w-24 max-w-full rounded-full" />
            <LoadingBlock className="h-8 w-8 shrink-0 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * `/dashboard/settings/customer-display`: an upload dropzone panel over the
 * image gallery, a three-across grid of 16:9 cards.
 *
 * The gallery tiles carry the same aspect ratio as the real ones, so the
 * carousel images drop into place rather than pushing the page down.
 */
export function MediaGalleryBodySkeleton() {
  return (
    <>
      <Panel>
        <div className="min-w-0 space-y-4 px-4 py-8 sm:px-6">
          <PanelHeadingSkeleton />
          {/* The dropzone itself — one tall drop target, not a row of bars. */}
          <LoadingBlock className="h-40 w-full" />
          <LoadingBlock className="h-3 w-72 max-w-full rounded-full" />
        </div>
      </Panel>

      <Panel>
        <div className="min-w-0 space-y-5 px-4 py-8 sm:px-6">
          <PanelHeadingSkeleton />
          <MediaGalleryGridSkeleton />
        </div>
      </Panel>
    </>
  )
}

const VARIANT_BODIES: Record<
  Exclude<DataPageSkeletonVariant, 'report'>,
  () => React.JSX.Element
> = {
  analytics: AnalyticsSkeleton,
  orders: OrdersSkeleton,
  catalog: CatalogSkeleton,
  table: TableSkeleton,
  detail: DetailSkeleton,
  payments: PaymentsSkeleton,
  financials: FinancialsSkeleton,
  thread: ThreadSkeleton,
  profile: ProfileSkeleton,
  stations: StationsBodySkeleton,
  'pos-settings': PosSettingsBodySkeleton,
  'media-gallery': MediaGalleryBodySkeleton,
}

export function DataPageSkeleton({
  variant,
  label,
  shell = 'page',
  // `detail` opens with its own breadcrumb + identity header, so the generic
  // title block would be a second, duplicate header.
  showHeader = variant !== 'detail',
  // These two render inside `PageShell width="narrow"`, so they default to it
  // rather than making every caller remember.
  width = variant === 'profile' || variant === 'thread' ? 'narrow' : 'full',
  report,
}: DataPageSkeletonProps) {
  // Rendered as an element, not assigned to a capitalised variable and used
  // as `<Body />`: the arrow form defines a new component type on every
  // render, which remounts the subtree and trips react-hooks' "cannot create
  // components during render".
  const body =
    variant === 'report' ? (
      <ReportSkeleton {...(report ?? {})} />
    ) : (
      VARIANT_BODIES[variant]()
    )

  const content = (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-page-loader={variant}
      className="min-w-0 space-y-6"
    >
      <span className="sr-only">{label}</span>
      {showHeader ? <HeaderSkeleton action={variant !== 'profile'} /> : null}
      {body}
    </div>
  )

  if (shell === 'plain') {
    return content
  }

  return <PageShell width={width}>{content}</PageShell>
}
