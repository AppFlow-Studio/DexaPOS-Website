'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banknote, TrendingUp, AlertTriangle, Layers, CreditCard } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlatformSettlementBatches } from '@/lib/queries/use-platform-analytics'
import { BatchReconciliationSection } from '@/app/manage/transactions/components/BatchReconciliationSection'
import { GetAdminBatchPayments } from '@/app/manage/actions/admin-merchant/batch-payments'
import { PaymentsTable } from '@/app/dashboard/payments/components/PaymentsTable'
import { Empty } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { useMerchantLocationMids } from '@/lib/queries/use-luqra'
import { SectionHead } from './SectionHead'
import { KpiStrip, type KpiCell } from './KpiStrip'
import { LuqraTransactionsTable } from './LuqraTransactionsTable'
import { LuqraDepositsTable } from './LuqraDepositsTable'
import { LuqraBatchesTable } from './LuqraBatchesTable'
import { MerchantPaymentsTab } from './PaymentsTable'

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
            <Empty
                icon={CreditCard}
                title="No card payments"
                description="No payments are linked to this batch in the order_payments ledger."
            />
        )
    }

    return <PaymentsTable data={payments} />
}

export function SettlementsSection({ merchantId }: { merchantId: string }) {
    const summaryFilters = useMemo(
        () => ({ merchantIds: [merchantId], limit: 250 }),
        [merchantId]
    )
    const { data: result, isLoading } = usePlatformSettlementBatches(summaryFilters)
    const batches = result?.data ?? []

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

    const cells: KpiCell[] = [
        {
            icon: Layers,
            label: 'Batches',
            value: totals.count.toLocaleString(),
            meta: `${totals.txns.toLocaleString()} transactions`,
        },
        {
            icon: Banknote,
            label: 'Gross processed',
            value: formatCurrency(totals.gross),
            meta: 'Across visible batches',
        },
        {
            icon: TrendingUp,
            label: 'Net deposit',
            value: formatCurrency(totals.net),
            meta: 'Funded to bank',
        },
        {
            icon: AlertTriangle,
            label: 'Discrepancies',
            value: totals.discrepancies.toLocaleString(),
            meta: totals.discrepancies > 0 ? 'Review flagged batches' : 'All matched',
            tone: totals.discrepancies > 0 ? 'warn' : 'good',
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
        <div className="space-y-5">
            <SectionHead
                title="TSYS Settlements"
                sub="Acquiring batches from TSYS alongside our local reconciliation."
            />

            <KpiStrip cells={cells} loading={isLoading} />

            <Tabs defaultValue="ours">
                <TabsList>
                    <TabsTrigger value="ours">Our batches</TabsTrigger>
                    <TabsTrigger value="payments">Payments</TabsTrigger>
                    <TabsTrigger value="luqra">TSYS transactions</TabsTrigger>
                    <TabsTrigger value="batches">TSYS batches</TabsTrigger>
                    <TabsTrigger value="deposits">Deposits</TabsTrigger>
                </TabsList>

                <TabsContent value="ours" className="pt-4">
                    <BatchReconciliationSection
                        scopedMerchantId={merchantId}
                        renderBatchPayments={(batch) => (
                            <BatchCardPayments merchantId={merchantId} batchId={batch.id} />
                        )}
                    />
                </TabsContent>

                <TabsContent value="payments" className="pt-4">
                    <MerchantPaymentsTab merchantId={merchantId} locations={allLocations} />
                </TabsContent>

                <TabsContent value="luqra" className="pt-4">
                    {locations.length === 0 ? (
                        <Empty
                            icon={CreditCard}
                            title="No MIDs assigned yet"
                            description="Assign a TSYS MID to at least one location from the MIDs section to pull live transactions."
                        />
                    ) : (
                        <LuqraTransactionsTable merchantId={merchantId} locations={locations} />
                    )}
                </TabsContent>

                <TabsContent value="batches" className="pt-4">
                    {locations.length === 0 ? (
                        <Empty
                            icon={CreditCard}
                            title="No MIDs assigned yet"
                            description="Assign a Luqra MID to a location and run Sync to pull batches."
                        />
                    ) : (
                        <LuqraBatchesTable merchantId={merchantId} locations={locations} />
                    )}
                </TabsContent>

                <TabsContent value="deposits" className="pt-4">
                    {locations.length === 0 ? (
                        <Empty
                            icon={CreditCard}
                            title="No MIDs assigned yet"
                            description="Assign a Luqra MID to a location and run Sync to pull deposits."
                        />
                    ) : (
                        <LuqraDepositsTable merchantId={merchantId} locations={locations} />
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
