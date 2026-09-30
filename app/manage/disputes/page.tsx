'use client'

import { PageHeader, PageShell, Panel, PanelSection, StatRow, StatTile } from '@/components/dashboard/shell'
import { ChargebacksSection } from '../transactions/components/ChargebacksSection'
import { usePlatformChargebacks } from '@/lib/queries/use-platform-analytics'

// The disputed-amount query is capped server-side at 200 rows.
const AMOUNT_SAMPLE_LIMIT = 200

function formatCurrency(amount: number) {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function HQDisputesPage() {
  // pendingCount and urgentCount come from server-side COUNT queries — accurate regardless of page size
  const aggregate = usePlatformChargebacks(undefined, 1, 0)
  // Separate query scoped to under_review for accurate count
  const underReview = usePlatformChargebacks({ statuses: ['under_review'] }, 1, 0)
  // Separate query to get total disputed amount across all records
  const amount = usePlatformChargebacks(
    { statuses: ['notified', 'under_review', 'defended'] },
    AMOUNT_SAMPLE_LIMIT,
    0
  )

  const isLoading = aggregate.isLoading || underReview.isLoading || amount.isLoading
  // A result carrying `errorCode` is a failed query that still resolved.
  const aggregateFailed = aggregate.isError || !!aggregate.data?.errorCode
  const underReviewFailed = underReview.isError || !!underReview.data?.errorCode
  const amountFailed = amount.isError || !!amount.data?.errorCode

  const amountTotal = amount.data?.total ?? 0
  const totalDisputedAmount = amount.data?.data.reduce((sum, r) => sum + r.amount, 0) ?? 0
  const amountIsPartial = amountTotal > AMOUNT_SAMPLE_LIMIT

  return (
    <PageShell as="div">
      <PageHeader
        title="TSYS Disputes"
        subtitle="Platform-wide dispute management across all merchants"
      />

      <Panel padded>
        <StatRow columns={4}>
          <StatTile
            label="Total open"
            isLoading={isLoading}
            value={aggregateFailed ? '—' : (aggregate.data?.pendingCount ?? 0).toLocaleString()}
            meta={aggregateFailed ? 'Couldn’t load' : 'Notified or under review'}
            showMetaOnMobile={aggregateFailed}
          />
          <StatTile
            label="Urgent"
            isLoading={isLoading}
            value={aggregateFailed ? '—' : (aggregate.data?.urgentCount ?? 0).toLocaleString()}
            meta={aggregateFailed ? 'Couldn’t load' : 'Deadline within 72 hours'}
            showMetaOnMobile={aggregateFailed}
          />
          <StatTile
            label="Under review"
            isLoading={isLoading}
            value={underReviewFailed ? '—' : (underReview.data?.total ?? 0).toLocaleString()}
            meta={underReviewFailed ? 'Couldn’t load' : 'Currently being reviewed'}
            showMetaOnMobile={underReviewFailed}
          />
          <StatTile
            label="Total in dispute"
            isLoading={isLoading}
            value={amountFailed ? '—' : formatCurrency(totalDisputedAmount)}
            meta={
              amountFailed
                ? 'Couldn’t load'
                : amountIsPartial
                  ? `First ${AMOUNT_SAMPLE_LIMIT} of ${amountTotal.toLocaleString()} disputes`
                  : 'Open and defended disputes'
            }
            // A partial sum is only honest with its basis beside it.
            showMetaOnMobile={amountFailed || amountIsPartial}
          />
        </StatRow>
      </Panel>

      <Panel>
        <PanelSection label="Chargebacks" caption="Review disputes, deadlines, and defense status across merchants.">
          <ChargebacksSection from="disputes" />
        </PanelSection>
      </Panel>
    </PageShell>
  )
}
