'use client'

import * as React from 'react'
import {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    VisibilityState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,

} from '@tanstack/react-table'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    MoreHorizontal,
    Search,
    ArrowUpDown,
    Eye,
    X,
    Printer,
    RotateCcw,
    Utensils,
    ShoppingBag,
    Truck,
    Globe,
    QrCode,
    ChefHat,
    MapPin,
    ChevronLeft,
    ChevronsLeft,
    ChevronRight,
    ChevronsRight,
    Store,
    Phone,
    SlidersHorizontal,
} from 'lucide-react'
import { Order, OrderResponse, OrderType } from '@/types/order-management'
import { OrderStatusBadge } from './OrderStatusBadge'
import { PaymentStatusBadge } from './PaymentStatusBadge'
import { DeliveryPlatformBadge } from './DeliveryPlatformBadge'
import { useIsAllLocations, useLocationStore } from '@/stores/location-store'
import { useRouter } from 'next/navigation'
import {
    orderSourceLabel,
    platformLabel,
    isKnownPlatform,
} from '@/lib/orderout/platform'
import { PlatformBadge } from './PlatformBadge'
import { ReceiptModal } from './ReceiptModal'
import { RefundVoidDialog, type RefundVoidAction } from './RefundVoidDialog'
import { useColumnPreferences } from '@/app/dashboard/hooks/useColumnPreferences'

interface OrdersDataTableProps {
    data: OrderResponse[]
    isLoading?: boolean
    onOrderClick?: (order: OrderResponse) => void
    readOnly?: boolean
    showLocationColumn?: boolean
    locationsMap?: Map<string, string>
    pageSize?: number
    hideOrderStatus?: boolean
}

// Format date to "Today at 9:53 pm" or "Dec 15 at 2:30 pm"
function formatOrderDate(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const orderDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    const isToday = orderDate.getTime() === today.getTime()

    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'pm' : 'am'
    const displayHours = hours % 12 || 12
    const displayMinutes = minutes.toString().padStart(2, '0')
    const timeString = `${displayHours}:${displayMinutes} ${ampm}`

    if (isToday) {
        return `Today at ${timeString}`
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = months[date.getMonth()]
    const day = date.getDate()

    return `${month} ${day} at ${timeString}`
}

// Format currency
function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount)
}

// Get order type icon and label
function getOrderTypeConfig(type: OrderType) {
    const configs: Record<OrderType, { icon: React.ReactNode; label: string }> = {
        dine_in: {
            icon: <Utensils className="h-3 w-3 text-muted-foreground" />,
            label: 'Dine In',
        },
        qr_dine_in: {
            icon: <QrCode className="h-3 w-3 text-[#0C4FD1]" />,
            label: 'QR Dine-In',
        },
        takeout: {
            icon: <ShoppingBag className="h-3 w-3 text-muted-foreground" />,
            label: 'Takeout',
        },
        delivery: {
            icon: <Truck className="h-3 w-3 text-muted-foreground" />,
            label: 'Delivery',
        },
        online: {
            icon: <Globe className="h-3 w-3 text-muted-foreground" />,
            label: 'Online',
        },
        catering: {
            icon: <ChefHat className="h-3 w-3 text-muted-foreground" />,
            label: 'Catering',
        },
    }
    return configs[type] || configs.dine_in
}

// Icon for each order_source channel (mirrors ORDER_SOURCE_META.iconKey in
// lib/orderout/platform.ts, kept here so the helper stays framework-agnostic).
function getChannelIcon(source: string | null | undefined) {
    switch (source) {
        case 'orderout':
            return <Truck className="h-3 w-3" />
        case 'online_store':
        case 'online': // legacy pre-backfill value
            return <Globe className="h-3 w-3" />
        case 'phone':
            return <Phone className="h-3 w-3" />
        case 'pos':
        default:
            return <Store className="h-3 w-3" />
    }
}

// localStorage key for persisted column visibility on the Orders list.
const ORDERS_COLUMN_VIS_KEY = 'orders-table-columns-v1'

// Human labels for the Columns show/hide menu (TanStack column ids → label).
const COLUMN_LABELS: Record<string, string> = {
    order_display: '#ID',
    created_at: 'Date',
    order_type: 'Order Type',
    channel: 'Channel',
    table: 'Table',
    status: 'Order Status',
    item_count: 'Items',
    total_amount: 'Total',
    payment_method: 'Payment',
    created_by: 'Staff',
}

export function OrdersDataTable({ data, isLoading, onOrderClick, readOnly, showLocationColumn, locationsMap, pageSize = 50, hideOrderStatus = false }: OrdersDataTableProps) {
    const [sorting, setSorting] = React.useState<SortingState>([
        { id: 'created_at', desc: true },
    ])
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
    // Column visibility persists per-user in Supabase (user_ui_preferences) so it
    // follows the user across devices; localStorage backs it as an instant-paint
    // cache + offline fallback. See useColumnPreferences.
    const { columnVisibility, setColumnVisibility } = useColumnPreferences(
        'orders.columns',
        ORDERS_COLUMN_VIS_KEY,
    )
    const [globalFilter, setGlobalFilter] = React.useState('')
    const router = useRouter()
    const isAllLocations = useIsAllLocations()
    const { locations, setSelectedLocation } = useLocationStore()
    const shouldShowLocation = showLocationColumn ?? isAllLocations

    // Row actions. Print Receipt opens the receipt; Refund and Void open their
    // confirmation directly rather than routing through it. Previously none of
    // the three had a handler, so the click fell through to the row and opened
    // the detail sheet instead.
    const [receiptOrder, setReceiptOrder] = React.useState<OrderResponse | null>(null)
    const [refundVoidOrder, setRefundVoidOrder] = React.useState<OrderResponse | null>(null)
    const [refundVoidAction, setRefundVoidAction] = React.useState<RefundVoidAction>('refund')

    const openRefundVoid = (order: OrderResponse, action: RefundVoidAction) => {
        setRefundVoidAction(action)
        setRefundVoidOrder(order)
    }

    const receiptLocation = React.useMemo(() => {
        if (!receiptOrder?.location_id) return null
        return locations.find((l) => l.id === receiptOrder.location_id) ?? null
    }, [receiptOrder, locations])

    const handleRowClick = (order: OrderResponse) => {
        if (onOrderClick) {
            onOrderClick(order)
        } else {
            router.push(`/dashboard/orders/${order.id}`)
        }
    }

    const handleViewOnFloorPlan = (order: OrderResponse) => {
        if (order.location_id) {
            setSelectedLocation(order.location_id)
        }
        router.push('/dashboard/tables')
    }

    const getCreatedByName = (order: OrderResponse): string => {
        const staff = order.created_by_staff
        if (staff) {
            const name = staff.display_name || `${staff.first_name ?? ''} ${staff.last_name ?? ''}`.trim()
            if (name) return name
        }
        const user = order.created_by_user
        if (user) {
            const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
            if (name) return name
        }
        return '—'
    }

    const columns: ColumnDef<OrderResponse>[] = [
        {
            accessorKey: 'display_number',
            id: 'order_display',
            enableHiding: false, // #ID is always visible (ticket requirement)
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="h-8 px-2"
                >
                    #ID
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            accessorFn: (row) => row.display_number || row.order_number || '',
            cell: ({ row }) => {
                const order = row.original
                const display = order.display_number || order.order_number
                return (
                    <div
                        className="font-mono font-medium cursor-pointer hover:text-primary transition-colors text-xs text-foreground/80"
                        onClick={() => handleRowClick(order)}
                    >
                        {display}
                    </div>
                )
            },
        },
        {
            accessorKey: 'created_at',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="h-8 px-2"
                >
                    Date
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <div className="text-sm text-muted-foreground">
                    {formatOrderDate(row.original.created_at)}
                </div>
            ),
        },
        {
            accessorKey: 'order_type',
            header: 'Order Type',
            cell: ({ row }) => {
                const order = row.original
                const typeConfig = getOrderTypeConfig(order.order_type)
                return (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            {typeConfig.icon}
                            <span className="font-medium text-foreground/80">{typeConfig.label}</span>
                        </span>
                        <DeliveryPlatformBadge order={order} />
                    </div>
                )
            },
        },
        {
            id: 'channel',
            header: 'Channel',
            // Order origin: the canonical order_source, plus the delivery marketplace
            // (logo/name) for OrderOut orders. Falls back to metadata.delivery_company
            // so pre-backfill rows still render the platform. accessorFn feeds global
            // search + keeps the value sortable/filterable.
            accessorFn: (row) => {
                const r = row as OrderResponse & { metadata?: Record<string, any> | null }
                const platform =
                    r.delivery_platform || (r.metadata?.delivery_company as string | undefined) || ''
                return `${orderSourceLabel(r.order_source)} ${platformLabel(platform)}`.trim()
            },
            cell: ({ row }) => {
                const order = row.original as OrderResponse & {
                    metadata?: Record<string, any> | null
                }
                const source = order.order_source
                // No channel recorded (older POS rows): show a muted dash.
                if (!source) {
                    return <span className="text-sm text-muted-foreground/50">—</span>
                }
                // Treat legacy pre-backfill rows (order_source 'online' but
                // metadata.provider 'orderout') as OrderOut so they still brand.
                const isOrderOut =
                    source === 'orderout' || order.metadata?.provider === 'orderout'
                const rawPlatform =
                    order.delivery_platform ||
                    (order.metadata?.delivery_company as string | undefined) ||
                    ''
                // Only brand with a logo when there's a real marketplace name.
                // OrderOut rows with a missing/placeholder platform ('orderout')
                // show the generic "Delivery App" channel instead of echoing it.
                if (isOrderOut && isKnownPlatform(rawPlatform)) {
                    return <PlatformBadge platform={rawPlatform} className="text-xs" />
                }
                return (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        {getChannelIcon(isOrderOut ? 'orderout' : source)}
                        <span className="font-medium text-foreground/80">
                            {isOrderOut ? orderSourceLabel('orderout') : orderSourceLabel(source)}
                        </span>
                    </span>
                )
            },
        },
        {
            id: 'table',
            header: 'Table',
            // Reference column so a row can be traced to its physical table for
            // audit without opening the receipt. Dine-in / QR show the table
            // number; other order types have no table. Merged dine-in checks
            // resolve all their tables inside the order detail / receipt.
            accessorFn: (row) =>
                row.order_type === 'dine_in' || row.order_type === 'qr_dine_in'
                    ? row.table_number || ''
                    : '',
            cell: ({ row }) => {
                const order = row.original
                const isDineIn =
                    order.order_type === 'dine_in' ||
                    order.order_type === 'qr_dine_in'
                if (!isDineIn || !order.table_number) {
                    return <span className="text-sm text-muted-foreground/50">—</span>
                }
                return (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#0C4FD1]">
                        <MapPin className="h-3 w-3" />
                        {order.table_number}
                    </span>
                )
            },
        },
        {
            accessorKey: 'status',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="h-8 px-2"
                >
                    Order Status
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
        },
        {
            id: 'item_count',
            header: 'Items',
            accessorFn: (row) => {
                if (typeof (row as any).items_count === 'number') return (row as any).items_count
                return (row.order_items || []).reduce(
                    (sum, i) => sum + (i.is_voided ? 0 : Number(i.quantity) || 1),
                    0
                )
            },
            cell: ({ row }) => {
                const order = row.original as OrderResponse & { items_count?: number }
                const count = typeof order.items_count === 'number'
                    ? order.items_count
                    : (order.order_items || []).reduce(
                        (sum, i) => sum + (i.is_voided ? 0 : Number(i.quantity) || 1),
                        0
                    )
                return <div className="text-sm tabular-nums">{count}</div>
            },
        },
        {
            accessorKey: 'total_amount',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="h-8 px-2"
                >
                    Total
                    <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
            ),
            cell: ({ row }) => (
                <div className="text-sm font-medium tabular-nums text-foreground">
                    {formatCurrency(row.original.total_amount)}
                </div>
            ),
        },
        {
            accessorKey: 'payment_status',
            id: 'payment_method',
            header: hideOrderStatus ? 'Payment status' : 'Payment method',
            cell: ({ row }) => {
                const order = row.original
                const payments = order.order_payments || []
                const methods = [...new Set(payments.map((p) => p.payment_method))]

                // Build rich labels with card info
                const methodLabels = methods.map((m) => {
                    if (typeof m === 'string' && m.startsWith('card_')) {
                        // Find the first card payment to get brand/last4
                        const cardPayment = payments.find((p) => p.payment_method === m)
                        const brand = cardPayment?.card_type
                            ? cardPayment.card_type.charAt(0).toUpperCase() + cardPayment.card_type.slice(1).toLowerCase()
                            : null
                        const last4 = cardPayment?.card_last_four
                        if (brand && last4) return `${brand} •••• ${last4}`
                        if (last4) return `Card •••• ${last4}`
                        if (brand) return brand
                        return 'Card'
                    }
                    if (m === 'cash') return 'Cash'
                    if (m === 'gift_card') return 'Gift Card'
                    if (m === 'house_account') return 'House Account'
                    if (m === 'external') return 'External'
                    return String(m ?? '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                }).filter(Boolean)

                const summary = methodLabels.length > 0 ? methodLabels.join(', ') : null
                // In Financials/Transactions (hideOrderStatus), payment status is the
                // only status surfaced — so always show the badge, with the method text
                // beneath it when available. Elsewhere, fall back to the badge only when
                // no payment method is present.
                if (hideOrderStatus) {
                    return (
                        <div className="flex flex-col gap-0.5">
                            <PaymentStatusBadge status={order.payment_status} />
                            {summary && (
                                <span className="text-sm text-muted-foreground">{summary}</span>
                            )}
                        </div>
                    )
                }
                return (
                    <div className="flex flex-col gap-0.5">
                        {summary ? (
                            <span className="text-sm text-muted-foreground">{summary}</span>
                        ) : (
                            <PaymentStatusBadge status={order.payment_status} />
                        )}
                    </div>
                )
            },
        },
        {
            id: 'created_by',
            header: 'Staff',
            accessorFn: (row) => getCreatedByName(row),
            cell: ({ row }) => (
                <div className="text-sm text-muted-foreground">
                    {getCreatedByName(row.original)}
                </div>
            ),
        },
        {
            id: 'actions',
            enableHiding: false,
            cell: ({ row }) => {
                const order = row.original

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            {/* Opening the menu must not also trigger the row's
                                own click handler (which opens the detail sheet). */}
                            <Button
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            className="rounded-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleRowClick(order)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                            </DropdownMenuItem>
                            {order.order_type === 'qr_dine_in' && order.table_number ? (
                                <DropdownMenuItem onClick={() => handleViewOnFloorPlan(order)}>
                                    <MapPin className="mr-2 h-4 w-4" />
                                    View on Floor Plan
                                </DropdownMenuItem>
                            ) : null}
                            {!readOnly && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setReceiptOrder(order)}>
                                        <Printer className="mr-2 h-4 w-4" />
                                        Print Receipt
                                    </DropdownMenuItem>
                                    {order.status !== 'void' && order.status !== 'cancelled' && (
                                        <>
                                            <DropdownMenuItem
                                                className="text-orange-600"
                                                onClick={() => openRefundVoid(order, 'refund')}
                                            >
                                                <RotateCcw className="mr-2 h-4 w-4" />
                                                Refund
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="text-destructive"
                                                onClick={() => openRefundVoid(order, 'void')}
                                            >
                                                <X className="mr-2 h-4 w-4" />
                                                Void Order
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            },
        },
    ]

    const visibleColumns = hideOrderStatus
        ? columns.filter((c) => (c as { accessorKey?: string }).accessorKey !== 'status')
        : columns

    const table = useReactTable({
        data,
        columns: visibleColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(), // Required for pagination
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onGlobalFilterChange: setGlobalFilter,
        initialState: {
            pagination: {
                pageSize,
            },
        },
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            globalFilter,
        },

    })


    return (
        <div className="space-y-4">
            {/* Search + column visibility */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                    <Input
                        placeholder="Search orders..."
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="rounded-full border-0 bg-muted/60 pl-9 shadow-none focus-visible:bg-background"
                    />
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto rounded-full border-0 bg-muted/60 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                        >
                            <SlidersHorizontal className="mr-2 h-4 w-4" />
                            Columns
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[180px] rounded-2xl">
                        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {table
                            .getAllColumns()
                            .filter((column) => column.getCanHide())
                            .map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column.id}
                                    checked={column.getIsVisible()}
                                    onCheckedChange={(value) =>
                                        column.toggleVisibility(!!value)
                                    }
                                    onSelect={(e) => e.preventDefault()}
                                >
                                    {COLUMN_LABELS[column.id] ?? column.id}
                                </DropdownMenuCheckboxItem>
                            ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Table. No box of its own — the page container is the only frame,
                so rows are separated by hairlines alone.

                The rounding goes on Table's own scroll container rather than an
                extra wrapper: nesting overflow-hidden around its overflow-x-auto
                created a second scroll context that reserved a scrollbar gutter
                (dead space) below the rows. */}
            <Table containerClassName="rounded-xl">
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="border-border/60 hover:bg-transparent">
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id} className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                    header.column.columnDef.header,
                                                    header.getContext()
                                                )}
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={visibleColumns.length} className="h-24 text-center">
                                    <div className="flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && 'selected'}
                                    className="cursor-pointer border-border/30 transition-colors hover:bg-muted/40"
                                    onClick={() => handleRowClick(row.original)}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={visibleColumns.length} className="h-24 text-center">
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        <ShoppingBag className="h-8 w-8" />
                                        <p>No orders found</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

            {/* Results count & Pagination */}
            <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-muted-foreground/70">
                    Page {table.getState().pagination.pageIndex + 1} of{" "}
                    {table.getPageCount()}
                </div>
                <div className="flex items-center space-x-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="hidden size-8 lg:flex"
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <span className="sr-only">Go to first page</span>
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <span className="sr-only">Go to previous page</span>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        <span className="sr-only">Go to next page</span>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="hidden size-8 lg:flex"
                        onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                        disabled={!table.getCanNextPage()}
                    >
                        <span className="sr-only">Go to last page</span>
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Print Receipt. No admin actions here — Refund and Void are their
                own menu items and open the dialog below directly. */}
            {receiptOrder && (
                <ReceiptModal
                    order={receiptOrder}
                    location={receiptLocation}
                    open={!!receiptOrder}
                    onOpenChange={(open) => !open && setReceiptOrder(null)}
                />
            )}

            {/* Sibling of the receipt, never nested inside it — see the note in
                RefundVoidDialog on why nesting makes it unclickable. */}
            <RefundVoidDialog
                order={refundVoidOrder}
                action={refundVoidAction}
                open={!!refundVoidOrder}
                onOpenChange={(open) => !open && setRefundVoidOrder(null)}
                onCompleted={() => router.refresh()}
            />
        </div>
    )
}

