'use client'

import { useMemo, useState } from 'react'
import { useIsAllLocations, useSelectedLocation } from '@/stores/location-store'
import { useOrders } from '../hooks/useOrder'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    ShoppingBag,
    Clock,
    CheckCircle,
    DollarSign,
    MapPin,
    Globe,
    RefreshCcwDot,
} from 'lucide-react'
import { OrdersDataTable } from '@/components/dashboard/orders/OrdersDataTable'
import { Order, OrderResponse, OrderStatus } from '@/types/order-management'
import { OrderDetailSheet } from '@/components/dashboard/orders/OrderDetailSheet'
import { Empty } from '@/components/ui/empty'
import { Button } from '@/components/ui/button'

export default function OrdersPage() {
    const selectedLocation = useSelectedLocation()
    const isAllLocations = useIsAllLocations()
    const { data: orders, isLoading, refetch: refetchOrders } = useOrders()

    const [selectedOrder, setSelectedOrder] = useState<OrderResponse | null>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')

    const ordersList = Array.isArray(orders) ? orders : []

    // Filter orders by status
    const filteredOrders = useMemo(() => {
        if (statusFilter === 'all') {
            return ordersList
        }
        return ordersList.filter(order => order.status === statusFilter)
    }, [ordersList, statusFilter])

    // Calculate stats for today
    const stats = useMemo(() => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const todayOrders = ordersList.filter(order => {
            const orderDate = new Date(order.created_at)
            orderDate.setHours(0, 0, 0, 0)
            return orderDate.getTime() === today.getTime()
        })

        const totalToday = todayOrders.length
        const pendingToday = todayOrders.filter(
            o => o.status === 'pending' || o.status === 'preparing'
        ).length
        const completedToday = todayOrders.filter(o => o.status === 'completed').length
        const revenueToday = todayOrders
            .filter(o => o.status === 'completed')
            .reduce((sum, o) => sum + o.total_amount, 0)

        return {
            total: totalToday,
            pending: pendingToday,
            completed: completedToday,
            revenue: revenueToday,
        }
    }, [ordersList])

    const handleOrderClick = (order: OrderResponse) => {
        setSelectedOrder(order)
        setIsDetailOpen(true)
    }

    const handleDetailClose = () => {
        setIsDetailOpen(false)
        setTimeout(() => setSelectedOrder(null), 200)
    }
    console.log(orders)

    return (
        <main className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
                        {isAllLocations ? (
                            <Badge variant="outline" className="gap-1">
                                <Globe className="h-3 w-3" />
                                All Locations
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="gap-1">
                                <MapPin className="h-3 w-3" />
                                {selectedLocation?.name}
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        View and manage all orders across your locations
                    </p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-16" />
                        ) : (
                            <div className="text-2xl font-bold">{stats.total}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Today</p>
                    </CardContent>
                </Card>

                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-16" />
                        ) : (
                            <div className="text-2xl font-bold text-amber-600">
                                {stats.pending}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">Pending & Preparing</p>
                    </CardContent>
                </Card>

                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Completed</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-16" />
                        ) : (
                            <div className="text-2xl font-bold text-green-600">
                                {stats.completed}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">Completed today</p>
                    </CardContent>
                </Card>

                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-20" />
                        ) : (
                            <div className="text-2xl font-bold">
                                ${stats.revenue.toFixed(2)}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">Today</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Tabs and Orders Table */}
            <Card>
                <CardHeader className='w-full'>
                    <div className="flex flex-col items-start justify-between w-full">
                        <CardTitle>All Orders</CardTitle>
                        <CardDescription className=' flex flex-row justify-between w-full'>
                            <div className=''>View and manage orders. Click on an order to view details.</div>
                            <div className=''>
                                <Button variant="outline" className='hover:bg-accent hover:text-accent-foreground cursor-pointer' size="sm" onClick={async () => await refetchOrders()}>
                                    <RefreshCcwDot className="h-4 w-4" />
                                    Refresh Orders
                                </Button>
                            </div>
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Status Filter Tabs */}
                    <Tabs
                        value={statusFilter}
                        onValueChange={(value) => setStatusFilter(value as OrderStatus | 'all')}
                    >
                        <TabsList>
                            <TabsTrigger value="all">All</TabsTrigger>
                            <TabsTrigger value="pending">Pending</TabsTrigger>
                            <TabsTrigger value="preparing">Preparing</TabsTrigger>
                            <TabsTrigger value="ready">Ready</TabsTrigger>
                            <TabsTrigger value="completed">Completed</TabsTrigger>
                            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
                            <TabsTrigger value="void">Void</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {/* Orders Table */}
                    {isLoading && ordersList.length === 0 ? (
                        <div className="space-y-2">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : filteredOrders.length === 0 ? (
                        <Empty
                            icon={ShoppingBag}
                            title={ordersList.length === 0 ? 'No orders yet' : 'No orders found'}
                            description={
                                ordersList.length === 0
                                    ? 'Orders will appear here once customers start placing orders'
                                    : `No orders found with status "${statusFilter}"`
                            }
                        />
                    ) : (
                        <OrdersDataTable
                            data={filteredOrders}
                            isLoading={isLoading}
                            onOrderClick={handleOrderClick}
                        />
                    )}
                </CardContent>
            </Card>

            {/* Order Detail Sheet */}
            <OrderDetailSheet
                order={selectedOrder}

                open={isDetailOpen && !!selectedOrder}
                onOpenChange={handleDetailClose}
            />
        </main>
    )
}

