'use client'

import { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { subDays } from 'date-fns'

import { DateRangePicker } from './DateRangePicker'
import { GrowthSection } from './GrowthSection'
import { RevenueSection } from './RevenueSection'
import { OperationsSection } from './OperationsSection'
import { PaymentsSection } from './PaymentsSection'

/**
 * The HQ tab strip: a muted track of pill triggers that scrolls rather than
 * clips. Written literally rather than pulled from `tokens.ts` — Tailwind does
 * not scan `.ts`, so a class sourced only from there gets no CSS rule (C7).
 */
// `flex w-full justify-start` overrides the shadcn TabsList base, which ships
// `inline-flex w-fit justify-center`. Those made the strip a content-width box
// that centred its own overflow, so on a phone the first and last pills were
// both clipped and no amount of scrolling revealed them. Full width + start
// alignment lets the row fill the panel and scroll from its true left edge.
const TAB_LIST =
  'flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-full bg-muted/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
// A white pill on a `bg-muted/60` track was too quiet to find at a glance —
// the only difference between selected and not was a near-white fill and a
// hairline shadow. The active tab now also takes the brand blue and the
// weight, which is the same accent `PanelSection` uses for a heading, so the
// selected section and its heading read as the same thing.
const TAB_TRIGGER =
  'shrink-0 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-[#0C4FD1] data-[state=active]:shadow-sm dark:data-[state=active]:text-[#6CA0FF]'

const TABS = [
  { value: 'growth', label: 'Growth' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'operations', label: 'Operations' },
  { value: 'payments', label: 'Payments' },
]

export function AnalyticsContent() {
  // Default to last 30 days
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(
    () => {
      const to = new Date()
      const from = subDays(to, 30)
      return {
        from: from.toISOString(),
        to: to.toISOString()
      }
    }
  )

  // Controlled so the strip can scroll the active tab into view. On a phone the
  // four pills overflow, so selecting one at the far end (or restoring a tab
  // that is scrolled off) would otherwise leave it out of sight.
  const [activeTab, setActiveTab] = useState(TABS[0].value)
  const tabListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const syncScroll = (behavior: ScrollBehavior) => {
      const list = tabListRef.current
      if (!list) return

      // Nothing to scroll when the strip fits — the desktop case.
      if (list.scrollWidth <= list.clientWidth) return

      const active = list.querySelector<HTMLElement>('[data-state="active"]')
      if (!active) return

      // Centre the active pill in the strip. Measured with rects rather than
      // offsetLeft: the list is not a positioned ancestor, so offsetLeft would
      // be relative to some outer element and the maths would be off by that
      // element's offset. Clamping to [0, max] means the first and last tabs
      // settle flush against their end instead of over-scrolling, so centring
      // never pushes an edge pill out of view.
      const listRect = list.getBoundingClientRect()
      const activeRect = active.getBoundingClientRect()
      const delta =
        activeRect.left -
        listRect.left -
        (listRect.width - activeRect.width) / 2
      const max = list.scrollWidth - list.clientWidth
      const target = Math.max(0, Math.min(list.scrollLeft + delta, max))

      // Skip sub-pixel no-ops so an already-centred tab does not re-trigger a
      // smooth scroll on every resize tick.
      if (Math.abs(target - list.scrollLeft) < 1) return

      list.scrollTo({ left: target, behavior })
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // rAF so the measurement happens after paint: on the first run the strip
    // has just mounted and the rects are not final until layout settles.
    const frame = requestAnimationFrame(() =>
      syncScroll(reduced ? 'auto' : 'smooth')
    )

    // Keep the active pill in view when the strip's width changes — rotating
    // the phone, or the sidebar collapsing on desktop.
    const onResize = () => syncScroll('auto')
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [activeTab])

  return (
    <div className="min-w-0 space-y-6">
      {/* No title card here. A full bordered `Panel` whose entire payload was
          the word "Analytics" and a caption listing "growth, revenue,
          operations, and payments" cost a screen-third of the first viewport
          to restate what the tab strip immediately below already says — as
          tabs. The page is reached by a tab labelled Analytics, so the heading
          was the third statement of the same fact. Removed rather than
          shrunk: the sections below carry their own headings. */}

      {/* The range controls pin for the whole scroll, so a figure read far
          down the page can still be attributed to 7D or 90D. Sticky only
          travels within its own parent, so this stays at the top level rather
          than nested in any panel, which would unpin it the moment that panel
          left the viewport.

          Sticky, not fixed: the offset parent is `#main-content` (the layout's
          `overflow-y-auto` pane), so `top-0` lands under the app header without
          hard-coding its height. `-top-4` rather than `top-0`: the pane's own
          `p-4` padding sits inside the scroll box, so a bar pinned at `top-0`
          leaves exactly that 16px of page visible above it (measured). Pulling
          the pin up by the padding and adding it back as `pt-4` lands the bar
          flush against the header with the controls in the same place.

          The negative margins cancel that pane's
          `p-4 sm:p-6` on all sides, and the matching padding puts the controls
          back where they were: without the negative TOP margin the pane's own
          padding sits above the pinned bar as a transparent strip, and rows
          scroll through it. Opaque `bg-background`, not a translucent blur —
          a chart sliding under a 75%-opaque bar stays legible enough to read
          as a glitch.

          Left-aligned. This previously forced `[&>div]:justify-center`, which
          left the controls floating mid-row with the empty space either side
          reading as a gap in the page. The `-mx-4 px-4` / `sm:-mx-6 sm:px-6`
          pair cancels the pane's own `p-4 sm:p-6` exactly, so the toolbar's
          left edge now lands flush with the tab strip and the cards below it —
          one alignment down the whole column. No bottom rule: the design
          language has no dividing lines (§0), and the opaque background is
          already enough of an edge once content scrolls beneath it. */}
      <div className="sticky -top-4 z-20 -mx-4 -mt-4 bg-background px-4 pb-2 pt-4 sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
        <DateRangePicker
          from={dateRange.from}
          to={dateRange.to}
          onChange={setDateRange}
        />
      </div>

      {/* `-mt-3` pulls the tab strip up against the range toolbar, cancelling
          most of the parent `space-y-6`. Sitting in that full 24px rhythm the
          toolbar was equidistant from the page header above and the tabs
          below, so it read as a detached band belonging to neither. The range
          scopes everything in these tabs, so it belongs WITH them. */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-w-0 -mt-3 space-y-4"
      >
        <TabsList ref={tabListRef} className={TAB_LIST}>
          {TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className={TAB_TRIGGER}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="growth" className="min-w-0 space-y-4">
          <GrowthSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>

        <TabsContent value="revenue" className="min-w-0 space-y-4">
          <RevenueSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>

        <TabsContent value="operations" className="min-w-0 space-y-4">
          <OperationsSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>

        <TabsContent value="payments" className="min-w-0 space-y-4">
          <PaymentsSection from={dateRange.from} to={dateRange.to} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
