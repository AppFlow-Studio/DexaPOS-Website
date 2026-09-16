'use client'

import { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { subDays } from 'date-fns'
import { BarChart3 } from 'lucide-react'

import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
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
const TAB_TRIGGER =
  'shrink-0 rounded-full px-4 py-2 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm'

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
      <Panel>
        <PanelSection
          icon={BarChart3}
          label="Analytics"
          caption="Comprehensive insights into platform growth, revenue, operations, and payments"
        >
          <DateRangePicker
            from={dateRange.from}
            to={dateRange.to}
            onChange={setDateRange}
          />
        </PanelSection>
      </Panel>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-w-0 space-y-4"
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
