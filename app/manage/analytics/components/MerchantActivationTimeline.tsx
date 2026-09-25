'use client'

import { useMerchantActivationTimeline } from '@/lib/queries/use-platform-analytics'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/use-mobile'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Timer } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { StatRow, StatTile } from '@/components/dashboard/shell/StatTile'
import { AnalyticsTooltip, valueAxisWidthMobile } from '@/app/manage/components/analytics-primitives'

/** Bucket fills encode the histogram's time bands — data, not decoration (§4.6b). */
const BUCKET_COLORS = ['#22c55e', '#86efac', '#f59e0b', '#fb923c', '#ef4444', '#991b1b']

/** Below this many merchants a distribution says nothing, so it isn't drawn. */
const MIN_HISTOGRAM_SAMPLE = 5

export function MerchantActivationTimeline() {
  const { data, isLoading } = useMerchantActivationTimeline()
  const isMobile = useIsMobile()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-65 w-full rounded-3xl" />
      </div>
    )
  }

  if (!data) return null

  const n = data.sampleSize
  const basedOn = n > 0 ? `Based on ${n} merchant${n === 1 ? '' : 's'}` : 'No merchant has made a sale yet'

  return (
    <div className="space-y-6">
      <Panel>
        <PanelSection
          label="Time to first sale"
          icon={Timer}
          caption="Days from sign-up to a merchant's first paid order"
        >
          <div className="space-y-6">
            <StatRow columns={3}>
              <StatTile
                label="Avg Days to First Sale"
                value={data.avgDaysToActivate ?? '—'}
                meta={basedOn}
              />
              <StatTile
                label="Median Days"
                value={data.medianDaysToActivate ?? '—'}
                meta={basedOn}
              />
              <StatTile
                label="First Sale This Month"
                value={data.activatedThisMonth}
                meta="Merchants"
              />
            </StatRow>

            {n >= MIN_HISTOGRAM_SAMPLE ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.histogram} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={isMobile ? valueAxisWidthMobile(3) : undefined} />
                  <Tooltip content={<AnalyticsTooltip />} />
                  <Bar dataKey="count" name="Merchants" radius={[4, 4, 0, 0]}>
                    {data.histogram.map((_, i) => (
                      <Cell key={i} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground max-md:hidden">
                The distribution chart appears once {MIN_HISTOGRAM_SAMPLE} merchants have made a first sale
                {n > 0 ? ` (${n} so far)` : ''}.
              </p>
            )}
          </div>
        </PanelSection>
      </Panel>
    </div>
  )
}
