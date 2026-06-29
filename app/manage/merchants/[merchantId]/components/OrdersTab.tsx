'use client'

import { useMemo, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
    ShoppingBag,
    DollarSign,
    TrendingUp,
    Ban,
    RotateCcw,
    RefreshCcwDot,
    Filter,
    Utensils,
    Download,
    MapPin,
    X,
} from 'lucide-react'
import { getAdminOrders } from '@/app/manage/actions/admin-merchant/orders'
import { isOrderReportable } from '@/lib/reporting/recognized-order'
import { OrdersDataTable } from '@/components/dashboard/orders/OrdersDataTable'
import { OrderDetailSheet } from '@/components/dashboard/orders/OrderDetailSheet'
import { DateRangePicker, type DatePreset } from '@/components/dashboard/orders/DateRangePicker'
import { Empty } from '@/components/ui/empty'
import type { MerchantDetails, LocationSummary } from '@/types/merchant'
import type {
    OrderResponse,
    OrderStatus,
    OrderType,
} from '@/types/order-management'

interface OrdersTabProps {
    merchantInfo: MerchantDetails
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount)
}

function formatOrderTypeLabel(type: OrderType | string): string {
    if (type === 'qr_dine_in') return 'QR Table'
    return type.replace(/_/g, ' ')
}

function downloadCSV(orders: OrderResponse[], locationsMap: Map<string, string>) {
    const headers = [
        'Order #',
        'Date',
        'Type',
        'Status',
        'Payment Status',
        'Items',
        'Total',
        'Location',
        'Customer',
    ]

    const rows = orders.map((o) => [
        o.display_number || o.order_number,
        new Date(o.created_at).toLocaleString(),
        formatOrderTypeLabel(o.order_type),
        o.status,
        o.payment_status,
        (o.order_items || []).reduce(
            (sum, i) => sum + (i.is_voided ? 0 : Number(i.quantity) || 1),
            0
        ),
        o.total_amount.toFixed(2),
        locationsMap.get(o.location_id) ?? '',
        o.customer_name || '',
    ])

    const csv = [
        headers.join(','),
        ...rows.map((r) =>
            r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
        ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

export function OrdersTab({ merchantInfo }: OrdersTabProps) {
    const [selectedLocationId, setSelectedLocationId] = useState<string>('all')
    const [dateFrom, setDateFrom] = useState<Date | null>(null)
    const [dateTo, setDateTo] = useState<Date | null>(null)
    const [datePreset, setDatePreset] = useState<DatePreset>('last_7_days')
    const [statusFilters, setStatusFilters] = useState<OrderStatus[]>([])
    const [typeFilters, setTypeFilters] = useState<OrderType[]>([])
    const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)

    const locationsMap = useMemo(() => {
        const map = new Map<string, string>()
        for (const loc of merchantInfo.locations) {
            map.set(loc.id, loc.name)
        }
        return map
    }, [merchantInfo.locations])

    const {
        data: ordersData,
        isLoading,
        refetch,
    } = useQuery({
        queryKey: [
            'admin-merchant-orders',
            merchantInfo.id,
            selectedLocationId,
            dateFrom,
            dateTo,
            statusFilters,
            typeFilters,
        ],
        queryFn: () =>
            getAdminOrders(merchantInfo.id, {
                dateFrom: dateFrom ?? undefined,
                dateTo: dateTo ?? undefined,
                locationId: selectedLocationId === 'all' ? undefined : selectedLocationId,
                status: statusFilters.length > 0 ? statusFilters : undefined,
                orderType: typeFilters.length > 0 ? typeFilters : undefined,
            }, 1, 500),
        enabled: !!merchantInfo.id,
        staleTime: 10000,
    })

    // Map AdminOrder[] to OrderResponse-like for table compatibility
    const ordersList: OrderResponse[] = useMemo(() => {
        const admins = ordersData?.orders ?? []
        return admins.map((o) => ({
            id: o.id,
            order_number: String(o.order_number ?? o.display_number ?? ''),
            display_number: o.display_number ?? String(o.order_number ?? ''),
            merchant_id: '',
            location_id: o.location_id,
            order_type: o.order_type as OrderResponse['order_type'],
            status: o.status as OrderResponse['status'],
            customer_name: o.customer_name ?? undefined,
            customer_phone: o.customer_phone ?? undefined,
            delivery_platform: o.delivery_platform ?? null,
            order_source: o.order_source ?? null,
            platform_order_number: o.platform_order_number ?? null,
            metadata: o.metadata ?? null,
            table_number: undefined,
            subtotal: o.subtotal,
            tax_amount: o.tax_amount,
            tip_amount: o.tip_amount,
            discount_amount: o.discount_amount,
            service_charge: 0,
            total_amount: o.total_amount,
            payment_status: (o.payment_status as OrderResponse['payment_status']) ?? 'pending',
            amount_paid: o.total_amount,
            amount_due: 0,
            created_at: o.created_at,
            updated_at: o.created_at,
            sync_version: 0,
            order_items: Array.from({ length: o.items_count }, () => ({ quantity: 1, is_voided: false } as any)),
            order_payments: o.payment_method
                ? [{ payment_method: o.payment_method as any }]
                : [],
            order_status_history: [],
            table_sessions: [],
            created_by_staff: o.staff_name
                ? { display_name: o.staff_name, first_name: undefined, last_name: undefined }
                : undefined,
            location: o.location_name ? { name: o.location_name } : undefined,
            items_count: o.items_count,
        } as OrderResponse))
    }, [ordersData?.orders])

    const stats = useMemo(() => {
        const total = ordersList.length
        // Recognized orders (payment collected, not draft/cancelled/void/refunded)
        // drive revenue and AOV so they match every other reporting surface.
        const recognized = ordersList.filter((o) => isOrderReportable(o))
        const revenue = recognized.reduce((sum, o) => sum + o.total_amount, 0)
        const avg = recognized.length > 0 ? revenue / recognized.length : 0
        const voided = ordersList.filter(
            (o) => o.status === 'void' || o.status === 'cancelled'
        ).length
        const refunded = ordersList.filter(
            (o) => o.status === 'refunded'
        ).length

        return { total, revenue, avg, voided, refunded }
    }, [ordersList])

    const handleDateRangeChange = useCallback(
        (from: Date | null, to: Date | null) => {
            setDateFrom(from)
            setDateTo(to)
        },
        []
    )

    const handleStatusToggle = useCallback((status: OrderStatus) => {
        setStatusFilters((prev) =>
            prev.includes(status)
                ? prev.filter((s) => s !== status)
                : [...prev, status]
        )
    }, [])

    const handleTypeToggle = useCallback((type: OrderType) => {
        setTypeFilters((prev) =>
            prev.includes(type)
                ? prev.filter((t) => t !== type)
                : [...prev, type]
        )
    }, [])

    const clearFilters = useCallback(() => {
        setStatusFilters([])
        setTypeFilters([])
        setSelectedLocationId('all')
    }, [])

    const activeFilterCount =
        (statusFilters.length > 0 ? 1 : 0) +
        (typeFilters.length > 0 ? 1 : 0) +
        (selectedLocationId !== 'all' ? 1 : 0)

    const handleOrderClick = (order: OrderResponse) => {
        setSelectedOrder(order)
        setIsDetailOpen(true)
    }

    const handleDetailClose = () => {
        setIsDetailOpen(false)
        setTimeout(() => setSelectedOrder(null), 200)
    }

    const showLocationColumn =
        selectedLocationId === 'all' && merchantInfo.locations.length > 1

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-5">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Orders
                        </CardTitle>
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-16" />
                        ) : (
                            <div className="text-2xl font-bold">
                                {stats.total}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            In selected range
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Revenue
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">
                                {formatCurrency(stats.revenue)}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Paid orders
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Avg. Order
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-16" />
                        ) : (
                            <div className="text-2xl font-bold">
                                {formatCurrency(stats.avg)}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Per order
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Voided
                        </CardTitle>
                        <Ban className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-12" />
                        ) : (
                            <div className="text-2xl font-bold text-red-600">
                                {stats.voided}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Void / cancelled
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Refunded
                        </CardTitle>
                        <RotateCcw className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-12" />
                        ) : (
                            <div className="text-2xl font-bold text-amber-600">
                                {stats.refunded}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Refunded orders
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters + Table */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col space-y-4">
                        <div className="flex items-center justify-between">
                            <CardTitle>
                                Orders &mdash; {merchantInfo.name}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        downloadCSV(ordersList, locationsMap)
                                    }
                                    disabled={ordersList.length === 0}
                                >
                                    <Download className="h-4 w-4 mr-2" />
                                    Export CSV
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => await refetch()}
                                >
                                    <RefreshCcwDot className="h-4 w-4 mr-2" />
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        {/* Filters row */}
                        <div className="flex flex-wrap items-center gap-2">
                            <DateRangePicker
                                dateFrom={dateFrom}
                                dateTo={dateTo}
                                onDateRangeChange={handleDateRangeChange}
                                preset={datePreset}
                                onPresetChange={setDatePreset}
                            />

                            <Separator
                                orientation="vertical"
                                className="h-8"
                            />

                            {/* Location filter */}
                            {merchantInfo.locations.length > 1 && (
                                <Select
                                    value={selectedLocationId}
                                    onValueChange={setSelectedLocationId}
                                >
                                    <SelectTrigger className="w-[200px] h-9 border-dashed">
                                        <MapPin className="mr-2 h-4 w-4 opacity-50" />
                                        <SelectValue placeholder="Location" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            All Locations
                                        </SelectItem>
                                        {merchantInfo.locations.map((loc) => (
                                            <SelectItem
                                                key={loc.id}
                                                value={loc.id}
                                            >
                                                {loc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}

                            {/* Status filter */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-dashed"
                                    >
                                        <Filter className="mr-2 h-4 w-4" />
                                        Status
                                        {statusFilters.length > 0 && (
                                            <Badge
                                                variant="secondary"
                                                className="ml-2 rounded-sm px-1 font-normal"
                                            >
                                                {statusFilters.length}
                                            </Badge>
                                        )}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="start"
                                    className="w-[200px]"
                                >
                                    <DropdownMenuLabel>
                                        Filter by Status
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {(
                                        [
                                            'pending',
                                            'preparing',
                                            'ready',
                                            'completed',
                                            'cancelled',
                                            'void',
                                            'refunded',
                                        ] as OrderStatus[]
                                    ).map((status) => (
                                        <DropdownMenuCheckboxItem
                                            key={status}
                                            checked={statusFilters.includes(
                                                status
                                            )}
                                            onCheckedChange={() =>
                                                handleStatusToggle(status)
                                            }
                                            className="capitalize"
                                        >
                                            {status}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* Type filter */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-dashed"
                                    >
                                        <Utensils className="mr-2 h-4 w-4" />
                                        Type
                                        {typeFilters.length > 0 && (
                                            <Badge
                                                variant="secondary"
                                                className="ml-2 rounded-sm px-1 font-normal"
                                            >
                                                {typeFilters.length}
                                            </Badge>
                                        )}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="start"
                                    className="w-[200px]"
                                >
                                    <DropdownMenuLabel>
                                        Filter by Type
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {(
                                        [
                                            'dine_in',
                                            'takeout',
                                            'delivery',
                                            'online',
                                            'catering',
                                        ] as OrderType[]
                                    ).map((type) => (
                                        <DropdownMenuCheckboxItem
                                            key={type}
                                            checked={typeFilters.includes(type)}
                                            onCheckedChange={() =>
                                                handleTypeToggle(type)
                                            }
                                            className="capitalize"
                                        >
                                            {type.replace('_', ' ')}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {activeFilterCount > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearFilters}
                                    className="h-8 px-2 lg:px-3"
                                >
                                    Reset
                                    <X className="ml-2 h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isLoading && ordersList.length === 0 ? (
                        <div className="space-y-2">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : ordersList.length === 0 ? (
                        <Empty
                            icon={ShoppingBag}
                            title="No orders found"
                            description="Try adjusting your filters or date range to see more results."
                        />
                    ) : (
                        <OrdersDataTable
                            data={ordersList}
                            isLoading={isLoading}
                            onOrderClick={handleOrderClick}
                            readOnly
                            showLocationColumn={showLocationColumn}
                            locationsMap={locationsMap}
                            pageSize={25}
                        />
                    )}
                </CardContent>
            </Card>

            {/* Summary bar */}
            {!isLoading && ordersList.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    <span>
                        <span className="font-medium text-foreground">
                            {stats.total}
                        </span>{' '}
                        orders
                    </span>
                    <span>
                        <span className="font-medium text-foreground">
                            {formatCurrency(stats.revenue)}
                        </span>{' '}
                        total revenue
                    </span>
                    <span>
                        <span className="font-medium text-foreground">
                            {formatCurrency(stats.avg)}
                        </span>{' '}
                        avg
                    </span>
                    {stats.voided > 0 && (
                        <span>
                            <span className="font-medium text-red-600">
                                {stats.voided}
                            </span>{' '}
                            voided
                        </span>
                    )}
                    {stats.refunded > 0 && (
                        <span>
                            <span className="font-medium text-amber-600">
                                {stats.refunded}
                            </span>{' '}
                            refunded
                        </span>
                    )}
                </div>
            )}

            {/* Order Detail Sheet (read-only) */}
            <OrderDetailSheet
                order={selectedOrder}
                open={isDetailOpen && !!selectedOrder}
                onOpenChange={handleDetailClose}
                fullPageUrlPattern={(orderId) =>
                    `/manage/merchants/${merchantInfo.clerk_org_id}/orders/${orderId}`
                }
                readOnly
            />
        </div>
    )
}
