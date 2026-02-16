'use client'

import { Fragment, Suspense, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
    DropdownMenuCheckboxItem,
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
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    MoreHorizontal,
    CheckCircle,
    Clock,
    DollarSign,
    ChevronLeft,
    ChevronRight,
    Banknote,
    Columns3,
} from 'lucide-react'
import { usePlatformTransactionStats, usePlatformTransactions } from '@/lib/queries/use-platform-analytics'
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
import { TransactionDetailInlinePanel } from './components/TransactionDetailInlinePanel'
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
    const isCard = isCardMethod(method)
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
        getCustomerLabel(t.customer_name),
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

function isCardMethod(method: string): boolean {
    return method === 'card' || method.startsWith('card_')
}

function getCustomerLabel(customerName?: string): string {
    if (!customerName) return 'Walk-in'
    const trimmed = customerName.trim()
    return trimmed.length > 0 ? trimmed : 'Walk-in'
}

function formatCurrency(amount?: number): string {
    if (amount === undefined || amount === null) return '-'
    return `$${amount.toFixed(2)}`
}

function getTipLabel(amount?: number): string {
    if (!amount) return '-'
    return `$${amount.toFixed(2)}`
}

function getDiscountLabel(amount?: number): string {
    if (!amount) return '-'
    return `$${amount.toFixed(2)}`
}

function getEntryModeLabel(tx: PlatformTransaction): string {
    if (!isCardMethod(tx.payment_method)) return 'N/A'

    const raw = tx.entry_mode?.toLowerCase().trim()
    if (!raw) return 'N/A'

    if (raw.includes('contact') || raw.includes('tap')) return 'Contactless'
    if (raw.includes('chip') || raw.includes('emv') || raw.includes('insert')) return 'Chip'
    if (raw.includes('swipe') || raw.includes('magstripe') || raw.includes('mag')) return 'Swipe'
    if (raw.includes('manual') || raw.includes('keyed') || raw.includes('key')) return 'Manual'

    return 'N/A'
}

type TransactionSortBy = 'created_at' | 'order_number' | 'total_amount'
type TransactionSortDirection = 'asc' | 'desc'
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

type TransactionColumnKey =
    | 'order'
    | 'merchant'
    | 'customer'
    | 'method'
    | 'card'
    | 'entry'
    | 'subtotal'
    | 'tax'
    | 'tip'
    | 'discount'
    | 'total'
    | 'payStatus'
    | 'orderStatus'
    | 'staff'
    | 'date'

const DEFAULT_COLUMN_VISIBILITY: Record<TransactionColumnKey, boolean> = {
    order: true,
    merchant: true,
    customer: true,
    method: true,
    card: true,
    entry: false,
    subtotal: true,
    tax: false,
    tip: true,
    discount: false,
    total: true,
    payStatus: true,
    orderStatus: true,
    staff: false,
    date: true,
}

const COLUMN_LABELS: Record<TransactionColumnKey, string> = {
    order: 'Order #',
    merchant: 'Merchant',
    customer: 'Customer',
    method: 'Method',
    card: 'Card',
    entry: 'Entry',
    subtotal: 'Subtotal',
    tax: 'Tax',
    tip: 'Tip',
    discount: 'Discount',
    total: 'Total',
    payStatus: 'Pay Status',
    orderStatus: 'Order Status',
    staff: 'Staff',
    date: 'Date',
}

const COLUMN_TOGGLE_ORDER: TransactionColumnKey[] = [
    'order',
    'merchant',
    'customer',
    'method',
    'card',
    'entry',
    'subtotal',
    'tax',
    'tip',
    'discount',
    'total',
    'payStatus',
    'orderStatus',
    'staff',
    'date',
]

// â”€â”€â”€ Inner page (needs useSearchParams) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TransactionsPageInner() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const queryClient = useQueryClient()
    const [isExporting, startExportTransition] = useTransition()
    const [isRefreshing, startRefreshTransition] = useTransition()
    const [isRefunding, startRefundTransition] = useTransition()
    const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null)
    const [refundTarget, setRefundTarget] = useState<PlatformTransaction | null>(null)
    const [columnVisibility, setColumnVisibility] = useState<Record<TransactionColumnKey, boolean>>(DEFAULT_COLUMN_VISIBILITY)

    const rawPageSize = Number(searchParams.get('pageSize') ?? '25')
    const pageSize = PAGE_SIZE_OPTIONS.includes(rawPageSize as (typeof PAGE_SIZE_OPTIONS)[number]) ? rawPageSize : 25

    // Parse page from URL
    const rawPage = Number(searchParams.get('page') ?? '1')
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

    const sortBy = (searchParams.get('sortBy') as TransactionSortBy) || 'created_at'
    const sortDirection = (searchParams.get('sortDir') as TransactionSortDirection) || 'desc'
    const normalizedSortBy: TransactionSortBy =
        sortBy === 'order_number' || sortBy === 'total_amount' || sortBy === 'created_at'
            ? sortBy
            : 'created_at'
    const normalizedSortDirection: TransactionSortDirection = sortDirection === 'asc' ? 'asc' : 'desc'

    // Parse all filter params from URL
    const filters: PlatformTransactionFilters = useMemo(() => ({
        search: searchParams.get('search') ?? undefined,
        merchantIds: parseList(searchParams.get('merchants')).length > 0 ? parseList(searchParams.get('merchants')) : undefined,
        locationIds: parseList(searchParams.get('locations')).length > 0 ? parseList(searchParams.get('locations')) : undefined,
        orderStatuses: parseList(searchParams.get('orderStatus')).length > 0 ? parseList(searchParams.get('orderStatus')) : undefined,
        paymentStatuses: parseList(searchParams.get('paymentStatus')).length > 0 ? parseList(searchParams.get('paymentStatus')) : undefined,
        paymentMethods: parseList(searchParams.get('method')).length > 0 ? parseList(searchParams.get('method')) : undefined,
        cardTypes: parseList(searchParams.get('cardType')).length > 0 ? parseList(searchParams.get('cardType')) : undefined,
        staffId: searchParams.get('staffId') ?? undefined,
        minAmount: searchParams.get('minAmount') ? Number(searchParams.get('minAmount')) : undefined,
        maxAmount: searchParams.get('maxAmount') ? Number(searchParams.get('maxAmount')) : undefined,
        dateFrom: searchParams.get('dateFrom') ? `${searchParams.get('dateFrom')}T00:00:00` : undefined,
        dateTo: searchParams.get('dateTo') ? `${searchParams.get('dateTo')}T23:59:59` : undefined,
        sortBy: normalizedSortBy,
        sortDir: normalizedSortDirection,
    }), [searchParams])

    // Search state â€” local, communicated via URL
    const [searchValue, setSearchValue] = useState(searchParams.get('search') ?? '')

    const {
        data: transactionStats,
        isLoading: statsLoading,
        refetch: refetchTransactionStats,
    } = usePlatformTransactionStats(filters)
    const {
        data: transactionsData,
        isLoading: transactionsLoading,
        isFetching: transactionsFetching,
        error: transactionsError,
        refetch: refetchTransactions,
    } = usePlatformTransactions(pageSize, (page - 1) * pageSize, filters)

    const transactions = transactionsData?.data || []
    const totalTransactions = transactionsData?.total || 0
    const totalPages = Math.max(1, Math.ceil(totalTransactions / pageSize))
    const showingFrom = totalTransactions === 0 ? 0 : (page - 1) * pageSize + 1
    const showingTo = totalTransactions === 0 ? 0 : Math.min((page - 1) * pageSize + transactions.length, totalTransactions)
    const [pageInput, setPageInput] = useState(String(page))

    useEffect(() => {
        setPageInput(String(page))
    }, [page])

    const totalVisibleColumns = Object.values(columnVisibility).filter(Boolean).length + 1
    const stickyHeadClass = 'sticky top-0 z-20 bg-card'

    const updateUrlParams = (mutate: (params: URLSearchParams) => void) => {
        const params = new URLSearchParams(searchParams.toString())
        mutate(params)
        const next = params.toString()
        router.push(next ? `?${next}` : '?')
    }

    const setPage = (p: number) => {
        const nextPage = Math.min(Math.max(1, p), totalPages)
        if (nextPage === page) return
        updateUrlParams((params) => {
            params.set('page', String(nextPage))
        })
    }

    const handleSearchChange = (val: string) => {
        setSearchValue(val)
        updateUrlParams((params) => {
            if (val) params.set('search', val)
            else params.delete('search')
            params.delete('page')
        })
    }

    const toggleSort = (columnSortBy: TransactionSortBy) => {
        const nextDirection: TransactionSortDirection =
            normalizedSortBy === columnSortBy
                ? normalizedSortDirection === 'asc'
                    ? 'desc'
                    : 'asc'
                : columnSortBy === 'created_at'
                    ? 'desc'
                    : 'asc'

        updateUrlParams((params) => {
            params.set('sortBy', columnSortBy)
            params.set('sortDir', nextDirection)
            params.delete('page')
        })
    }

    const getSortIndicator = (columnSortBy: TransactionSortBy) => {
        if (normalizedSortBy !== columnSortBy) {
            return <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />
        }
        if (normalizedSortDirection === 'asc') {
            return <ArrowUp className="ml-2 h-3 w-3" />
        }
        return <ArrowDown className="ml-2 h-3 w-3" />
    }

    const handlePageSizeChange = (nextPageSize: number) => {
        if (!PAGE_SIZE_OPTIONS.includes(nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number])) return
        if (nextPageSize === pageSize) return
        updateUrlParams((params) => {
            params.set('pageSize', String(nextPageSize))
            params.delete('page')
        })
    }

    const handlePageInputCommit = () => {
        const parsed = Number(pageInput)
        if (!Number.isFinite(parsed) || parsed < 1) {
            setPageInput(String(page))
            return
        }
        setPage(Math.floor(parsed))
    }

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages)
        }
    }, [page, totalPages])

    useEffect(() => {
        if (!expandedTransactionId) return
        if (!transactions.some((tx) => tx.id === expandedTransactionId)) {
            setExpandedTransactionId(null)
        }
    }, [transactions, expandedTransactionId])

    const handleRefresh = () => {
        startRefreshTransition(() => {
            void (async () => {
                try {
                    await Promise.all([refetchTransactions(), refetchTransactionStats()])
                    toast.success('Transactions refreshed')
                } catch {
                    toast.error('Failed to refresh transactions')
                }
            })()
        })
    }

    const toggleColumnVisibility = (key: TransactionColumnKey) => {
        setColumnVisibility((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    const openTransactionDetails = (transactionId: string) => {
        setExpandedTransactionId((current) => (current === transactionId ? null : transactionId))
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
                await queryClient.invalidateQueries({ queryKey: ['platform', 'transaction-stats'] })
            })()
        })
    }

    const stats = [
        {
            title: 'Total Payments',
            value: (transactionStats?.totalTransactions || 0).toLocaleString(),
            icon: CreditCard,
            color: 'text-muted-foreground',
            sub: 'Matching current filters',
        },
        {
            title: 'Captured',
            value: (transactionStats?.capturedTransactions || 0).toLocaleString(),
            icon: CheckCircle,
            color: 'text-green-600',
            sub: 'Matching current filters',
        },
        {
            title: 'Authorized',
            value: (transactionStats?.authorizedTransactions || 0).toLocaleString(),
            icon: Clock,
            color: 'text-yellow-600',
            sub: 'Matching current filters',
        },
        {
            title: 'Total Revenue',
            value: `$${(transactionStats?.totalRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
            icon: DollarSign,
            color: 'text-blue-600',
            sub: 'Matching current filters',
        },
    ]

    const searchQuery = filters.search ?? ''
    const isTableLoading = transactionsLoading || transactionsFetching

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
                            {statsLoading || transactionsLoading ? (
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
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-2">
                                    <Columns3 className="h-4 w-4" />
                                    Columns
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>Visible Columns</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {COLUMN_TOGGLE_ORDER.map((columnKey) => (
                                    <DropdownMenuCheckboxItem
                                        key={columnKey}
                                        checked={columnVisibility[columnKey]}
                                        onCheckedChange={() => toggleColumnVisibility(columnKey)}
                                    >
                                        {COLUMN_LABELS[columnKey]}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <TransactionFilterSheet searchParams={searchParams} />
                    </div>
                </CardHeader>

                <CardContent>
                    <Table containerClassName="max-h-[70vh] overflow-auto rounded-md border">
                            <TableHeader className="sticky top-0 z-30 bg-card">
                                <TableRow>
                                    {columnVisibility.order && (
                                        <TableHead className={stickyHeadClass}>
                                            <Button
                                                variant="ghost"
                                                onClick={() => toggleSort('order_number')}
                                                className="h-8 px-2"
                                            >
                                                Order #
                                                {getSortIndicator('order_number')}
                                            </Button>
                                        </TableHead>
                                    )}
                                    {columnVisibility.merchant && <TableHead className={stickyHeadClass}>Merchant</TableHead>}
                                    {columnVisibility.customer && <TableHead className={stickyHeadClass}>Customer</TableHead>}
                                    {columnVisibility.method && <TableHead className={stickyHeadClass}>Method</TableHead>}
                                    {columnVisibility.card && <TableHead className={stickyHeadClass}>Card</TableHead>}
                                    {columnVisibility.entry && <TableHead className={stickyHeadClass}>Entry</TableHead>}
                                    {columnVisibility.subtotal && <TableHead className={stickyHeadClass}>Subtotal</TableHead>}
                                    {columnVisibility.tax && <TableHead className={stickyHeadClass}>Tax</TableHead>}
                                    {columnVisibility.tip && <TableHead className={stickyHeadClass}>Tip</TableHead>}
                                    {columnVisibility.discount && <TableHead className={stickyHeadClass}>Discount</TableHead>}
                                    {columnVisibility.total && (
                                        <TableHead className={stickyHeadClass}>
                                            <Button
                                                variant="ghost"
                                                onClick={() => toggleSort('total_amount')}
                                                className="h-8 px-2"
                                            >
                                                Total
                                                {getSortIndicator('total_amount')}
                                            </Button>
                                        </TableHead>
                                    )}
                                    {columnVisibility.payStatus && <TableHead className={stickyHeadClass}>Pay Status</TableHead>}
                                    {columnVisibility.orderStatus && <TableHead className={stickyHeadClass}>Order Status</TableHead>}
                                    {columnVisibility.staff && <TableHead className={stickyHeadClass}>Staff</TableHead>}
                                    {columnVisibility.date && (
                                        <TableHead className={stickyHeadClass}>
                                            <Button
                                                variant="ghost"
                                                onClick={() => toggleSort('created_at')}
                                                className="h-8 px-2"
                                            >
                                                Date
                                                {getSortIndicator('created_at')}
                                            </Button>
                                        </TableHead>
                                    )}
                                    <TableHead className={`${stickyHeadClass} w-15`} />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isTableLoading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <TableRow key={i}>
                                            {Array.from({ length: totalVisibleColumns }).map((_, j) => (
                                                <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                ) : transactionsError ? (
                                    <TableRow>
                                        <TableCell colSpan={totalVisibleColumns} className="text-center py-12 text-destructive">
                                            Error loading transactions: {(transactionsError as Error).message}
                                        </TableCell>
                                    </TableRow>
                                ) : transactions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={totalVisibleColumns} className="text-center py-12 text-muted-foreground">
                                            No transactions found. Try adjusting your filters.
                                        </TableCell>
                                    </TableRow>
                                ) : transactions.map((tx, index) => (
                                    <Fragment key={tx.id}>
                                    <TableRow
                                        className={`${index % 2 === 1 ? 'bg-muted/20' : ''} cursor-pointer ${expandedTransactionId === tx.id ? 'bg-muted/30' : ''}`}
                                        onClick={() => openTransactionDetails(tx.id)}
                                    >
                                        {columnVisibility.order && (
                                            <TableCell className="font-mono text-xs">
                                                {tx.order_number
                                                    ? highlightText(tx.order_number, searchQuery)
                                                    : <span className="text-muted-foreground">-</span>}
                                            </TableCell>
                                        )}
                                        {columnVisibility.merchant && (
                                            <TableCell className="font-medium">
                                                {highlightText(tx.merchant_name, searchQuery)}
                                                {tx.location_name && (
                                                    <div className="text-xs text-muted-foreground">{tx.location_name}</div>
                                                )}
                                            </TableCell>
                                        )}
                                        {columnVisibility.customer && (
                                            <TableCell>{highlightText(getCustomerLabel(tx.customer_name), searchQuery)}</TableCell>
                                        )}
                                        {columnVisibility.method && (
                                            <TableCell>{getMethodBadge(tx.payment_method)}</TableCell>
                                        )}
                                        {columnVisibility.card && (
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
                                        )}
                                        {columnVisibility.entry && (
                                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                {getEntryModeLabel(tx)}
                                            </TableCell>
                                        )}
                                        {columnVisibility.subtotal && (
                                            <TableCell className="font-mono">{formatCurrency(tx.subtotal_amount)}</TableCell>
                                        )}
                                        {columnVisibility.tax && (
                                            <TableCell className="font-mono">{formatCurrency(tx.tax_amount)}</TableCell>
                                        )}
                                        {columnVisibility.tip && (
                                            <TableCell className="font-mono">{getTipLabel(tx.tip_amount)}</TableCell>
                                        )}
                                        {columnVisibility.discount && (
                                            <TableCell className="font-mono">{getDiscountLabel(tx.discount_amount)}</TableCell>
                                        )}
                                        {columnVisibility.total && (
                                            <TableCell className="font-mono font-semibold">
                                                ${tx.total_amount.toFixed(2)}
                                            </TableCell>
                                        )}
                                        {columnVisibility.payStatus && (
                                            <TableCell>{getPaymentStatusBadge(tx.status)}</TableCell>
                                        )}
                                        {columnVisibility.orderStatus && (
                                            <TableCell>{getOrderStatusBadge(tx.order_status)}</TableCell>
                                        )}
                                        {columnVisibility.staff && (
                                            <TableCell>{tx.staff_name || <span className="text-muted-foreground">-</span>}</TableCell>
                                        )}
                                        {columnVisibility.date && (
                                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                                {tx.created_at ? format(new Date(tx.created_at), 'MMM d, h:mm a') : '-'}
                                            </TableCell>
                                        )}
                                        <TableCell onClick={(event) => event.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    <DropdownMenuItem onSelect={() => openTransactionDetails(tx.id)}>
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
                                    {expandedTransactionId === tx.id && (
                                        <TableRow className={index % 2 === 1 ? 'bg-muted/20' : undefined}>
                                            <TableCell colSpan={totalVisibleColumns} className="p-0">
                                                <TransactionDetailInlinePanel transactionId={tx.id} />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    </Fragment>
                                ))}
                            </TableBody>
                        </Table>

                    {/* Pagination */}
                    <div className="flex flex-col gap-3 pt-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                        <span>
                            Showing {showingFrom.toLocaleString()}-{showingTo.toLocaleString()} of {totalTransactions.toLocaleString()}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2">
                                <span>Rows</span>
                                <select
                                    className="h-8 rounded-md border bg-background px-2 text-foreground"
                                    value={pageSize}
                                    onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                                >
                                    {PAGE_SIZE_OPTIONS.map((size) => (
                                        <option key={size} value={size}>
                                            {size}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex items-center gap-2">
                                <span>Page</span>
                                <Input
                                    className="h-8 w-16 text-center"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={pageInput}
                                    onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ''))}
                                    onBlur={handlePageInputCommit}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault()
                                            handlePageInputCommit()
                                        }
                                    }}
                                />
                                <span>of {totalPages.toLocaleString()}</span>
                            </label>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setPage(page - 1)}
                                disabled={page <= 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setPage(page + 1)}
                                disabled={page >= totalPages}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

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

