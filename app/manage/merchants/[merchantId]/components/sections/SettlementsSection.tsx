'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banknote, TrendingUp, AlertTriangle, Layers, CreditCard } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Panel, PanelSection } from '@/components/dashboard/shell'
import { usePlatformSettlementBatches } from '@/lib/queries/use-platform-analytics'
import { BatchReconciliationSection } from '@/app/manage/transactions/components/BatchReconciliationSection'
import { GetAdminBatchPayments } from '@/app/manage/actions/admin-merchant/batch-payments'
import { PaymentsTable } from '@/app/dashboard/payments/components/PaymentsTable'
import { Skeleton } from '@/components/ui/skeleton'
import { useMerchantLocationMids } from '@/lib/queries/use-luqra'
import { KpiStrip, type KpiCell } from './KpiStrip'
import { EmptySection } from './EmptySection'
import { LuqraTransactionsTable } from './LuqraTransactionsTable'
import { LuqraDepositsTable } from './LuqraDepositsTable'
import { LuqraBatchesTable } from './LuqraBatchesTable'
import { MerchantPaymentsTab } from './PaymentsTable'

// §4.5 pill rail — the TAB_* literals from shell/tokens.ts, spelled out here (C7).
const TAB_PILL_CLASS =
    'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border'

function formatCurrency(amount: number): string {
    return amount.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
    })
}

function BatchCardPayments({ merchantId, batchId }: { merchantId: string; batchId: string }) {
    const { data, isLoading } = useQuery({
        queryKey: ['admin-batch-payments', merchantId, batchId],
        queryFn: () => GetAdminBatchPayments(merchantId, batchId),
        enabled: !!merchantId && !!batchId,
        staleTime: 30_000,
    })

    if (isLoading) {
        return (
            <div className="space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
            </div>
        )
    }

    const payments = data ?? []
    if (!payments.length) {
        return (
            <EmptySection
                icon={CreditCard}
                title="No card payments in this batch"
                body="No payments are linked to this batch in the order_payments ledger."
            />
        )
    }

    return <PaymentsTable data={payments} />
}

function NoMids({ body }: { body: string }) {
    return <EmptySection icon={CreditCard} title="No MIDs assigned yet" body={body} />
}

export function SettlementsSection({ merchantId }: { merchantId: string }) {
    const summaryFilters = useMemo(
        () => ({ merchantIds: [merchantId], limit: 250 }),
        [merchantId]
    )
    const { data: result, isLoading } = usePlatformSettlementBatches(summaryFilters)
    const batches = useMemo(() => result?.data ?? [], [result])

    const totals = useMemo(() => {
        const acc = { count: batches.length, gross: 0, net: 0, txns: 0, discrepancies: 0 }
        for (const b of batches) {
            acc.gross += b.gross_amount ?? 0
            acc.net += b.net_deposit ?? 0
            acc.txns += b.transaction_count ?? 0
            if (b.has_discrepancy) acc.discrepancies += 1
        }
        return acc
    }, [batches])

    // Unknown is not zero (§4.9): without a result the figures read "—".
    const known = !!result
    const cells: KpiCell[] = [
        {
            icon: Layers,
            label: 'Batches',
            value: known ? totals.count.toLocaleString() : '—',
            meta: known ? `${totals.txns.toLocaleString()} transactions` : undefined,
        },
        {
            icon: Banknote,
            label: 'Gross processed',
            value: known ? formatCurrency(totals.gross) : '—',
            meta: 'Across visible batches',
        },
        {
            icon: TrendingUp,
            label: 'Net deposit',
            value: known ? formatCurrency(totals.net) : '—',
            meta: 'Funded to bank',
        },
        {
            icon: AlertTriangle,
            label: 'Discrepancies',
            value: known ? totals.discrepancies.toLocaleString() : '—',
            meta: known
                ? totals.discrepancies > 0
                    ? 'Review flagged batches'
                    : 'All matched'
                : undefined,
        },
    ]

    const { data: midsResult } = useMerchantLocationMids(merchantId)
    const locations = useMemo(() => {
        const rows = midsResult?.success ? midsResult.data : []
        return rows
            .filter((r) => !!r.luqra_mid)
            .map((r) => ({ id: r.id, name: r.name }))
    }, [midsResult])
    const allLocations = useMemo(() => {
        const rows = midsResult?.success ? midsResult.data : []
        return rows.map((r) => ({ id: r.id, name: r.name }))
    }, [midsResult])

    return (
        <div className="space-y-6">
            <Panel>
                <PanelSection
                    label="TSYS Settlements"
                    caption="Acquiring batches from TSYS alongside our local reconciliation."
                >
                    <KpiStrip cells={cells} loading={isLoading} />
                </PanelSection>
            </Panel>

            <Tabs defaultValue="ours" className="gap-0">
                <div className="w-full min-w-0 overflow-x-auto pb-1">
                    <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                        <TabsTrigger value="ours" className={TAB_PILL_CLASS}>Our batches</TabsTrigger>
                        <TabsTrigger value="payments" className={TAB_PILL_CLASS}>Payments</TabsTrigger>
                        <TabsTrigger value="luqra" className={TAB_PILL_CLASS}>TSYS transactions</TabsTrigger>
                        <TabsTrigger value="batches" className={TAB_PILL_CLASS}>TSYS batches</TabsTrigger>
                        <TabsTrigger value="deposits" className={TAB_PILL_CLASS}>Deposits</TabsTrigger>
                    </TabsList>
                </div>

                {/* BatchReconciliationSection brings its own container, so it sits
                    on the canvas rather than inside a Panel (no box in a box). */}
                <TabsContent value="ours" className="mt-4">
                    <BatchReconciliationSection
                        scopedMerchantId={merchantId}
                        renderBatchPayments={(batch) => (
                            <BatchCardPayments merchantId={merchantId} batchId={batch.id} />
                        )}
                    />
                </TabsContent>

                <TabsContent value="payments" className="mt-4">
                    <Panel>
                        <PanelSection
                            label="Payments"
                            caption="Card payments recorded against this merchant's orders."
                        >
                            <MerchantPaymentsTab merchantId={merchantId} locations={allLocations} />
                        </PanelSection>
                    </Panel>
                </TabsContent>

                <TabsContent value="luqra" className="mt-4">
                    <Panel>
                        <PanelSection
                            label="TSYS transactions"
                            caption="Transactions cached locally from Luqra."
                        >
                            {locations.length === 0 ? (
                                <NoMids body="Assign a TSYS MID to at least one location from the MIDs section to pull live transactions." />
                            ) : (
                                <LuqraTransactionsTable merchantId={merchantId} locations={locations} />
                            )}
                        </PanelSection>
                    </Panel>
                </TabsContent>

                <TabsContent value="batches" className="mt-4">
                    <Panel>
                        <PanelSection
                            label="TSYS batches"
                            caption="Settlement batches cached from Luqra. Open a batch to see its transactions."
                        >
                            {locations.length === 0 ? (
                                <NoMids body="Assign a Luqra MID to a location and run Sync to pull batches." />
                            ) : (
                                <LuqraBatchesTable merchantId={merchantId} locations={locations} />
                            )}
                        </PanelSection>
                    </Panel>
                </TabsContent>

                <TabsContent value="deposits" className="mt-4">
                    <Panel>
                        <PanelSection
                            label="Deposits"
                            caption="Bank deposits cached from Luqra. Open a deposit to see its transactions."
                        >
                            {locations.length === 0 ? (
                                <NoMids body="Assign a Luqra MID to a location and run Sync to pull deposits." />
                            ) : (
                                <LuqraDepositsTable merchantId={merchantId} locations={locations} />
                            )}
                        </PanelSection>
                    </Panel>
                </TabsContent>
            </Tabs>
        </div>
    )
}
