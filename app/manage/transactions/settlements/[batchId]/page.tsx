'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
    PageHeader,
    PageShell,
    Panel,
    PanelSection,
    PanelSubLabel,
    StatRow,
    StatTile,
} from '@/components/dashboard/shell'
import { Badge } from '@/components/ui/badge'
import { usePlatformSettlementBatch } from '@/lib/queries/use-platform-analytics'
import { transactionsTabHref } from '../../routes'
import {
    DetailList,
    DetailPageSkeleton,
    DetailRow,
    DetailUnavailable,
} from '../../components/detail-primitives'
import {
    batchErrorDetail,
    batchErrorTitle,
    DiscrepancyValue,
    formatBatchLabel,
    formatCurrency,
    formatDateOnly,
    formatDateTime,
    formatLabel,
    getOriginLabel,
    SettlementBatchPanel,
    batchTerminalHref,
    batchTerminalLabel,
} from '../../components/SettlementBatchPanel'

const BACK_HREF = transactionsTabHref('settlements')
const BACK_LABEL = 'Back to settlements'

export default function SettlementBatchDetailPage() {
    const params = useParams<{ batchId: string }>()
    const batchId = params?.batchId ?? ''
    const query = usePlatformSettlementBatch(batchId)

    if (query.isLoading) return <DetailPageSkeleton withStats />

    const batch = query.data?.data ?? null
    const errorCode = query.data?.errorCode

    if (!batch) {
        const failed = query.isError || !!errorCode
        return (
            <DetailUnavailable
                title="Batch unavailable"
                heading={
                    errorCode
                        ? batchErrorTitle(errorCode)
                        : failed
                            ? "We couldn't load this batch"
                            : "We couldn't find this batch"
                }
                detail={
                    errorCode
                        ? batchErrorDetail(errorCode)
                        : query.isError
                            ? (query.error as Error).message
                            : 'It may have been removed, or it belongs to a merchant outside your access.'
                }
                backHref={BACK_HREF}
                backLabel={BACK_LABEL}
                onRetry={failed ? () => void query.refetch() : undefined}
            />
        )
    }

    const originLabel = getOriginLabel(batch.origin)
    const terminalLookupFailed = !!query.data?.terminalLookupFailed
    const terminalHref = batchTerminalHref(batch)

    return (
        <PageShell as="div">
            <PageHeader
                title={`Batch ${formatBatchLabel(batch)}`}
                titleBadge={<Badge variant="outline" className="max-sm:hidden">{formatLabel(batch.status)}</Badge>}
                subtitle={[batch.merchant_name, batch.location_name, formatDateOnly(batch.business_date)]
                    .filter(Boolean)
                    .join(' · ')}
                backHref={BACK_HREF}
                backLabel={BACK_LABEL}
            />

            <Panel padded>
                <StatRow columns={4}>
                    <StatTile label="Gross" value={formatCurrency(batch.gross_amount)} meta="Submitted for settlement" />
                    <StatTile label="Batch net" value={formatCurrency(batch.net_deposit)} meta="After refunds and fees; not a bank deposit" />
                    <StatTile
                        label="Transactions"
                        value={batch.transaction_count.toLocaleString()}
                        meta={`${batch.linked_payment_count.toLocaleString()} linked in the POS`}
                    />
                    <StatTile
                        label="Discrepancy"
                        value={<DiscrepancyValue batch={batch} />}
                        meta={`Linked ${formatCurrency(batch.linked_payment_amount)} of ${formatCurrency(batch.gross_amount)}`}
                        showMetaOnMobile={batch.has_discrepancy}
                    />
                </StatRow>
            </Panel>

            <Panel nested>
                <PanelSection label="Batch" caption="Who it belongs to, when it ran, and what it contains.">
                    <div className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2">
                        <div className="min-w-0">
                            <PanelSubLabel>Ownership and timing</PanelSubLabel>
                            <DetailList>
                                <DetailRow
                                    label="Merchant"
                                    value={
                                        <Link
                                            href={`/manage/merchants/${batch.merchant_id}`}
                                            className="underline-offset-2 hover:underline"
                                        >
                                            {batch.merchant_name}
                                        </Link>
                                    }
                                />
                                <DetailRow label="Location" value={batch.location_name} />
                                <DetailRow
                                    label="Linked terminal"
                                    value={
                                        terminalHref ? (
                                            <Link href={terminalHref} className="underline-offset-2 hover:underline">
                                                {batchTerminalLabel(batch, terminalLookupFailed)} · Serial {batch.terminal_serial}
                                            </Link>
                                        ) : (
                                            batchTerminalLabel(batch, terminalLookupFailed)
                                        )
                                    }
                                />
                                <DetailRow label="Status" value={formatLabel(batch.status)} />
                                <DetailRow label="Business date" value={formatDateOnly(batch.business_date)} />
                                <DetailRow label="Opened" value={batch.opened_at ? formatDateTime(batch.opened_at) : null} />
                                <DetailRow label="Closed" value={batch.closed_at ? formatDateTime(batch.closed_at) : null} />
                                <DetailRow label="Settlement date" value={batch.settlement_date ? formatDateOnly(batch.settlement_date) : null} />
                                <DetailRow label="Funded date" value={batch.funded_date ? formatDateOnly(batch.funded_date) : null} />
                                <DetailRow label="Origin" value={originLabel} />
                                <DetailRow label="Batch record" value={batch.batch_id} mono />
                            </DetailList>
                        </div>

                        <div className="min-w-0">
                            <PanelSubLabel>Contents</PanelSubLabel>
                            <DetailList>
                                <DetailRow label="Sales" value={batch.sales_count.toLocaleString()} />
                                <DetailRow label="Refunds" value={batch.refund_count.toLocaleString()} />
                                <DetailRow label="Voids" value={batch.void_count.toLocaleString()} />
                                <DetailRow label="Tip" value={formatCurrency(batch.tip_amount)} />
                                <DetailRow label="Refund amount" value={formatCurrency(batch.refund_amount)} />
                                <DetailRow label="Linked payments" value={batch.linked_payment_count.toLocaleString()} />
                                <DetailRow label="Linked amount" value={formatCurrency(batch.linked_payment_amount)} />
                            </DetailList>
                        </div>
                    </div>
                </PanelSection>
            </Panel>

            <Panel>
                <PanelSection
                    label="Linked payments"
                    caption="POS payments reconciled into this batch. Open one for its full record."
                >
                    <SettlementBatchPanel
                        batch={batch}
                        showSummary={false}
                        terminalLookupFailed={terminalLookupFailed}
                        onBatchChanged={() => query.refetch()}
                    />
                </PanelSection>
            </Panel>
        </PageShell>
    )
}
