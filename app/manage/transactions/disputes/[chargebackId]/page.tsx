'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { PageHeader, PageShell, Panel, PanelSection } from '@/components/dashboard/shell'
import { Badge } from '@/components/ui/badge'
import { usePlatformChargeback } from '@/lib/queries/use-platform-analytics'
import { transactionsTabHref } from '../../routes'
import {
    DetailList,
    DetailPageSkeleton,
    DetailRow,
    DetailUnavailable,
} from '../../components/detail-primitives'
import {
    ChargebackDetail,
    formatCurrency,
    formatDate,
    formatDateTime,
    formatNetwork,
    formatStatusLabel,
    renderDeadline,
} from '../../components/ChargebacksSection'

// ─── Export (wrapped in Suspense for useSearchParams) ───────────────────────

export default function ChargebackDetailPage() {
    return (
        <Suspense fallback={<DetailPageSkeleton />}>
            <ChargebackDetailPageInner />
        </Suspense>
    )
}

function ChargebackDetailPageInner() {
    const params = useParams<{ chargebackId: string }>()
    const searchParams = useSearchParams()
    const chargebackId = params?.chargebackId ?? ''
    const query = usePlatformChargeback(chargebackId)

    // Opened from /manage/disputes → back there; otherwise the transactions tab.
    const fromDisputes = searchParams.get('from') === 'disputes'
    const backHref = fromDisputes ? '/manage/disputes' : transactionsTabHref('disputes')
    const backLabel = fromDisputes ? 'Back to disputes' : 'Back to chargebacks'

    if (query.isLoading) return <DetailPageSkeleton />

    const row = query.data?.data ?? null
    const errorCode = query.data?.errorCode

    if (!row) {
        const failed = query.isError || !!errorCode
        return (
            <DetailUnavailable
                title="Chargeback unavailable"
                heading={failed ? "We couldn't load this chargeback" : "We couldn't find this chargeback"}
                detail={
                    errorCode
                        ? `Check table access and schema. Error ${errorCode}`
                        : query.isError
                            ? (query.error as Error).message
                            : 'It may have been removed, or it belongs to a merchant outside your access.'
                }
                backHref={backHref}
                backLabel={backLabel}
                onRetry={failed ? () => void query.refetch() : undefined}
            />
        )
    }

    return (
        <PageShell as="div">
            <PageHeader
                title={`Chargeback ${formatCurrency(row.amount)}`}
                titleBadge={<Badge variant="outline" className="max-sm:hidden">{formatStatusLabel(row.status)}</Badge>}
                subtitle={[row.merchant_name || row.merchant_id, `Received ${formatDate(row.received_at)}`].join(' · ')}
                backHref={backHref}
                backLabel={backLabel}
            />

            <Panel nested>
                <PanelSection
                    label="Dispute"
                    caption="What the cardholder disputed and when the defense is due."
                >
                    <div className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2">
                        <DetailList>
                            <DetailRow
                                label="Merchant"
                                value={
                                    <Link
                                        href={`/manage/merchants/${row.merchant_id}`}
                                        className="underline-offset-2 hover:underline"
                                    >
                                        {row.merchant_name || row.merchant_id}
                                    </Link>
                                }
                            />
                            <DetailRow label="Amount" value={formatCurrency(row.amount)} />
                            <DetailRow label="Reason code" value={row.reason_code} mono />
                            <DetailRow label="Reason" value={row.reason_description} wrap />
                            <DetailRow label="Network" value={formatNetwork(row.card_network)} />
                        </DetailList>
                        <DetailList>
                            <DetailRow label="Status" value={formatStatusLabel(row.status)} />
                            <DetailRow label="Defendable" value={row.defendable ? 'Yes' : 'No'} />
                            <DetailRow label="Defense deadline" value={renderDeadline(row.defense_deadline, row.status)} />
                            <DetailRow label="Received" value={formatDateTime(row.received_at)} />
                            <DetailRow label="Payment ID" value={row.original_payment_id} mono />
                        </DetailList>
                    </div>
                </PanelSection>
            </Panel>

            <Panel>
                <PanelSection label="Payment, defense and resolution">
                    <ChargebackDetail row={row} />
                </PanelSection>
            </Panel>
        </PageShell>
    )
}
