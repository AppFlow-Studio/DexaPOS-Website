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
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
    ChefHat,
    ChevronLeft,
    ChevronsLeft,
    ChevronRight,
    ChevronsRight,
} from 'lucide-react'
import { Order, OrderResponse, OrderType } from '@/types/order-management'
import { OrderStatusBadge } from './OrderStatusBadge'
import { PaymentStatusBadge } from './PaymentStatusBadge'
import { useIsAllLocations, useLocationStore } from '@/stores/location-store'
import { useRouter } from 'next/navigation'

interface OrdersDataTableProps {
    data: OrderResponse[]
    isLoading?: boolean
    onOrderClick?: (order: OrderResponse) => void
    readOnly?: boolean
    showLocationColumn?: boolean
    locationsMap?: Map<string, string>
    pageSize?: number
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
    const configs: Record<OrderType, { icon: React.ReactNode; label: string; className: string }> = {
        dine_in: {
            icon: <Utensils className="h-3 w-3" />,
            label: 'Dine In',
            className: 'bg-blue-100 text-blue-800 border-blue-300',
        },
        takeout: {
            icon: <ShoppingBag className="h-3 w-3" />,
            label: 'Takeout',
            className: 'bg-purple-100 text-purple-800 border-purple-300',
        },
        delivery: {
            icon: <Truck className="h-3 w-3" />,
            label: 'Delivery',
            className: 'bg-green-100 text-green-800 border-green-300',
        },
        online: {
            icon: <Globe className="h-3 w-3" />,
            label: 'Online',
            className: 'bg-orange-100 text-orange-800 border-orange-300',
        },
        catering: {
            icon: <ChefHat className="h-3 w-3" />,
            label: 'Catering',
            className: 'bg-pink-100 text-pink-800 border-pink-300',
        },
    }
    return configs[type] || configs.dine_in
}

export function OrdersDataTable({ data, isLoading, onOrderClick, readOnly, showLocationColumn, locationsMap, pageSize = 50 }: OrdersDataTableProps) {
    const [sorting, setSorting] = React.useState<SortingState>([
        { id: 'created_at', desc: true },
    ])
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
    const [globalFilter, setGlobalFilter] = React.useState('')
    const router = useRouter()
    const isAllLocations = useIsAllLocations()
    const { locations } = useLocationStore()
    const shouldShowLocation = showLocationColumn ?? isAllLocations

    const handleRowClick = (order: OrderResponse) => {
        if (onOrderClick) {
            onOrderClick(order)
        } else {
            router.push(`/dashboard/orders/${order.id}`)
        }
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
                        className="font-medium cursor-pointer hover:text-primary transition-colors text-xs"
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
            header: 'Type',
            cell: ({ row }) => {
                const typeConfig = getOrderTypeConfig(row.original.order_type)
                return (
                    <Badge variant="outline" className={`text-xs gap-1 ${typeConfig.className}`}>
                        {typeConfig.icon}
                        {typeConfig.label}
                    </Badge>
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
                    Status
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
                <div className="text-sm font-semibold">
                    {formatCurrency(row.original.total_amount)}
                </div>
            ),
        },
        {
            accessorKey: 'payment_status',
            id: 'payment_method',
            header: 'Payment method',
            cell: ({ row }) => {
                const order = row.original
                const methods = [...new Set((order.order_payments || []).map((p) => p.payment_method))]
                const methodLabels = methods.map((m) => {
                    if (typeof m === 'string' && m.startsWith('card_')) return 'Card'
                    if (m === 'cash') return 'Cash'
                    if (m === 'gift_card') return 'Gift'
                    return String(m ?? '').replace(/_/g, ' ')
                }).filter(Boolean)
                const summary = methodLabels.length > 0 ? methodLabels.join(', ') : null
                return (
                    <div className="flex flex-col gap-0.5">
                        {summary ? (
                            <span className="text-sm">{summary}</span>
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
            cell: ({ row }) => {
                const order = row.original

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleRowClick(order)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                            </DropdownMenuItem>
                            {!readOnly && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>
                                        <Printer className="mr-2 h-4 w-4" />
                                        Print Receipt
                                    </DropdownMenuItem>
                                    {order.status !== 'void' && order.status !== 'cancelled' && (
                                        <>
                                            <DropdownMenuItem className="text-orange-600">
                                                <RotateCcw className="mr-2 h-4 w-4" />
                                                Refund
                                            </DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive">
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

    const table = useReactTable({
        data,
        columns,
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
            {/* Search */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search orders..."
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id}>
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
                                <TableCell colSpan={columns.length} className="h-24 text-center">
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
                                    className="cursor-pointer"
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
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                        <ShoppingBag className="h-8 w-8" />
                                        <p>No orders found</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Results count */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div>
                    Page {table.getState().pagination.pageIndex + 1} of{" "}
                    {table.getPageCount()}
                </div>
            </div>
            <div className="flex items-center space-x-2">
                <Button
                    variant="outline"
                    size="icon"
                    className="hidden size-8 lg:flex"
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                >
                    <span className="sr-only">Go to first page</span>
                    <ChevronsLeft />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                >
                    <span className="sr-only">Go to previous page</span>
                    <ChevronLeft />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                >
                    <span className="sr-only">Go to next page</span>
                    <ChevronRight />
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    className="hidden size-8 lg:flex"
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                >
                    <span className="sr-only">Go to last page</span>
                    <ChevronsRight />
                </Button>
            </div>
        </div>
    )
}

