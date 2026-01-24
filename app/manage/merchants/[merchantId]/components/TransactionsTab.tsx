'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import {
    RefreshCw,
    Eye,
    DollarSign,
    TrendingUp,
    CreditCard,
    Receipt,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// Admin hooks
import {
    useAdminTransactions,
    useAdminTransactionSummary,
    useAdminOrderDetails,
    type AdminTransactionFilters,
} from '@/lib/queries/use-admin-merchant'

// Types
import type { MerchantDetails } from '@/types/merchant'

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount)

const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
}

const getStatusBadgeVariant = (status: string) => {
    switch (status?.toLowerCase()) {
        case 'completed':
        case 'paid':
            return 'default'
        case 'pending':
            return 'secondary'
        case 'refunded':
            return 'destructive'
        default:
            return 'outline'
    }
}

const getPaymentMethodLabel = (method: string) => {
    switch (method?.toLowerCase()) {
        case 'cash':
            return 'Cash'
        case 'card':
        case 'credit_card':
            return 'Card'
        case 'debit_card':
            return 'Debit'
        default:
            return method || 'Unknown'
    }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface TransactionsTabProps {
    merchantDetails?: MerchantDetails | null
}

export function TransactionsTab({ merchantDetails }: TransactionsTabProps) {
    const [page, setPage] = useState(1)
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
    const [filters, setFilters] = useState<AdminTransactionFilters>({})
    const pageSize = 20

    // Get merchant UUID and locations from merchantDetails
    const merchantId = merchantDetails?.id ?? ''
    const locations = merchantDetails?.locations ?? []

    // Calculate date range for summary (last 30 days)
    const thirtyDaysAgo = useMemo(() => {
        const date = new Date()
        date.setDate(date.getDate() - 30)
        date.setHours(0, 0, 0, 0)
        return date
    }, [])
    const today = useMemo(() => new Date(), [])

    // Fetch data
    const {
        data: transactionsData,
        isLoading: transactionsLoading,
        refetch: refetchTransactions,
        isFetching,
    } = useAdminTransactions(merchantId, filters, page, pageSize)

    const { data: summary, isLoading: summaryLoading } = useAdminTransactionSummary(
        merchantId,
        thirtyDaysAgo,
        today,
        filters.locationId
    )

    const { data: orderDetails, isLoading: orderDetailsLoading } = useAdminOrderDetails(
        merchantId,
        selectedOrderId
    )

    const transactions = transactionsData?.transactions || []
    const totalPages = transactionsData ? Math.ceil(transactionsData.total / pageSize) : 0

    // Filter handlers
    const handleFilterChange = (key: keyof AdminTransactionFilters, value: string | undefined) => {
        setFilters(prev => ({
            ...prev,
            [key]: value === 'all' ? undefined : value,
        }))
        setPage(1)
    }

    const isLoading = !merchantId || transactionsLoading

    return (
        <div className="space-y-6">
            {/* KPI Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                    title="Total Revenue"
                    value={formatCurrency(summary?.totalRevenue || 0)}
                    subtitle="Last 30 days"
                    icon={<DollarSign className="h-4 w-4" />}
                    isLoading={summaryLoading}
                />
                <SummaryCard
                    title="Net Sales"
                    value={formatCurrency(summary?.netSales || 0)}
                    subtitle="After refunds"
                    icon={<TrendingUp className="h-4 w-4" />}
                    variant="success"
                    isLoading={summaryLoading}
                />
                <SummaryCard
                    title="Tips"
                    value={formatCurrency(summary?.totalTips || 0)}
                    subtitle="Total tips collected"
                    icon={<Receipt className="h-4 w-4" />}
                    isLoading={summaryLoading}
                />
                <SummaryCard
                    title="Refunds"
                    value={formatCurrency(summary?.totalRefunds || 0)}
                    subtitle="Total refunded"
                    icon={<CreditCard className="h-4 w-4" />}
                    variant="destructive"
                    isLoading={summaryLoading}
                />
            </div>

            {/* Transactions Table Card */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <CardTitle>Transactions</CardTitle>
                            <CardDescription>
                                {transactionsData?.total || 0} total transactions
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Status Filter */}
                            <Select
                                value={filters.status || 'all'}
                                onValueChange={(value) => handleFilterChange('status', value)}
                            >
                                <SelectTrigger className="w-[140px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="refunded">Refunded</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Payment Method Filter */}
                            <Select
                                value={filters.paymentMethod || 'all'}
                                onValueChange={(value) => handleFilterChange('paymentMethod', value)}
                            >
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="Payment" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Methods</SelectItem>
                                    <SelectItem value="cash">Cash</SelectItem>
                                    <SelectItem value="card">Card</SelectItem>
                                    <SelectItem value="credit_card">Credit Card</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Location Filter */}
                            {locations.length > 0 && (
                                <Select
                                    value={filters.locationId || 'all'}
                                    onValueChange={(value) => handleFilterChange('locationId', value)}
                                >
                                    <SelectTrigger className="w-[160px]">
                                        <SelectValue placeholder="Location" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Locations</SelectItem>
                                        {locations.map((loc) => (
                                            <SelectItem key={loc.id} value={loc.id}>
                                                {loc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}

                            {/* Refresh Button */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => refetchTransactions()}
                                disabled={isFetching}
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" />
                            <p className="font-medium">No transactions found</p>
                            <p className="text-sm">Try adjusting your filters</p>
                        </div>
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Order #</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Payment</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Time</TableHead>
                                        <TableHead className="w-[70px]">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((transaction) => (
                                        <TableRow key={transaction.id}>
                                            <TableCell className="font-medium">
                                                #{transaction.order_number}
                                            </TableCell>
                                            <TableCell>
                                                {transaction.customer_name || 'Guest'}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {formatCurrency(transaction.amount)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {getPaymentMethodLabel(transaction.payment_method)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={getStatusBadgeVariant(transaction.status)}>
                                                    {transaction.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {transaction.location_name || '-'}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {formatDistanceToNow(new Date(transaction.created_at), { addSuffix: true })}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setSelectedOrderId(transaction.order_id)}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between pt-4 border-t mt-4">
                                    <p className="text-sm text-muted-foreground">
                                        Page {page} of {totalPages}
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4 mr-1" />
                                            Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            disabled={page === totalPages}
                                        >
                                            Next
                                            <ChevronRight className="h-4 w-4 ml-1" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Order Details Sheet */}
            <Sheet open={!!selectedOrderId} onOpenChange={() => setSelectedOrderId(null)}>
                <SheetContent className="sm:max-w-lg overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Order Details</SheetTitle>
                        <SheetDescription>
                            {orderDetails ? `Order #${orderDetails.order_number}` : 'Loading...'}
                        </SheetDescription>
                    </SheetHeader>

                    {orderDetailsLoading ? (
                        <div className="space-y-4 mt-6">
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-32 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </div>
                    ) : orderDetails ? (
                        <div className="space-y-6 mt-6">
                            {/* Order Summary */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Status</span>
                                    <Badge variant={getStatusBadgeVariant(orderDetails.status)}>
                                        {orderDetails.status}
                                    </Badge>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Order Type</span>
                                    <span className="capitalize">{orderDetails.order_type?.replace('_', ' ')}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Payment</span>
                                    <span>{getPaymentMethodLabel(orderDetails.payment_method || '')}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Created</span>
                                    <span>{formatDate(orderDetails.created_at)}</span>
                                </div>
                                {orderDetails.location_name && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Location</span>
                                        <span>{orderDetails.location_name}</span>
                                    </div>
                                )}
                                {orderDetails.staff_name && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Staff</span>
                                        <span>{orderDetails.staff_name}</span>
                                    </div>
                                )}
                                {orderDetails.customer_name && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Customer</span>
                                        <span>{orderDetails.customer_name}</span>
                                    </div>
                                )}
                            </div>

                            {/* Order Items */}
                            {orderDetails.order_items && orderDetails.order_items.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="font-medium">Order Items</h4>
                                    <div className="border rounded-lg divide-y">
                                        {orderDetails.order_items.map((item: any) => (
                                            <div key={item.id} className="p-3 flex justify-between">
                                                <div>
                                                    <p className="font-medium">{item.item_name}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        Qty: {item.quantity} × {formatCurrency(item.unit_price)}
                                                    </p>
                                                    {item.notes && (
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Note: {item.notes}
                                                        </p>
                                                    )}
                                                </div>
                                                <p className="font-medium">{formatCurrency(item.subtotal)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Order Totals */}
                            <div className="border rounded-lg p-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Subtotal</span>
                                    <span>{formatCurrency(orderDetails.subtotal)}</span>
                                </div>
                                {orderDetails.tax_amount > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Tax</span>
                                        <span>{formatCurrency(orderDetails.tax_amount)}</span>
                                    </div>
                                )}
                                {orderDetails.tip_amount > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Tip</span>
                                        <span>{formatCurrency(orderDetails.tip_amount)}</span>
                                    </div>
                                )}
                                {orderDetails.discount_amount > 0 && (
                                    <div className="flex justify-between text-sm text-green-600">
                                        <span>Discount</span>
                                        <span>-{formatCurrency(orderDetails.discount_amount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-medium text-lg pt-2 border-t">
                                    <span>Total</span>
                                    <span>{formatCurrency(orderDetails.total_amount)}</span>
                                </div>
                            </div>

                            {/* Payments */}
                            {orderDetails.payments && orderDetails.payments.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="font-medium">Payments</h4>
                                    <div className="border rounded-lg divide-y">
                                        {orderDetails.payments.map((payment: any) => (
                                            <div key={payment.id} className="p-3 flex justify-between items-center">
                                                <div>
                                                    <p className="font-medium capitalize">
                                                        {getPaymentMethodLabel(payment.payment_method)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {formatDate(payment.created_at)}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-medium">{formatCurrency(payment.amount)}</p>
                                                    <Badge variant={getStatusBadgeVariant(payment.status)} className="text-xs">
                                                        {payment.status}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            Order not found
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    )
}

// ============================================================================
// SUMMARY CARD COMPONENT
// ============================================================================

interface SummaryCardProps {
    title: string
    value: string
    subtitle: string
    icon: React.ReactNode
    variant?: 'default' | 'success' | 'destructive'
    isLoading?: boolean
}

function SummaryCard({ title, value, subtitle, icon, variant = 'default', isLoading }: SummaryCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <div className={
                    variant === 'success' ? 'text-green-600' :
                    variant === 'destructive' ? 'text-red-600' :
                    'text-muted-foreground'
                }>
                    {icon}
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <Skeleton className="h-8 w-24" />
                ) : (
                    <>
                        <div className={`text-2xl font-bold ${
                            variant === 'success' ? 'text-green-600' :
                            variant === 'destructive' ? 'text-red-600' :
                            ''
                        }`}>
                            {value}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
