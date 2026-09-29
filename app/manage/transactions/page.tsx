'use client'

import { Fragment, Suspense, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    ArrowDown,
    ArrowDownRight,
    ArrowUp,
    ArrowUpDown,
    ArrowUpRight,
    Banknote,
    Columns3,
    CreditCard,
    Download,
    Info,
    MoreHorizontal,
    RefreshCcwDot,
    X,
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
import { PageHeader, PageShell, Panel, PanelSection, StatRow, StatTile, ChartEmpty, isEmptySeries, CHART_GRID, CHART_TICK } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import type { PaginationMeta } from '@/types/pagination'
import { AnalyticsTooltip, CHART_MARGIN } from '@/app/manage/components/analytics-primitives'
import { TransactionFilterDialog } from './components/TransactionFilterDialog'
import { TransactionSearchBar, highlightText } from './components/TransactionSearchBar'
import { TransactionDetailInlinePanel } from './components/TransactionDetailInlinePanel'
import { BatchReconciliationSection } from './components/BatchReconciliationSection'
import { MerchantBreakdownSection, formatBreakdownRangeLabel } from './components/MerchantBreakdownSection'
import { ChargebacksSection } from './components/ChargebacksSection'
import { AuditLogSection } from './components/AuditLogSection'
import { ConnectivityStrip } from './components/ConnectivityStrip'
import { PaymentsLedger } from './components/PaymentsLedger'
import { TransactionsPageSkeleton } from './components/TransactionsPageSkeleton'
import {
    CardField,
    CardFields,
    CardGridEmpty,
    LoadError,
    RecordCard,
    RecordCardSkeletons,
    TableEmptyRow,
} from './components/ledger-primitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CardBrandIcon } from '@/app/dashboard/payments/components/CardBrandIcon'
import { toast } from 'sonner'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { InfoIcon } from '@/components/ui/info-icon'

// ─── Helpers ────────────────────────────────────────────────────────────────

const PAYMENT_STATUS_LABELS: Record<string, string> = {
    captured: 'Captured',
    authorized: 'Authorized',
    refunded: 'Refunded',
    partially_refunded: 'Part. Refund',
    declined: 'Declined',
    void: 'Void',
}

/** One neutral pill for every state; the word carries the meaning (§4.6b). */
function getPaymentStatusBadge(status: string) {
    return (
        <Badge variant="outline" className="text-xs capitalize">
            {PAYMENT_STATUS_LABELS[status] ?? status}
        </Badge>
    )
}

function getMethodLabel(method: string): string {
    return isCardMethod(method) ? 'Card' : method === 'cash' ? 'Cash' : method
}

function getMethodBadge(method: string) {
    const isCard = isCardMethod(method)
    return (
        <Badge variant="outline" className="gap-1 text-xs">
            {isCard ? <CreditCard className="h-3 w-3" /> : <Banknote className="h-3 w-3" />}
            {getMethodLabel(method)}
        </Badge>
    )
}

function exportToCSV(transactions: PlatformTransaction[]) {
    const headers = ['Payment ID', 'Order #', 'Merchant', 'Location', 'Customer', 'Method', 'Card', 'Amount', 'Tip', 'Total', 'Status', 'Auth Code', 'Ref #', 'Date']
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

// ─── URL param parser helpers ───────────────────────────────────────────────

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

/** Unknown is not zero (§4.9): a missing amount renders an em dash. */
function formatCurrency(amount?: number): string {
    if (amount === undefined || amount === null) return '—'
    return `$${amount.toFixed(2)}`
}

function formatOptionalCurrency(amount?: number): string {
    if (!amount) return '—'
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

function formatTxDate(value?: string): string {
    return value ? format(new Date(value), 'MMM d, h:mm a') : '—'
}

const CARD_FAMILY_METHODS = ['card', 'card_spinapi', 'card_dvpaylite'] as const
const VOID_RETURN_STATUS_FILTERS = ['void', 'refunded', 'partially_refunded'] as const
const compactNumberFormatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
})

function formatCurrencyValue(amount: number): string {
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCompactCurrencyValue(amount: number): string {
    return `$${compactNumberFormatter.format(amount)}`
}

/**
 * An honest delta (§6.2): nothing against a zero baseline, nothing when it
 * would read 0.0%, and direction carried by a glyph, the sign and a
 * screen-reader word — never by green or red.
 */
function formatDelta(current: number, previous: number): React.ReactNode {
    if (previous === 0) return null
    const delta = ((current - previous) / previous) * 100
    if (Math.abs(delta) < 0.05) return null
    const Arrow = delta > 0 ? ArrowUpRight : ArrowDownRight
    return (
        <span className="inline-flex items-center gap-0.5 tabular-nums">
            <Arrow className="h-3.5 w-3.5" aria-hidden />
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}%
            <span className="sr-only">{delta > 0 ? 'increase' : 'decrease'}</span>
            <span> vs previous period</span>
        </span>
    )
}

function toPercentLabel(value: number): string {
    return `${value.toFixed(1)}%`
}

type TransactionSortBy = 'created_at' | 'order_number' | 'total_amount'
type TransactionSortDirection = 'asc' | 'desc'

/** A page's primary list pages 25 at a time (§5.7). */
const PAGE_SIZE = 25

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
    payStatus: 'Status',
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
    'staff',
    'date',
]

/** URL params that narrow the ledger. Sort and page are not filters. */
const FILTER_PARAM_KEYS = [
    'search',
    'merchants',
    'locations',
    'orderStatus',
    'paymentStatus',
    'method',
    'cardType',
    'staffId',
    'minAmount',
    'maxAmount',
    'dateFrom',
    'dateTo',
    'datePreset',
] as const

type SummaryCardId =
    | 'total_transactions'
    | 'card_revenue'
    | 'cash_revenue'
    | 'total_revenue'
    | 'avg_tip'
    | 'voided_returned'

/*
 * The figure definitions. They used to sit in an InfoIcon on each tile, but a
 * tile that filters is a <button>, and an interactive tip inside a button is
 * invalid markup. They move into one "How these are calculated" popover
 * instead (§13.4: move an explanation, don't delete it).
 */
const SUMMARY_DEFINITIONS: { id: SummaryCardId; title: string; tip: string }[] = [
    { id: 'total_transactions', title: 'Total transactions', tip: 'Total number of payment transactions processed across all merchants in the selected date range, including captured, authorized, refunded, and voided payments.' },
    { id: 'card_revenue', title: 'Card revenue', tip: 'Total dollar amount collected from card payments (credit and debit) in the selected period. Excludes cash transactions. The average ticket is the mean card transaction value.' },
    { id: 'cash_revenue', title: 'Cash revenue', tip: 'Total dollar amount recorded from cash payments in the selected period. Cash transactions are entered manually by staff and are not processed through the card network.' },
    { id: 'total_revenue', title: 'Total revenue', tip: 'Combined card and cash revenue for the selected period. The split shows what percentage of revenue came from each payment method.' },
    { id: 'avg_tip', title: 'Avg tip', tip: 'Average tip amount across all tipped transactions in the selected period. The percentage shown is the average tip as a share of the pre-tip order amount.' },
    { id: 'voided_returned', title: 'Voids & refunds', tip: 'Total count and dollar value of voided and refunded transactions. Voids cancel a transaction before settlement; refunds return money after capture. The void rate is the percentage of total transactions that were voided.' },
]

const TABS = [
    { value: 'payments', label: 'Payments ledger' },
    { value: 'settlements', label: 'Settlements' },
    { value: 'disputes', label: 'Disputes' },
    { value: 'audit', label: 'Audit' },
] as const

// ─── Inner page (needs useSearchParams) ─────────────────────────────────────

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
    const [activeTab, setActiveTab] = useState<string>('settlements')
    const tabRailRef = useRef<HTMLDivElement>(null)
    const tabRailPositioned = useRef(false)

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

    // Parse all filter params from URL.
    // Memo deps must be the URL string, not the searchParams object itself —
    // useSearchParams() returns a new instance every render, which would
    // invalidate this memo and cause downstream React Query keys to churn.
    const searchParamsKey = searchParams.toString()
    const filters: PlatformTransactionFilters = useMemo(() => ({
        search: searchParams.get('search') ?? undefined,
        merchantIds: parseList(searchParams.get('merchants')).length > 0 ? parseList(searchParams.get('merchants')) : undefined,
        locationIds: parseList(searchParams.get('locations')).length > 0 ? parseList(searchParams.get('locations')) : undefined,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [searchParamsKey, normalizedSortBy, normalizedSortDirection])

    const hasActiveFilters = FILTER_PARAM_KEYS.some((key) => Boolean(searchParams.get(key)))

    // Search state — local, communicated via URL
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
    } = usePlatformTransactions(PAGE_SIZE, (page - 1) * PAGE_SIZE, filters)

    const transactions = transactionsData?.data || []
    const totalTransactions = transactionsData?.total || 0
    const totalPages = Math.max(1, Math.ceil(totalTransactions / PAGE_SIZE))
    const pagination: PaginationMeta = {
        page,
        pageSize: PAGE_SIZE,
        total: totalTransactions,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
    }

    const totalVisibleColumns = Object.values(columnVisibility).filter(Boolean).length + 1

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

    // Clears what narrows the ledger; keeps the chosen sort.
    const clearFilters = () => {
        setSearchValue('')
        updateUrlParams((params) => {
            FILTER_PARAM_KEYS.forEach((key) => params.delete(key))
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

    // The section rail keeps the active tab in view (§13.2): scroll the rail
    // itself, clamped, and re-measure once it has a width.
    useEffect(() => {
        const rail = tabRailRef.current
        if (!rail) return
        let done = false
        const align = () => {
            const max = rail.scrollWidth - rail.clientWidth
            const tab = rail.querySelector<HTMLElement>('[data-state="active"]')
            if (done || !tab || max <= 0) return
            const left = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2
            const smooth = tabRailPositioned.current && !matchMedia('(prefers-reduced-motion: reduce)').matches
            rail.scrollTo({ left: Math.max(0, Math.min(left, max)), behavior: smooth ? 'smooth' : 'auto' })
            tabRailPositioned.current = done = true
        }
        align()
        const observer = new ResizeObserver(align)
        observer.observe(rail)
        return () => observer.disconnect()
    }, [activeTab])

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
    const channelSummaries = transactionSummary?.channels ?? []
    const isSummaryLoading = summaryLoading || summaryFetching

    // Which filter each tile would apply — the applied one reads by weight.
    const activeMethods = filters.paymentMethods ?? []
    const activeStatuses = filters.paymentStatuses ?? []
    const summaryActive: Record<SummaryCardId, boolean> = {
        total_transactions: activeMethods.length === 0,
        total_revenue: activeMethods.length === 0,
        card_revenue: CARD_FAMILY_METHODS.every((method) => activeMethods.includes(method)),
        avg_tip: CARD_FAMILY_METHODS.every((method) => activeMethods.includes(method)),
        cash_revenue: activeMethods.includes('cash'),
        voided_returned: VOID_RETURN_STATUS_FILTERS.every((status) => activeStatuses.includes(status)),
    }

    // An average over nothing is unknown, not $0.00 (§4.9).
    const currentCardAvgTicket =
        currentSummary && currentSummary.cardCount > 0
            ? formatCurrencyValue(currentSummary.cardRevenue / currentSummary.cardCount)
            : null
    const currentCashAvgTicket =
        currentSummary && currentSummary.cashCount > 0
            ? formatCurrencyValue(currentSummary.cashRevenue / currentSummary.cashCount)
            : null
    const revenueSplit =
        currentSummary && currentSummary.totalRevenue > 0
            ? `Card ${toPercentLabel((currentSummary.cardRevenue / currentSummary.totalRevenue) * 100)} / Cash ${toPercentLabel((currentSummary.cashRevenue / currentSummary.totalRevenue) * 100)}`
            : null
    const unavailableMeta = 'Needs migration 026'

    const summaryTiles: { id: SummaryCardId; label: string; value: string; meta: React.ReactNode }[] = [
        {
            id: 'total_transactions',
            label: 'Total transactions',
            value: currentSummary ? currentSummary.totalTransactions.toLocaleString() : '—',
            meta: currentSummary
                ? previousSummary
                    ? formatDelta(currentSummary.totalTransactions, previousSummary.totalTransactions)
                    : null
                : unavailableMeta,
        },
        {
            id: 'card_revenue',
            label: 'Card revenue',
            value: currentSummary ? formatCurrencyValue(currentSummary.cardRevenue) : '—',
            meta: currentSummary ? (currentCardAvgTicket ? `Avg ticket ${currentCardAvgTicket}` : 'No card payments') : unavailableMeta,
        },
        {
            id: 'cash_revenue',
            label: 'Cash revenue',
            value: currentSummary ? formatCurrencyValue(currentSummary.cashRevenue) : '—',
            meta: currentSummary ? (currentCashAvgTicket ? `Avg ticket ${currentCashAvgTicket}` : 'No cash payments') : unavailableMeta,
        },
        {
            id: 'total_revenue',
            label: 'Total revenue',
            value: currentSummary ? formatCurrencyValue(currentSummary.totalRevenue) : '—',
            meta: currentSummary ? revenueSplit : unavailableMeta,
        },
        {
            id: 'avg_tip',
            label: 'Avg tip',
            value: currentSummary ? formatCurrencyValue(currentSummary.avgTip) : '—',
            meta: currentSummary ? `Avg tip ${toPercentLabel(currentSummary.avgTipPct)}` : unavailableMeta,
        },
        {
            id: 'voided_returned',
            label: 'Voids & refunds',
            value: currentSummary
                ? `${currentSummary.voidReturnCount.toLocaleString()} · ${formatCurrencyValue(currentSummary.voidReturnAmount)}`
                : '—',
            meta: currentSummary ? `Void rate ${toPercentLabel(currentSummary.voidRatePct)}` : unavailableMeta,
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
    const trendIsEmpty = isEmptySeries(trendChartData, (point) => point.revenue)

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

    const emptyTitle = hasActiveFilters ? 'No transactions match these filters' : 'No transactions yet'
    const emptyHint = hasActiveFilters
        ? 'Clear the search or filters to widen the results.'
        : 'Payments will appear here once merchants start taking orders.'

    /** Row actions, shared by the table row and the phone card. */
    const renderRowActions = (tx: PlatformTransaction) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    aria-label={`Actions for order ${tx.order_number || tx.order_id}`}
                    className="h-8 w-8 rounded-full p-0"
                >
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => openTransactionDetails(tx.id)}>
                    {expandedTransactionId === tx.id ? 'Hide details' : 'View details'}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href={`/manage/merchants/${tx.merchant_id}/transactions`}>View in merchant</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => setRefundTarget(tx)}
                    disabled={tx.status !== 'captured'}
                >
                    Refund
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => exportToCSV([tx])}>
                    Export row
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )

    /** Column header with its definition beside it. */
    const headLabel = (label: string, tip: string) => (
        <span className="inline-flex items-center gap-1">
            {label} <InfoIcon tip={tip} side="bottom" />
        </span>
    )

    return (
        /* `as="div"`: app/manage/layout.tsx already owns this surface's <main> (§14.1). */
        <PageShell as="div">
            <PageHeader
                title="Payments & Banking"
                subtitle="Payment ledger, settlements, and disputes across all merchants"
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="h-9 px-4 text-[0.8125rem] font-medium"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                        >
                            <RefreshCcwDot className="mr-2 h-4 w-4" />
                            {isRefreshing ? 'Refreshing…' : 'Refresh'}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="h-9 px-4 text-[0.8125rem] font-medium"
                                    disabled={isExporting}
                                >
                                    <Download className="mr-2 h-4 w-4" />
                                    {isExporting
                                        ? `Exporting ${exportFormat === 'xlsx' ? 'Excel' : 'CSV'}…`
                                        : 'Export'}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Export format</DropdownMenuLabel>
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
                    </>
                }
            />

            {/* Processor status: neutral unless a sync has failed. */}
            <ConnectivityStrip merchantIds={filters.merchantIds ?? null} />

            {/* Summary — the figures double as filters on the ledger below. */}
            <Panel>
                <PanelSection
                    label="Payment summary"
                    caption="Follows the ledger filters. Select a figure to filter by it."
                    action={
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-3 text-[0.8125rem] text-muted-foreground">
                                    <Info className="h-4 w-4" />
                                    How these are calculated
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl p-4">
                                <dl className="space-y-3 text-sm">
                                    {SUMMARY_DEFINITIONS.map((definition) => (
                                        <div key={definition.id}>
                                            <dt className="font-medium">{definition.title}</dt>
                                            <dd className="mt-0.5 text-xs leading-snug text-muted-foreground">{definition.tip}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </PopoverContent>
                        </Popover>
                    }
                >
                    <StatRow columns={3}>
                        {summaryTiles.map((tile) => (
                            <StatTile
                                key={tile.id}
                                label={tile.label}
                                value={tile.value}
                                meta={tile.meta}
                                // The reason a figure reads "—" is not detail a phone can drop.
                                showMetaOnMobile={summaryUnavailable && !isSummaryLoading}
                                isLoading={isSummaryLoading}
                                onClick={summaryUnavailable ? undefined : () => handleSummaryCardClick(tile.id)}
                                isActive={summaryActive[tile.id]}
                            />
                        ))}
                    </StatRow>
                </PanelSection>
            </Panel>

            <Panel>
                <PanelSection
                    label="Revenue by channel"
                    caption="In-store, kiosk, online, and delivery apps for the selected filters"
                >
                    {isSummaryLoading ? (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {[0, 1, 2, 3].map((item) => (
                                <Skeleton key={item} className="h-28 w-full rounded-2xl" />
                            ))}
                        </div>
                    ) : channelSummaries.length === 0 ? (
                        <div className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 text-center">
                            <p className="text-sm font-medium">Channel breakdown isn&apos;t available yet</p>
                            <p className="text-xs text-muted-foreground">
                                It appears once the kiosk reporting v2 migration is promoted.
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {channelSummaries.map((channel) => (
                                <div
                                    key={channel.channel}
                                    className="min-w-0 rounded-2xl bg-muted/60 px-4 py-4"
                                >
                                    <p className="truncate text-sm font-medium text-muted-foreground">{channel.label}</p>
                                    <p className="mt-1 text-xl font-medium leading-tight tracking-[-0.02em] tabular-nums">
                                        {formatCurrencyValue(channel.current.totalRevenue)}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                                        {channel.current.totalTransactions.toLocaleString()} transactions
                                    </p>
                                    <p className="text-xs text-muted-foreground tabular-nums max-sm:hidden">
                                        Card {formatCurrencyValue(channel.current.cardRevenue)} / Cash {formatCurrencyValue(channel.current.cashRevenue)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </PanelSection>
            </Panel>

            <Panel>
                <PanelSection
                    label={
                        <span className="inline-flex items-center gap-1">
                            Merchant breakdown
                            <InfoIcon tip="Side-by-side performance comparison across all merchants for the selected date range. Click any column header to sort. Use this to spot top performers, high void rates, or merchants with unusual tip patterns." />
                        </span>
                    }
                    caption={`Merchant volume and revenue for ${formatBreakdownRangeLabel(merchantBreakdownFilters)}`}
                    // The caption names the date range — scope, not description (§13.4).
                    showCaptionOnMobile
                >
                    <MerchantBreakdownSection filters={merchantBreakdownFilters} />
                </PanelSection>
            </Panel>

            <Panel>
                <PanelSection
                    label={
                        <span className="inline-flex items-center gap-1">
                            Transactions trend
                            <InfoIcon tip="Daily revenue chart for the last 30 days. Each point is the total amount collected across all payment methods that day. Use this to spot seasonal patterns, busy days, or sudden drops in activity." />
                        </span>
                    }
                    caption="Daily revenue for the last 30 days, all merchants. Not affected by the filters."
                    // Says the chart ignores the filters every other panel follows.
                    showCaptionOnMobile
                    action={<Badge variant="outline">Experimental</Badge>}
                >
                    {trendLoading || trendFetching ? (
                        <Skeleton className="h-[260px] w-full rounded-2xl" />
                    ) : trendIsEmpty ? (
                        <ChartEmpty
                            height={260}
                            title="No revenue in the last 30 days"
                            hint="The trend will appear once merchants start taking payments."
                        />
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground tabular-nums">
                                <span>30-day revenue: <span className="font-medium text-foreground">{formatCurrencyValue(trendRevenueTotal)}</span></span>
                                <span>Daily average: <span className="font-medium text-foreground">{formatCurrencyValue(trendRevenueDailyAvg)}</span></span>
                            </div>
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={trendChartData} margin={CHART_MARGIN}>
                                    <defs>
                                        <linearGradient id="transactionsTrendFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid {...CHART_GRID} vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        tick={CHART_TICK}
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        minTickGap={24}
                                    />
                                    <YAxis
                                        width={56}
                                        tick={CHART_TICK}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={formatCompactCurrencyValue}
                                    />
                                    <Tooltip
                                        cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                                        content={<AnalyticsTooltip formatter={(value: number) => formatCurrencyValue(Number(value) || 0)} />}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="revenue"
                                        name="Revenue"
                                        stroke="var(--brand)"
                                        strokeWidth={2}
                                        fill="url(#transactionsTrendFill)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </PanelSection>
            </Panel>

            {/* The ledger: toolbar, table from `xl`, record cards below (§5.3). */}
            <Panel>
                <PanelSection
                    label={
                        <span className="inline-flex items-center gap-1">
                            All transactions
                            <InfoIcon tip="Every payment record across all merchants and locations. Click any row to expand full transaction details. Use the column picker to show or hide fields." />
                        </span>
                    }
                    caption="Platform-wide payment activity across all merchants"
                >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <TransactionSearchBar
                            value={searchValue}
                            onChange={handleSearchChange}
                            className="w-full min-w-0 sm:flex-1"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Columns govern the table only, which shows from `xl`. */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="hidden h-9 shrink-0 gap-2 border-0 bg-muted/60 px-4 text-[0.8125rem] text-muted-foreground shadow-none hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground xl:inline-flex"
                                    >
                                        <Columns3 className="h-4 w-4" />
                                        Columns
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {COLUMN_TOGGLE_ORDER.map((columnKey) => (
                                        <DropdownMenuCheckboxItem
                                            key={columnKey}
                                            checked={columnVisibility[columnKey]}
                                            onSelect={(event) => event.preventDefault()}
                                            onCheckedChange={() => toggleColumnVisibility(columnKey)}
                                        >
                                            {COLUMN_LABELS[columnKey]}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <TransactionFilterDialog searchParams={searchParams} />
                            {hasActiveFilters && (
                                <Button variant="ghost" className="h-9 gap-1.5 px-4 text-[0.8125rem] text-muted-foreground" onClick={clearFilters}>
                                    <X className="h-3.5 w-3.5" />
                                    Clear filters
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 min-w-0">
                        {transactionsError ? (
                            <LoadError
                                title="Transactions failed to load"
                                detail={(transactionsError as Error).message}
                                onRetry={() => void refetchTransactions()}
                            />
                        ) : (
                            <>
                                <Table variant="data" containerClassName="hidden xl:block" className="min-w-[900px]">
                                    <TableHeader>
                                        <TableRow>
                                            {columnVisibility.order && (
                                                <TableHead>
                                                    <Button variant="ghost" onClick={() => toggleSort('order_number')} className="-ml-2 h-8 px-2">
                                                        Order #
                                                        {getSortIndicator('order_number')}
                                                    </Button>
                                                </TableHead>
                                            )}
                                            {columnVisibility.merchant && (
                                                <TableHead>{headLabel('Merchant', 'The business that processed this payment.')}</TableHead>
                                            )}
                                            {columnVisibility.customer && (
                                                <TableHead>{headLabel('Customer', 'Name on the card or entered at checkout. May be blank for anonymous orders.')}</TableHead>
                                            )}
                                            {columnVisibility.method && (
                                                <TableHead>{headLabel('Method', 'How the customer paid — card (credit/debit) or cash.')}</TableHead>
                                            )}
                                            {columnVisibility.card && (
                                                <TableHead>{headLabel('Card', 'Card brand (Visa, Mastercard, Amex…) and last 4 digits of the card used.')}</TableHead>
                                            )}
                                            {columnVisibility.entry && (
                                                <TableHead>{headLabel('Entry', 'How the card was read: Chip (EMV insert), Contactless (tap), Swipe, or Manual (keyed in). Chip and Contactless are the most secure entry methods.')}</TableHead>
                                            )}
                                            {columnVisibility.subtotal && (
                                                <TableHead className="text-right">{headLabel('Subtotal', 'Order total before tax, tip, and discounts are applied.')}</TableHead>
                                            )}
                                            {columnVisibility.tax && (
                                                <TableHead className="text-right">{headLabel('Tax', 'Sales tax collected on this order, calculated at the rate configured for the location.')}</TableHead>
                                            )}
                                            {columnVisibility.tip && (
                                                <TableHead className="text-right">{headLabel('Tip', 'Gratuity added by the customer. Tips can be adjusted after the initial authorization and before batch settlement.')}</TableHead>
                                            )}
                                            {columnVisibility.discount && (
                                                <TableHead className="text-right">{headLabel('Discount', 'Any promotional discount, coupon, or comp applied to this order before the final total was charged.')}</TableHead>
                                            )}
                                            {columnVisibility.total && (
                                                <TableHead className="text-right">
                                                    <Button variant="ghost" onClick={() => toggleSort('total_amount')} className="-mr-2 h-8 px-2">
                                                        Total
                                                        {getSortIndicator('total_amount')}
                                                    </Button>
                                                </TableHead>
                                            )}
                                            {columnVisibility.payStatus && (
                                                <TableHead>{headLabel('Status', 'Current payment status. Captured = funds collected. Authorized = card approved but not yet settled. Refunded = money returned. Void = cancelled before settlement.')}</TableHead>
                                            )}
                                            {columnVisibility.staff && (
                                                <TableHead>{headLabel('Staff', 'The staff member who processed or took this order on the POS terminal.')}</TableHead>
                                            )}
                                            {columnVisibility.date && (
                                                <TableHead>
                                                    <Button variant="ghost" onClick={() => toggleSort('created_at')} className="-ml-2 h-8 px-2">
                                                        Date
                                                        {getSortIndicator('created_at')}
                                                    </Button>
                                                </TableHead>
                                            )}
                                            <TableHead className="w-12">
                                                <span className="sr-only">Actions</span>
                                            </TableHead>
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
                                        ) : transactions.length === 0 ? (
                                            <TableEmptyRow colSpan={totalVisibleColumns} title={emptyTitle} hint={emptyHint} />
                                        ) : transactions.map((tx) => {
                                            const isExpanded = expandedTransactionId === tx.id
                                            return (
                                                <Fragment key={tx.id}>
                                                    {/* `data-state`, not a bg class: the data variant's row
                                                        fill out-specifies a class on the row (§5.1). */}
                                                    <TableRow
                                                        data-state={isExpanded ? 'selected' : undefined}
                                                        aria-expanded={isExpanded}
                                                        className="cursor-pointer"
                                                        onClick={() => openTransactionDetails(tx.id)}
                                                    >
                                                        {columnVisibility.order && (
                                                            <TableCell className="font-mono text-xs">
                                                                {tx.order_number
                                                                    ? highlightText(tx.order_number, searchQuery)
                                                                    : <span className="text-muted-foreground">—</span>}
                                                            </TableCell>
                                                        )}
                                                        {columnVisibility.merchant && (
                                                            <TableCell className="font-medium">
                                                                {highlightText(tx.merchant_name, searchQuery)}
                                                                {tx.location_name && (
                                                                    <div className="text-xs font-normal text-muted-foreground">{tx.location_name}</div>
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
                                                                    <span className="text-muted-foreground">—</span>
                                                                )}
                                                            </TableCell>
                                                        )}
                                                        {columnVisibility.entry && (
                                                            <TableCell className="text-sm text-muted-foreground">
                                                                {getEntryModeLabel(tx)}
                                                            </TableCell>
                                                        )}
                                                        {columnVisibility.subtotal && (
                                                            <TableCell className="text-right tabular-nums">{formatCurrency(tx.subtotal_amount)}</TableCell>
                                                        )}
                                                        {columnVisibility.tax && (
                                                            <TableCell className="text-right tabular-nums">{formatCurrency(tx.tax_amount)}</TableCell>
                                                        )}
                                                        {columnVisibility.tip && (
                                                            <TableCell className="text-right tabular-nums">{formatOptionalCurrency(tx.tip_amount)}</TableCell>
                                                        )}
                                                        {columnVisibility.discount && (
                                                            <TableCell className="text-right tabular-nums">{formatOptionalCurrency(tx.discount_amount)}</TableCell>
                                                        )}
                                                        {columnVisibility.total && (
                                                            <TableCell className="text-right font-medium tabular-nums">
                                                                {formatCurrency(tx.total_amount)}
                                                            </TableCell>
                                                        )}
                                                        {columnVisibility.payStatus && (
                                                            <TableCell>{getPaymentStatusBadge(tx.status)}</TableCell>
                                                        )}
                                                        {columnVisibility.staff && (
                                                            <TableCell>{tx.staff_name || <span className="text-muted-foreground">—</span>}</TableCell>
                                                        )}
                                                        {columnVisibility.date && (
                                                            <TableCell className="text-sm text-muted-foreground tabular-nums">
                                                                {formatTxDate(tx.created_at)}
                                                            </TableCell>
                                                        )}
                                                        <TableCell onClick={(event) => event.stopPropagation()}>
                                                            {renderRowActions(tx)}
                                                        </TableCell>
                                                    </TableRow>
                                                    {isExpanded && (
                                                        <TableRow data-state="selected">
                                                            <TableCell colSpan={totalVisibleColumns} className="whitespace-normal p-0">
                                                                <TransactionDetailInlinePanel transactionId={tx.id} />
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </Fragment>
                                            )
                                        })}
                                    </TableBody>
                                </Table>

                                {/* Below `xl` each transaction is a card (§5.3). The card
                                    and the row open the same detail panel. */}
                                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                                    {isTableLoading ? (
                                        <RecordCardSkeletons count={4} />
                                    ) : transactions.length === 0 ? (
                                        <CardGridEmpty title={emptyTitle} hint={emptyHint} />
                                    ) : (
                                        transactions.map((tx) => {
                                            const isExpanded = expandedTransactionId === tx.id
                                            const orderLabel = tx.order_number || 'No order #'
                                            return (
                                                <RecordCard
                                                    key={tx.id}
                                                    selected={isExpanded}
                                                    className={isExpanded ? 'sm:col-span-2' : undefined}
                                                >
                                                    {/* A stretched button makes the whole summary the
                                                        control, while the actions menu stays its own
                                                        button above it — never a div with onClick. */}
                                                    <div className="relative">
                                                        <button
                                                            type="button"
                                                            aria-expanded={isExpanded}
                                                            aria-label={`${isExpanded ? 'Hide' : 'Show'} details for order ${orderLabel}`}
                                                            onClick={() => openTransactionDetails(tx.id)}
                                                            className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        />
                                                        <div className="pointer-events-none relative flex items-start gap-2">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-baseline justify-between gap-3">
                                                                    <p className="truncate font-semibold">
                                                                        {highlightText(tx.merchant_name, searchQuery)}
                                                                    </p>
                                                                    <p className="shrink-0 font-semibold tabular-nums">
                                                                        {formatCurrency(tx.total_amount)}
                                                                    </p>
                                                                </div>
                                                                <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                                                                    <span className="font-mono">
                                                                        {tx.order_number ? highlightText(tx.order_number, searchQuery) : '—'}
                                                                    </span>
                                                                    {' · '}
                                                                    {formatTxDate(tx.created_at)}
                                                                </p>
                                                                <CardFields>
                                                                    <CardField label="Status" value={PAYMENT_STATUS_LABELS[tx.status] ?? tx.status} />
                                                                    <CardField
                                                                        label="Method"
                                                                        value={
                                                                            tx.card_last_four
                                                                                ? `${getMethodLabel(tx.payment_method)} ****${tx.card_last_four}`
                                                                                : getMethodLabel(tx.payment_method)
                                                                        }
                                                                    />
                                                                    <CardField label="Customer" value={highlightText(getCustomerLabel(tx.customer_name), searchQuery)} />
                                                                    <CardField label="Tip" value={formatOptionalCurrency(tx.tip_amount)} />
                                                                    {tx.location_name && <CardField label="Location" value={tx.location_name} />}
                                                                    {tx.staff_name && <CardField label="Staff" value={tx.staff_name} />}
                                                                </CardFields>
                                                            </div>
                                                            <div className="pointer-events-auto -mr-1 -mt-1 shrink-0">
                                                                {renderRowActions(tx)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {isExpanded && (
                                                        <div className="mt-4 min-w-0">
                                                            <TransactionDetailInlinePanel transactionId={tx.id} />
                                                        </div>
                                                    )}
                                                </RecordCard>
                                            )
                                        })
                                    )}
                                </div>

                                <PaginationBar
                                    pagination={pagination}
                                    onPageChange={setPage}
                                    isLoading={transactionsFetching}
                                    itemLabel="transactions"
                                />
                                {!isTableLoading && totalTransactions > 0 && totalTransactions <= PAGE_SIZE && (
                                    <p className="mt-3 text-xs text-muted-foreground tabular-nums sm:text-sm">
                                        {totalTransactions.toLocaleString()} {totalTransactions === 1 ? 'transaction' : 'transactions'}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </PanelSection>
            </Panel>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                {/* Pill rail (§4.5). Classes are literal, not tokens (C7). */}
                <div ref={tabRailRef} className="thin-scrollbar relative w-full min-w-0 overflow-x-auto pb-1">
                    <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                        {TABS.map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                <TabsContent value="payments" className="mt-4">
                    <Panel>
                        <PanelSection
                            label="Payments ledger"
                            caption="Processor payments with fees, net deposits, and settlement status"
                        >
                            <PaymentsLedger initialMerchantIds={filters.merchantIds} />
                        </PanelSection>
                    </Panel>
                </TabsContent>
                <TabsContent value="settlements" className="mt-4">
                    <Panel>
                        <PanelSection
                            label={
                                <span className="inline-flex items-center gap-1">
                                    Batch reconciliation
                                    <InfoIcon tip="A batch groups all card payments submitted to the processor in a single settlement run (usually daily). Each batch shows the gross amount, any refunds, and the net deposit — the amount actually sent to the merchant's bank. A discrepancy means the batch total doesn't match the sum of linked order payments." />
                                </span>
                            }
                            caption="Compare settlement batches against linked order payments and flag mismatches"
                        >
                            <BatchReconciliationSection />
                        </PanelSection>
                    </Panel>
                </TabsContent>
                <TabsContent value="disputes" className="mt-4">
                    <Panel>
                        <PanelSection
                            label={
                                <span className="inline-flex items-center gap-1">
                                    Chargebacks
                                    <InfoIcon tip="A chargeback is when a customer disputes a charge with their bank. The bank reverses the transaction and the merchant must defend it or lose the funds. Each dispute has a deadline — missing it forfeits the right to contest." />
                                </span>
                            }
                            caption="Review disputes, deadlines, and defense status across merchants"
                        >
                            <ChargebacksSection />
                        </PanelSection>
                    </Panel>
                </TabsContent>
                <TabsContent value="audit" className="mt-4">
                    <Panel>
                        <PanelSection
                            label={
                                <span className="inline-flex items-center gap-1">
                                    Payment audit log
                                    <InfoIcon tip="Immutable record of every time an admin accessed, searched, exported, or viewed payment data. Used to demonstrate compliance with data privacy requirements and to investigate unauthorized access." />
                                </span>
                            }
                            caption="Admin access to sensitive payment data: list, detail, export, and card-last-four search"
                        >
                            <AuditLogSection />
                        </PanelSection>
                    </Panel>
                </TabsContent>
            </Tabs>

            {/* A two-button question stays a centred card at every width (§13.1). */}
            <AlertDialog open={!!refundTarget} onOpenChange={(open) => !open && setRefundTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm refund</AlertDialogTitle>
                        <AlertDialogDescription>
                            You are about to refund order{' '}
                            <span className="font-semibold">{refundTarget?.order_number || refundTarget?.order_id}</span>{' '}
                            for <span className="font-semibold tabular-nums">{formatCurrency(refundTarget?.total_amount)}</span>.
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
                            {isRefunding ? 'Refunding…' : 'Confirm refund'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </PageShell>
    )
}

// ─── Export (wrapped in Suspense for useSearchParams) ───────────────────────

export default function TransactionsPage() {
    return (
        <Suspense fallback={<TransactionsPageSkeleton />}>
            <TransactionsPageInner />
        </Suspense>
    )
}
