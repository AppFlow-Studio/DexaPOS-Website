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
import { usePlatformSalesTrend, usePlatformTransactionSummary, usePlatformTransactions } from '@/lib/queries/use-platform-analytics'
import {
    getPlatformTransactionsExport,
    PlatformTransaction,
    PlatformTransactionExportRow,
    PlatformTransactionFilters,
    refundPlatformTransaction,
} from '@/app/manage/actions/hq-platform/transactions'
import { format, parseISO } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { TransactionFilterSheet } from './components/TransactionFilterSheet'
import { TransactionSearchBar, highlightText } from './components/TransactionSearchBar'
import { TransactionDetailInlinePanel } from './components/TransactionDetailInlinePanel'
import { BatchReconciliationSection } from './components/BatchReconciliationSection'
import { MerchantBreakdownSection } from './components/MerchantBreakdownSection'
import { CardBrandIcon } from '@/app/dashboard/payments/components/CardBrandIcon'
import { toast } from 'sonner'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

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

type ExportFormat = 'csv' | 'xlsx'
type TransactionExportRecord = Record<string, string | number>

function formatIsoDateTimeForExport(value?: string): string {
    if (!value) return ''
    return format(new Date(value), 'yyyy-MM-dd HH:mm:ss')
}

function toFileToken(input: string): string {
    return input
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || 'all'
}

function buildExportFilename(
    filters: PlatformTransactionFilters,
    rows: PlatformTransactionExportRow[],
    formatType: ExportFormat
): string {
    const merchantToken =
        filters.merchantIds && filters.merchantIds.length === 1
            ? toFileToken(rows[0]?.merchant_name || 'merchant')
            : filters.merchantIds && filters.merchantIds.length > 1
                ? 'multi'
                : 'all'

    const dateFromToken = filters.dateFrom ? filters.dateFrom.slice(0, 10) : 'all'
    const dateToToken = filters.dateTo ? filters.dateTo.slice(0, 10) : 'all'
    const extension = formatType === 'xlsx' ? 'xlsx' : 'csv'

    return `DEXA_Transactions_${merchantToken}_${dateFromToken}_to_${dateToToken}.${extension}`
}

function buildTransactionExportRecords(rows: PlatformTransactionExportRow[]): TransactionExportRecord[] {
    return rows.map((row) => ({
        'Order #': row.order_number || row.display_number || '',
        'Date/Time': formatIsoDateTimeForExport(row.created_at),
        Merchant: row.merchant_name || '',
        Location: row.location_name || '',
        Customer: row.customer_name || 'Walk-in',
        'Order Type': row.order_type || '',
        'Order Status': row.order_status || '',
        'Payment Method': row.payment_method || '',
        'Card Type': row.card_type || '',
        'Card Last 4': row.card_last_four || '',
        'Entry Mode': row.entry_mode || '',
        'Auth Code': row.authorization_code || '',
        'Reference #': row.reference_number || '',
        'Batch #': row.batch_number || '',
        Subtotal: row.subtotal_amount,
        Tax: row.tax_amount,
        Tip: row.tip_amount,
        Discount: row.discount_amount,
        'Service Charge': row.service_charge_amount,
        Total: row.total_amount,
        'Amount Tendered': row.amount_tendered,
        'Change Given': row.change_given,
        'Payment Status': row.payment_status || '',
        'Is Voided': row.is_voided ? 'Yes' : 'No',
        'Void Reason': row.void_reason || '',
        'Is Returned': row.is_returned ? 'Yes' : 'No',
        'Return Amount': row.return_amount,
        'Return Reason': row.return_reason || '',
        'Staff Name': row.staff_name || '',
        'Terminal Serial': row.terminal_serial || '',
        'Device ID': row.device_id || '',
    }))
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
}

function exportRecordsToCSV(records: TransactionExportRecord[], filename: string) {
    const csv = Papa.unparse(records)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    downloadBlob(blob, filename)
}

function autoColumnWidths(records: TransactionExportRecord[]): { wch: number }[] {
    if (records.length === 0) return []
    const headers = Object.keys(records[0])
    return headers.map((header) => {
        const cellLengths = records.map((row) => String(row[header] ?? '').length)
        const maxDataLen = cellLengths.length > 0 ? Math.max(...cellLengths) : 0
        return { wch: Math.min(Math.max(header.length, maxDataLen) + 2, 48) }
    })
}

function exportRecordsToExcel(records: TransactionExportRecord[], filename: string) {
    const worksheet = XLSX.utils.json_to_sheet(records)
    worksheet['!cols'] = autoColumnWidths(records)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions')
    const fileBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([fileBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    downloadBlob(blob, filename)
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

const CARD_FAMILY_METHODS = ['card', 'card_spinapi', 'card_dvpaylite'] as const
const VOID_RETURN_STATUS_FILTERS = ['void', 'refunded', 'partially_refunded'] as const
const compactNumberFormatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
})

const transactionsTrendChartConfig = {
    revenue: {
        label: 'Revenue',
        color: 'hsl(var(--chart-1))',
    },
}

function formatCurrencyValue(amount: number): string {
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCompactCurrencyValue(amount: number): string {
    return `$${compactNumberFormatter.format(amount)}`
}

function formatSignedDeltaPercent(current: number, previous: number): string {
    if (previous === 0) {
        if (current === 0) return '0.0% vs previous period'
        return 'New vs previous period'
    }
    const delta = ((current - previous) / previous) * 100
    const sign = delta > 0 ? '+' : ''
    return `${sign}${delta.toFixed(1)}% vs previous period`
}

function toPercentLabel(value: number): string {
    return `${value.toFixed(1)}%`
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
    const [isExporting, setIsExporting] = useState(false)
    const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null)
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
        data: transactionSummary,
        isLoading: summaryLoading,
        isFetching: summaryFetching,
        refetch: refetchTransactionSummary,
    } = usePlatformTransactionSummary(filters)
    const {
        data: salesTrend,
        isLoading: trendLoading,
        isFetching: trendFetching,
        refetch: refetchSalesTrend,
    } = usePlatformSalesTrend()
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
                    await Promise.all([refetchTransactions(), refetchTransactionSummary(), refetchSalesTrend()])
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
                await queryClient.invalidateQueries({ queryKey: ['platform', 'transaction-summary'] })
                await queryClient.invalidateQueries({ queryKey: ['platform', 'merchant-breakdown'] })
                await queryClient.invalidateQueries({ queryKey: ['platform', 'sales-trend'] })
                await queryClient.invalidateQueries({ queryKey: ['platform', 'settlement-batches'] })
                await queryClient.invalidateQueries({ queryKey: ['platform', 'settlement-batch-payments'] })
            })()
        })
    }

    type SummaryCardId =
        | 'total_transactions'
        | 'card_revenue'
        | 'cash_revenue'
        | 'total_revenue'
        | 'avg_tip'
        | 'voided_returned'

    const handleSummaryCardClick = (cardId: SummaryCardId) => {
        if (!transactionSummary) return

        updateUrlParams((params) => {
            if (cardId === 'total_transactions' || cardId === 'total_revenue') {
                params.delete('method')
            } else if (cardId === 'card_revenue' || cardId === 'avg_tip') {
                const currentMethods = parseList(params.get('method'))
                const hasAllCardMethods = CARD_FAMILY_METHODS.every((method) => currentMethods.includes(method))
                const nextMethods = hasAllCardMethods
                    ? currentMethods.filter((method) => !CARD_FAMILY_METHODS.includes(method as (typeof CARD_FAMILY_METHODS)[number]))
                    : Array.from(new Set([...currentMethods, ...CARD_FAMILY_METHODS]))
                if (nextMethods.length > 0) params.set('method', nextMethods.join(','))
                else params.delete('method')
            } else if (cardId === 'cash_revenue') {
                const currentMethods = parseList(params.get('method'))
                const hasCash = currentMethods.includes('cash')
                const nextMethods = hasCash
                    ? currentMethods.filter((method) => method !== 'cash')
                    : Array.from(new Set([...currentMethods, 'cash']))
                if (nextMethods.length > 0) params.set('method', nextMethods.join(','))
                else params.delete('method')
            } else if (cardId === 'voided_returned') {
                const currentStatuses = parseList(params.get('paymentStatus'))
                const hasAllVoidReturnStatuses = VOID_RETURN_STATUS_FILTERS.every((status) => currentStatuses.includes(status))
                const nextStatuses = hasAllVoidReturnStatuses
                    ? currentStatuses.filter((status) => !VOID_RETURN_STATUS_FILTERS.includes(status as (typeof VOID_RETURN_STATUS_FILTERS)[number]))
                    : Array.from(new Set([...currentStatuses, ...VOID_RETURN_STATUS_FILTERS]))
                if (nextStatuses.length > 0) params.set('paymentStatus', nextStatuses.join(','))
                else params.delete('paymentStatus')
            }

            params.delete('page')
        })
    }

    const summaryUnavailable = !transactionSummary
    const currentSummary = transactionSummary?.current
    const previousSummary = transactionSummary?.previous

    const currentCardAvgTicket =
        currentSummary && currentSummary.cardCount > 0
            ? currentSummary.cardRevenue / currentSummary.cardCount
            : 0
    const currentCashAvgTicket =
        currentSummary && currentSummary.cashCount > 0
            ? currentSummary.cashRevenue / currentSummary.cashCount
            : 0
    const currentCardSplit =
        currentSummary && currentSummary.totalRevenue > 0
            ? (currentSummary.cardRevenue / currentSummary.totalRevenue) * 100
            : 0
    const currentCashSplit =
        currentSummary && currentSummary.totalRevenue > 0
            ? (currentSummary.cashRevenue / currentSummary.totalRevenue) * 100
            : 0

    const summaryCards = [
        {
            id: 'total_transactions' as const,
            title: 'Total Transactions',
            value: currentSummary ? currentSummary.totalTransactions.toLocaleString() : '-',
            icon: CreditCard,
            color: 'text-muted-foreground',
            sub:
                currentSummary && previousSummary
                    ? formatSignedDeltaPercent(currentSummary.totalTransactions, previousSummary.totalTransactions)
                    : 'Summary unavailable (apply migration 026)',
        },
        {
            id: 'card_revenue' as const,
            title: 'Card Revenue',
            value: currentSummary ? formatCurrencyValue(currentSummary.cardRevenue) : '-',
            icon: CreditCard,
            color: 'text-blue-600',
            sub:
                currentSummary
                    ? `Avg ticket ${formatCurrencyValue(currentCardAvgTicket)}`
                    : 'Summary unavailable (apply migration 026)',
        },
        {
            id: 'cash_revenue' as const,
            title: 'Cash Revenue',
            value: currentSummary ? formatCurrencyValue(currentSummary.cashRevenue) : '-',
            icon: Banknote,
            color: 'text-emerald-600',
            sub:
                currentSummary
                    ? `Avg ticket ${formatCurrencyValue(currentCashAvgTicket)}`
                    : 'Summary unavailable (apply migration 026)',
        },
        {
            id: 'total_revenue' as const,
            title: 'Total Revenue',
            value: currentSummary ? formatCurrencyValue(currentSummary.totalRevenue) : '-',
            icon: DollarSign,
            color: 'text-indigo-600',
            sub:
                currentSummary
                    ? `Card ${toPercentLabel(currentCardSplit)} / Cash ${toPercentLabel(currentCashSplit)}`
                    : 'Summary unavailable (apply migration 026)',
        },
        {
            id: 'avg_tip' as const,
            title: 'Avg Tip',
            value: currentSummary ? formatCurrencyValue(currentSummary.avgTip) : '-',
            icon: CheckCircle,
            color: 'text-amber-600',
            sub:
                currentSummary
                    ? `Avg tip ${toPercentLabel(currentSummary.avgTipPct)}`
                    : 'Summary unavailable (apply migration 026)',
        },
        {
            id: 'voided_returned' as const,
            title: 'Voided/Returned',
            value: currentSummary
                ? `${currentSummary.voidReturnCount.toLocaleString()} • ${formatCurrencyValue(currentSummary.voidReturnAmount)}`
                : '-',
            icon: Clock,
            color: 'text-rose-600',
            sub:
                currentSummary
                    ? `Void rate ${toPercentLabel(currentSummary.voidRatePct)}`
                    : 'Summary unavailable (apply migration 026)',
        },
    ]

    const trendChartData = useMemo(() => {
        if (!salesTrend || salesTrend.length === 0) return []
        return [...salesTrend]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((point) => ({
                date: point.date,
                label: format(parseISO(point.date), 'MMM d'),
                revenue: Number(point.revenue) || 0,
            }))
    }, [salesTrend])

    const trendRevenueTotal = useMemo(
        () => trendChartData.reduce((sum, point) => sum + point.revenue, 0),
        [trendChartData]
    )
    const trendRevenueDailyAvg =
        trendChartData.length > 0 ? trendRevenueTotal / trendChartData.length : 0

    const merchantBreakdownFilters = useMemo(
        () => ({
            merchantIds: filters.merchantIds,
            locationIds: filters.locationIds,
            paymentStatuses: filters.paymentStatuses,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
        }),
        [filters.merchantIds, filters.locationIds, filters.paymentStatuses, filters.dateFrom, filters.dateTo]
    )

    const searchQuery = filters.search ?? ''
    const isTableLoading = transactionsLoading || transactionsFetching

    const handleExportRequest = async (formatType: ExportFormat) => {
        if (isExporting) return

        setIsExporting(true)
        setExportFormat(formatType)
        try {
            const exportResult = await getPlatformTransactionsExport(filters)

            if (exportResult.errorCode) {
                if (exportResult.errorCode === 'PGRST202' || exportResult.errorCode === '42883') {
                    toast.error('Export RPC is not available yet. Apply migration 025 first.')
                } else {
                    toast.error(`Export failed (${exportResult.errorCode}).`)
                }
                return
            }

            if (exportResult.rows.length === 0) {
                toast.info('No rows to export for current filters.')
                return
            }

            const records = buildTransactionExportRecords(exportResult.rows)
            const filename = buildExportFilename(filters, exportResult.rows, formatType)

            if (formatType === 'xlsx') {
                exportRecordsToExcel(records, filename)
            } else {
                exportRecordsToCSV(records, filename)
            }

            if (exportResult.capped) {
                toast.warning(`Export capped at ${exportResult.cap.toLocaleString()} rows. Contact support for bulk exports.`)
            }

            toast.success(`Exported ${exportResult.rows.length.toLocaleString()} rows (${formatType.toUpperCase()})`)
        } catch (error) {
            console.error('[TransactionsPage] Export error:', error)
            toast.error('Failed to generate export file.')
        } finally {
            setExportFormat(null)
            setIsExporting(false)
        }
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
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" disabled={isExporting}>
                                <Download className="mr-2 h-4 w-4" />
                                {isExporting
                                    ? `Exporting ${exportFormat === 'xlsx' ? 'Excel' : 'CSV'}...`
                                    : 'Export'}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                disabled={isExporting}
                                onSelect={(event) => {
                                    event.preventDefault()
                                    void handleExportRequest('csv')
                                }}
                            >
                                Export CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                disabled={isExporting}
                                onSelect={(event) => {
                                    event.preventDefault()
                                    void handleExportRequest('xlsx')
                                }}
                            >
                                Export Excel (.xlsx)
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {summaryCards.map((stat) => (
                    <Card
                        key={stat.id}
                        className={summaryUnavailable ? '' : 'cursor-pointer transition-colors hover:bg-muted/30'}
                        onClick={summaryUnavailable ? undefined : () => handleSummaryCardClick(stat.id)}
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                            <stat.icon className={`h-4 w-4 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                            {summaryLoading || summaryFetching ? (
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

            <MerchantBreakdownSection filters={merchantBreakdownFilters} />

            {/* Experimental Trend Graph */}
            <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>Transactions Trend</CardTitle>
                        <CardDescription>
                            Experimental: live 30-day revenue trend from analytics feed
                        </CardDescription>
                    </div>
                    <Badge variant="secondary">Experimental</Badge>
                </CardHeader>
                <CardContent>
                    {trendLoading || trendFetching ? (
                        <Skeleton className="h-[260px] w-full" />
                    ) : trendChartData.length === 0 ? (
                        <div className="flex h-[260px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                            No trend data available.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                                <span>30-day revenue: {formatCurrencyValue(trendRevenueTotal)}</span>
                                <span>Daily average: {formatCurrencyValue(trendRevenueDailyAvg)}</span>
                            </div>
                            <ChartContainer config={transactionsTrendChartConfig} className="h-[260px] w-full">
                                <AreaChart data={trendChartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        minTickGap={24}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={formatCompactCurrencyValue}
                                    />
                                    <ChartTooltip
                                        content={
                                            <ChartTooltipContent
                                                formatter={(value) => (
                                                    <span className="font-mono">
                                                        {formatCurrencyValue(Number(value) || 0)}
                                                    </span>
                                                )}
                                                labelFormatter={(_, payload) => {
                                                    const rawDate = payload?.[0]?.payload?.date
                                                    return rawDate ? format(parseISO(rawDate), 'MMM d, yyyy') : ''
                                                }}
                                            />
                                        }
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke="var(--color-revenue)"
                                        fill="var(--color-revenue)"
                                        fillOpacity={0.2}
                                    />
                                </AreaChart>
                            </ChartContainer>
                        </div>
                    )}
                </CardContent>
            </Card>

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

            <BatchReconciliationSection />

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

