'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PageHeader, PageShell, Panel, PanelSection, PanelSubLabel } from '@/components/dashboard/shell'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformPayment, usePlatformTransactionDetails } from '@/lib/queries/use-platform-analytics'
import { settlementBatchDetailHref, TRANSACTIONS_LEDGER_HREF } from '../../routes'
import {
    DetailList,
    DetailPageSkeleton,
    DetailRow,
    DetailUnavailable,
    Fact,
    FactGrid,
} from '../../components/detail-primitives'
import {
    batchLabel,
    buildPaymentActivity,
    capitalise,
    entryModeLabel,
    formatDateTime,
    formatMoney,
    isCardPayment,
    methodLabel,
    netFeeLabel,
    tsysMatchLabel,
} from '../../components/payment-format'
import {
    PaymentActivitySection,
    PaymentOrderSection,
    PaymentTerminalSection,
} from '../../components/PaymentDetailSections'


/** A deduction, such as a refunded fee: "−$0.01". */
function minus(amount: number) {
    return `−${formatMoney(Math.abs(amount))}`
}

/** " (4%)" when the fee's rate was captured with the payment. */
function rateSuffix(pct?: number) {
    return pct && pct > 0 ? ` (${pct}%)` : ''
}

/*
 * Layout: every panel is full width and splits into columns inside it. Two
 * panels side by side never line up in height for real records (a refund has
 * one more activity entry, a split order has more parts), and the shorter one
 * left a block of empty page under it.
 *
 * This is also the transaction detail page: every All transactions row is an
 * `order_payments` row.
 */
export default function PaymentDetailPage() {
    const params = useParams<{ paymentId: string }>()
    const paymentId = params?.paymentId ?? ''
    const backHref = TRANSACTIONS_LEDGER_HREF
    const backLabel = 'Back to transactions'
    const query = usePlatformPayment(paymentId)
    const payment = query.data?.success ? query.data.data : null

    // The full order and processor record: items, card data, reversals and
    // processor responses. Fetched only once the payment resolves, because
    // fetching it logs a payment-detail access.
    const detailQuery = usePlatformTransactionDetails(payment?.id ?? null, !!payment)
    const detail = detailQuery.data ?? null
    const detailLoading = detailQuery.isPending
    const retryDetail = () => void detailQuery.refetch()

    if (query.isLoading) return <DetailPageSkeleton withStats />

    const failure = query.isError
        ? (query.error as Error).message
        : query.data && !query.data.success
            ? query.data.error
            : null

    if (!payment) {
        return (
            <DetailUnavailable
                title="Payment unavailable"
                heading={failure ? "We couldn't load this payment" : "We couldn't find this payment"}
                detail={failure ?? 'It may have been removed, or it belongs to a merchant outside your access.'}
                backHref={backHref}
                backLabel={backLabel}
                onRetry={failure ? () => void query.refetch() : undefined}
            />
        )
    }

    const batch = batchLabel(payment)
    // Cash and other non-card payments have no processor, fees, terminal or settlement.
    const isCard = isCardPayment(payment)
    // While the record loads, facts that come only from it show a placeholder.
    const fromDetail = (value: React.ReactNode) => (detailLoading ? <Skeleton className="h-4 w-24" /> : value)
    const refunded = Math.max(Number(detail?.refunded_amount ?? 0), Number(detail?.return_amount ?? 0))
    const showTipFee = payment.tip_fee > 0 || payment.refunded_tip_fee > 0
    const activity = buildPaymentActivity(
        detail
            ? { ...detail, settled_at: payment.settled_at }
            : { initiated_at: payment.initiated_at, captured_at: payment.captured_at ?? undefined, settled_at: payment.settled_at }
    )

    return (
        <PageShell as="div">
            <PageHeader
                title={formatMoney(payment.total_amount)}
                titleBadge={<Badge variant="outline">{capitalise(payment.status)}</Badge>}
                backHref={backHref}
                backLabel={backLabel}
            />

            {/* Who, where, when and how: the facts the header subtitle used to
                carry, now visible on phones too and with room for each. */}
            <Panel padded>
                <FactGrid className={isCard ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}>
                    <Fact
                        label="Merchant"
                        value={
                            payment.merchant_name ? (
                                <Link href={`/manage/merchants/${payment.merchant_id}`} className="underline-offset-2 hover:underline">
                                    {payment.merchant_name}
                                </Link>
                            ) : null
                        }
                    />
                    <Fact label="Location" value={payment.location_name} />
                    <Fact label="Date" value={formatDateTime(payment.captured_at ?? payment.initiated_at)} />
                    <Fact label="Order" value={payment.order_number ?? detail?.display_number} mono copyable />
                    <Fact label="Method" value={methodLabel(payment)} />
                    {isCard && <Fact label="Entry" value={fromDetail(entryModeLabel(detail?.card_entry_mode))} />}
                </FactGrid>
            </Panel>

            {!isCard ? (
                <Panel>
                    <PanelSection label="Payment" caption="What was charged. Cash has no processor, fees or settlement.">
                        <FactGrid className="lg:grid-cols-4">
                            <Fact label="Amount" value={formatMoney(payment.amount)} />
                            <Fact label="Tip" value={formatMoney(payment.tip_amount)} />
                            <Fact label="Charged" value={formatMoney(payment.total_amount)} />
                            {refunded > 0 && <Fact label="Refunded" value={minus(refunded)} />}
                        </FactGrid>
                    </PanelSection>
                </Panel>
            ) : (
                <Panel>
                    <PanelSection label="Payment" caption="The processor's references, what was charged, what it cost the merchant, and its settlement.">
                        <FactGrid>
                            <Fact label="Auth code" value={payment.authorization_code} mono copyable />
                            <Fact
                                label="Transaction ID"
                                value={fromDetail(detail?.transaction_id)}
                                mono
                                copyable
                                className="col-span-2 sm:col-span-1"
                            />
                            <Fact
                                label="Reference #"
                                value={fromDetail(detail?.reference_number)}
                                mono
                                copyable
                                className="col-span-2 sm:col-span-1"
                            />
                        </FactGrid>
    
                        <div className="mt-8 grid min-w-0 grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="min-w-0">
                                <PanelSubLabel>Amounts</PanelSubLabel>
                                <DetailList>
                                    <DetailRow label="Amount" value={formatMoney(payment.amount)} />
                                    <DetailRow label="Tip" value={formatMoney(payment.tip_amount)} />
                                    <DetailRow label="Charged" value={formatMoney(payment.total_amount)} emphasis />
                                    {refunded > 0 && <DetailRow label="Refunded" value={minus(refunded)} />}
                                </DetailList>
                            </div>
    
                            <div className="min-w-0">
                                <PanelSubLabel>Fees</PanelSubLabel>
                                <DetailList>
                                    {detail?.subtotal_portion !== undefined && (
                                        <DetailRow
                                            label="Fee basis"
                                            value={`${formatMoney(Number(detail.subtotal_portion))} + ${formatMoney(Number(detail.tax_portion ?? 0))} tax`}
                                        />
                                    )}
                                    <DetailRow
                                        label={`Dual pricing${rateSuffix(detail?.dual_pricing_percentage_snapshot)}`}
                                        value={formatMoney(payment.dual_pricing_fee)}
                                    />
                                    {payment.refunded_dual_pricing_fee > 0 && (
                                        <DetailRow label="Dual pricing refunded" value={minus(payment.refunded_dual_pricing_fee)} />
                                    )}
                                    {showTipFee && (
                                        <DetailRow
                                            label={`Tip fee${rateSuffix(detail?.tip_surcharge_percentage_snapshot)}`}
                                            value={formatMoney(payment.tip_fee)}
                                        />
                                    )}
                                    {payment.refunded_tip_fee > 0 && (
                                        <DetailRow label="Tip fee refunded" value={minus(payment.refunded_tip_fee)} />
                                    )}
                                    <DetailRow label="Net fee" value={netFeeLabel(payment)} />
                                    <DetailRow label="Net deposit" value={formatMoney(payment.net_deposit)} emphasis />
                                </DetailList>
                            </div>
    
                            <div className="min-w-0">
                                <PanelSubLabel>Settlement</PanelSubLabel>
                                <DetailList>
                                    <DetailRow label="Status" value={payment.is_settled ? 'Settled' : 'Awaiting settlement'} />
                                    {payment.settled_at && <DetailRow label="Settled" value={formatDateTime(payment.settled_at)} />}
                                    <DetailRow
                                        label="Batch"
                                        mono
                                        value={
                                            batch && payment.settlement_batch_id ? (
                                                <Link
                                                    href={settlementBatchDetailHref(payment.settlement_batch_id)}
                                                    className="underline-offset-2 hover:underline"
                                                >
                                                    {batch}
                                                </Link>
                                            ) : (
                                                batch
                                            )
                                        }
                                    />
                                    <DetailRow label="TSYS match" value={tsysMatchLabel(payment)} />
                                    <DetailRow label="TSYS MID" value={payment.luqra_mid} mono />
                                </DetailList>
                            </div>
                        </div>
                    </PanelSection>
                </Panel>
            )}

            <Panel>
                <PaymentActivitySection entries={activity} isLoading={detailLoading} />
            </Panel>

            <Panel>
                <PaymentOrderSection paymentId={payment.id} detail={detail} isLoading={detailLoading} onRetry={retryDetail} />
            </Panel>

            {isCard && (
                <Panel>
                    <PaymentTerminalSection detail={detail} isLoading={detailLoading} onRetry={retryDetail} />
                </Panel>
            )}
        </PageShell>
    )
}
