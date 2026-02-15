'use client'

import { Suspense, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    CreditCard,
    Download,
    RefreshCcwDot,
    ArrowUpDown,
    MoreHorizontal,
    CheckCircle,
    Clock,
    DollarSign,
    ChevronLeft,
    ChevronRight,
    Banknote,
} from 'lucide-react'
import { usePlatformKPIs, usePlatformTransactions } from '@/lib/queries/use-platform-analytics'
import {
    getPlatformTransactions,
    PlatformTransaction,
    PlatformTransactionFilters,
    refundPlatformTransaction,
} from '@/app/manage/actions/hq-platform/transactions'
import { format } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { TransactionFilterSheet } from './components/TransactionFilterSheet'
import { TransactionSearchBar, highlightText } from './components/TransactionSearchBar'
import { TransactionDetailSheet } from './components/TransactionDetailSheet'
import { CardBrandIcon } from '@/app/dashboard/payments/components/CardBrandIcon'
import { toast } from 'sonner'

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getOrderStatusBadge(status?: string) {
    if (!status) return null
    const configs: Record<string, { label: string; className: string }> = {
        draft:      { label: 'Draft',      className: 'bg-gray-100 text-gray-600 border-gray-300' },
        pending:    { label: 'Pending',    className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
        preparing:  { label: 'Preparing',  className: 'bg-blue-100 text-blue-800 border-blue-300' },
        ready:      { label: 'Ready',      className: 'bg-purple-100 text-purple-800 border-purple-300' },
        completed:  { label: 'Completed',  className: 'bg-green-100 text-green-800 border-green-300' },
        cancelled:  { label: 'Cancelled',  className: 'bg-red-100 text-red-800 border-red-300' },
        refunded:   { label: 'Refunded',   className: 'bg-amber-100 text-amber-800 border-amber-300' },
        void:       { label: 'Void',       className: 'bg-gray-100 text-gray-500 border-gray-300' },
    }
    const cfg = configs[status] ?? { label: status, className: '' }
    return (
        <Badge variant="outline" className={`capitalize text-xs ${cfg.className}`}>
            {cfg.label}
        </Badge>
    )
}

function getPaymentStatusBadge(status: string) {
    const configs: Record<string, { label: string; className: string }> = {
        captured:           { label: 'Captured',      className: 'bg-green-100 text-green-800 border-green-300' },
        authorized:         { label: 'Authorized',    className: 'bg-blue-100 text-blue-800 border-blue-300' },
        refunded:           { label: 'Refunded',      className: 'bg-amber-100 text-amber-800 border-amber-300' },
        partially_refunded: { label: 'Part. Refund',  className: 'bg-amber-100 text-amber-800 border-amber-300' },
        declined:           { label: 'Declined',      className: 'bg-red-100 text-red-800 border-red-300' },
        void:               { label: 'Void',          className: 'bg-gray-100 text-gray-500 border-gray-300' },
    }
    const cfg = configs[status] ?? { label: status, className: '' }
    return (
        <Badge variant="outline" className={`capitalize text-xs ${cfg.className}`}>
            {cfg.label}
        </Badge>
    )
}

function getMethodBadge(method: string) {
    const isCard = method === 'card' || method.startsWith('card_')
    return (
        <Badge variant="outline" className="gap-1 text-xs">
            {isCard ? <CreditCard className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
            {isCard ? 'Card' : method === 'cash' ? 'Cash' : method}
        </Badge>
    )
}

function exportToCSV(transactions: PlatformTransaction[]) {
    const headers = ['Payment ID', 'Order #', 'Merchant', 'Location', 'Customer', 'Method', 'Card', 'Amount', 'Tip', 'Total', 'Payment Status', 'Order Status', 'Auth Code', 'Ref #', 'Date']
    const rows = transactions.map(t => [
        t.id,
        t.order_number || '',
        t.merchant_name,
        t.location_name || '',
        t.customer_name || 'Anonymous',
        t.payment_method,
        t.card_last_four ? `****${t.card_last_four}` : '',
        `$${t.amount.toFixed(2)}`,
        t.tip_amount ? `$${t.tip_amount.toFixed(2)}` : '',
        `$${t.total_amount.toFixed(2)}`,
        t.status,
        t.order_status || '',
        t.authorization_code || '',
        t.reference_number || '',
        t.created_at ? format(new Date(t.created_at), 'yyyy-MM-dd HH:mm:ss') : '',
    ])

    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
}

// â”€â”€â”€ URL param parser helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function parseList(val: string | null): string[] {
    if (!val) return []
    return val.split(',').filter(Boolean)
}

type TableSortKey = 'order' | 'date'
type TableSortDirection = 'asc' | 'desc'

// â”€â”€â”€ Inner page (needs useSearchParams) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TransactionsPageInner() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const pageSize = 50
    const [isExporting, startExportTransition] = useTransition()
    const [isRefreshing, startRefreshTransition] = useTransition()
    const [isRefunding, startRefundTransition] = useTransition()
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
    const [refundTarget, setRefundTarget] = useState<PlatformTransaction | null>(null)
    const [sortKey, setSortKey] = useState<TableSortKey>('date')
    const [sortDirection, setSortDirection] = useState<TableSortDirection>('desc')

    // Parse page from URL
    const page = Number(searchParams.get('page') ?? '1')

    // Parse all filter params from URL
    const filters: PlatformTransactionFilters = useMemo(() => ({
        search: searchParams.get('search') ?? undefined,
        merchantIds: parseList(searchParams.get('merchants')).length > 0 ? parseList(searchParams.get('merchants')) : undefined,
        locationIds: parseList(searchParams.get('locations')).length > 0 ? parseList(searchParams.get('locations')) : undefined,
        orderStatuses: parseList(searchParams.get('orderStatus')).length > 0 ? parseList(searchParams.get('orderStatus')) : undefined,
        paymentStatuses: parseList(searchParams.get('paymentStatus')).length > 0 ? parseList(searchParams.get('paymentStatus')) : undefined,
        paymentMethods: parseList(searchParams.get('method')).length > 0 ? parseList(searchParams.get('method')) : undefined,
        cardTypes: parseList(searchParams.get('cardType')).length > 0 ? parseList(searchParams.get('cardType')) : undefined,
        minAmount: searchParams.get('minAmount') ? Number(searchParams.get('minAmount')) : undefined,
        maxAmount: searchParams.get('maxAmount') ? Number(searchParams.get('maxAmount')) : undefined,
        dateFrom: searchParams.get('dateFrom') ? `${searchParams.get('dateFrom')}T00:00:00` : undefined,
        dateTo: searchParams.get('dateTo') ? `${searchParams.get('dateTo')}T23:59:59` : undefined,
    }), [searchParams])

    // Search state â€” local, communicated via URL
    const [searchValue, setSearchValue] = useState(searchParams.get('search') ?? '')

    const { data: kpis, isLoading: kpisLoading, refetch: refetchKPIs } = usePlatformKPIs()
    const {
        data: transactionsData,
        isLoading: transactionsLoading,
        error: transactionsError,
        refetch: refetchTransactions,
    } = usePlatformTransactions(pageSize, (page - 1) * pageSize, filters)

    const transactions = transactionsData?.data || []
    const totalTransactions = transactionsData?.total || 0
    const totalPages = Math.max(1, Math.ceil(totalTransactions / pageSize))

    const sortedTransactions = useMemo(() => {
        const sorted = [...transactions]
        sorted.sort((a, b) => {
            let comparison = 0
            if (sortKey === 'order') {
                const left = a.order_number || ''
                const right = b.order_number || ''
                comparison = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
            } else {
                const left = a.created_at ? new Date(a.created_at).getTime() : 0
                const right = b.created_at ? new Date(b.created_at).getTime() : 0
                comparison = left - right
            }
            return sortDirection === 'asc' ? comparison : -comparison
        })
        return sorted
    }, [transactions, sortKey, sortDirection])

    const setPage = (p: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', String(p))
        router.push(`?${params.toString()}`)
    }

    const handleSearchChange = (val: string) => {
        setSearchValue(val)
        const params = new URLSearchParams(searchParams.toString())
        if (val) params.set('search', val)
        else params.delete('search')
        params.delete('page')
        router.push(`?${params.toString()}`)
    }

    const toggleSort = (key: TableSortKey) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
            return
        }
        setSortKey(key)
        setSortDirection(key === 'date' ? 'desc' : 'asc')
    }

    const handleRefresh = () => {
        startRefreshTransition(() => {
            void (async () => {
                try {
                    await Promise.all([refetchTransactions(), refetchKPIs()])
                    toast.success('Transactions refreshed')
                } catch {
                    toast.error('Failed to refresh transactions')
                }
            })()
        })
    }

    const openTransactionDetails = (transactionId: string) => {
        setSelectedTransactionId(transactionId)
        setIsDetailOpen(true)
    }

    const handleDetailOpenChange = (open: boolean) => {
        setIsDetailOpen(open)
        if (!open) {
            setSelectedTransactionId(null)
        }
    }

    const handleConfirmRefund = () => {
        if (!refundTarget) return

        const target = refundTarget
        startRefundTransition(() => {
            void (async () => {
                const result = await refundPlatformTransaction(
                    target.id,
                    `Refund initiated from HQ transactions list (${target.order_number || target.order_id})`
                )

                if (!result.success) {
                    toast.error(result.error || 'Failed to refund transaction')
                    return
                }

                toast.success('Refund completed successfully')
                setRefundTarget(null)
                await queryClient.invalidateQueries({ queryKey: ['platform', 'transactions'] })
                await queryClient.invalidateQueries({ queryKey: ['platform', 'kpis'] })
            })()
        })
    }

    const stats = [
        {
            title: 'Total Payments',
            value: totalTransactions.toLocaleString(),
            icon: CreditCard,
            color: 'text-muted-foreground',
            sub: 'Matching current filters',
        },
        {
            title: 'Captured',
            value: transactions.filter(t => t.status === 'captured').length.toLocaleString(),
            icon: CheckCircle,
            color: 'text-green-600',
            sub: 'On this page',
        },
        {
            title: 'Pending',
            value: transactions.filter(t => t.status === 'authorized').length.toLocaleString(),
            icon: Clock,
            color: 'text-yellow-600',
            sub: 'On this page',
        },
        {
            title: 'Total Revenue (30d)',
            value: kpis ? `$${kpis.totalRevenue.toLocaleString()}` : '$0',
            icon: DollarSign,
            color: 'text-blue-600',
            sub: 'Platform aggregate',
        },
    ]

    const searchQuery = filters.search ?? ''

    const exportAllFilteredRows = async () => {
        const batchSize = 1000
        let offset = 0
        const allRows: PlatformTransaction[] = []

        while (true) {
            const response = await getPlatformTransactions(batchSize, offset, filters)
            if (!response.data || response.data.length === 0) break

            allRows.push(...response.data)

            if (response.data.length < batchSize) break
            offset += batchSize

            // Safety break to avoid accidental unbounded loops on bad pagination state.
            if (offset > 50000) break
        }

        if (allRows.length === 0) {
            toast.info('No rows to export for current filters.')
            return
        }

        exportToCSV(allRows)
        toast.success(`Exported ${allRows.length.toLocaleString()} rows`)
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
                    <p className="text-muted-foreground">Monitor and manage all transaction activity</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                    >
                        <RefreshCcwDot className="mr-2 h-4 w-4" />
                        {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => startExportTransition(() => { void exportAllFilteredRows() })}
                        disabled={isExporting}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        {isExporting ? 'Exporting...' : 'Export CSV'}
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <Card key={stat.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                            <stat.icon className={`h-4 w-4 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                            {kpisLoading || transactionsLoading ? (
                                <Skeleton className="h-8 w-24" />
                            ) : (
                                <>
                                    <div className="text-2xl font-bold">{stat.value}</div>
                                    <p className="text-xs text-muted-foreground">{stat.sub}</p>
                                </>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Transactions Table */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle>All Transactions</CardTitle>
                            <CardDescription>Platform-wide payment activity across all merchants</CardDescription>
                        </div>
                    </div>

                    {/* Search + Filter bar */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                        <TransactionSearchBar
                            value={searchValue}
                            onChange={handleSearchChange}
                            className="flex-1 min-w-64"
                        />
                        <TransactionFilterSheet searchParams={searchParams} />
                    </div>
                </CardHeader>

                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>
                                    <Button
                                        variant="ghost"
                                        onClick={() => toggleSort('order')}
                                        className="h-8 px-2"
                                    >
                                        Order #
                                        <ArrowUpDown className="ml-2 h-3 w-3" />
                                    </Button>
                                </TableHead>
                                <TableHead>Merchant</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead>Card</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead>Pay Status</TableHead>
                                <TableHead>Order Status</TableHead>
                                <TableHead>
                                    <Button
                                        variant="ghost"
                                        onClick={() => toggleSort('date')}
                                        className="h-8 px-2"
                                    >
                                        Date
                                        <ArrowUpDown className="ml-2 h-3 w-3" />
                                    </Button>
                                </TableHead>
                                <TableHead className="w-15" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {transactionsLoading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <TableRow key={i}>
                                        {Array.from({ length: 10 }).map((_, j) => (
                                            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : transactionsError ? (
                                <TableRow>
                                    <TableCell colSpan={10} className="text-center py-12 text-destructive">
                                        Error loading transactions: {(transactionsError as Error).message}
                                    </TableCell>
                                </TableRow>
                            ) : transactions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                                        No transactions found. Try adjusting your filters.
                                    </TableCell>
                                </TableRow>
                            ) : sortedTransactions.map((tx) => (
                                <TableRow key={tx.id}>
                                    <TableCell className="font-mono text-xs">
                                        {tx.order_number
                                            ? highlightText(tx.order_number, searchQuery)
                                            : <span className="text-muted-foreground">â€”</span>}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {highlightText(tx.merchant_name, searchQuery)}
                                        {tx.location_name && (
                                            <div className="text-xs text-muted-foreground">{tx.location_name}</div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {highlightText(tx.customer_name || 'Anonymous', searchQuery)}
                                    </TableCell>
                                    <TableCell>
                                        {getMethodBadge(tx.payment_method)}
                                    </TableCell>
                                    <TableCell>
                                        {tx.card_last_four ? (
                                            <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                                                <CardBrandIcon brand={tx.card_type} className="h-5 w-auto" />
                                                <span>****{highlightText(tx.card_last_four, searchQuery)}</span>
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-mono font-semibold">
                                        ${tx.total_amount.toFixed(2)}
                                        {tx.tip_amount > 0 && (
                                            <div className="text-xs text-muted-foreground font-normal">
                                                +${tx.tip_amount.toFixed(2)} tip
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {getPaymentStatusBadge(tx.status)}
                                    </TableCell>
                                    <TableCell>
                                        {getOrderStatusBadge(tx.order_status)}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                        {tx.created_at ? format(new Date(tx.created_at), 'MMM d, h:mm a') : 'â€”'}
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => openTransactionDetails(tx.id)}>
                                                    View Details
                                                </DropdownMenuItem>
                                                <Link href={`/manage/merchants/${tx.merchant_id}/transactions`}>
                                                    <DropdownMenuItem>View in Merchant</DropdownMenuItem>
                                                </Link>
                                                <DropdownMenuItem
                                                    onClick={() => setRefundTarget(tx)}
                                                    disabled={tx.status !== 'captured'}
                                                >
                                                    Refund
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => exportToCSV([tx])}>
                                                    Export Row
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
                            <span>
                                Page {page} of {totalPages} &middot; {totalTransactions.toLocaleString()} total
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setPage(Math.max(1, page - 1))}
                                    disabled={page === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                                    disabled={page === totalPages}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <TransactionDetailSheet
                open={isDetailOpen}
                onOpenChange={handleDetailOpenChange}
                transactionId={selectedTransactionId}
            />

            <AlertDialog open={!!refundTarget} onOpenChange={(open) => !open && setRefundTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Refund</AlertDialogTitle>
                        <AlertDialogDescription>
                            You are about to refund order{' '}
                            <span className="font-semibold">{refundTarget?.order_number || refundTarget?.order_id}</span>{' '}
                            for <span className="font-semibold">${refundTarget?.total_amount.toFixed(2)}</span>.
                            This will update the order and related payments as refunded.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRefunding}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault()
                                handleConfirmRefund()
                            }}
                            disabled={isRefunding}
                        >
                            {isRefunding ? 'Refunding...' : 'Confirm Refund'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

// â”€â”€â”€ Export (wrapped in Suspense for useSearchParams) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function TransactionsPage() {
    return (
        <Suspense fallback={<div className="space-y-6 animate-pulse"><div className="h-10 bg-muted rounded w-64" /></div>}>
            <TransactionsPageInner />
        </Suspense>
    )
}

