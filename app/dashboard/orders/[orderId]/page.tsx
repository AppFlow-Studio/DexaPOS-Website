'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { GetOrderDetails } from '../../actions/order'
import { OrderStatusBadge } from '@/components/dashboard/orders/OrderStatusBadge'
import { PaymentStatusBadge } from '@/components/dashboard/orders/PaymentStatusBadge'
import {
    ArrowLeft,
    Calendar,
    User,
    Phone,
    Utensils,
    ShoppingBag,
    Truck,
    Globe,
    ChefHat,
    Printer,
    X,
    RotateCcw,
} from 'lucide-react'
import { Order, OrderItem, OrderPayment, OrderResponse, OrderItemModifier } from '@/types/order-management'

// Format currency
function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount)
}

// Format date
function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    })
}

// Get order type icon
function getOrderTypeIcon(type: string) {
    const icons: Record<string, React.ReactNode> = {
        dine_in: <Utensils className="h-4 w-4" />,
        takeout: <ShoppingBag className="h-4 w-4" />,
        delivery: <Truck className="h-4 w-4" />,
        online: <Globe className="h-4 w-4" />,
        catering: <ChefHat className="h-4 w-4" />,
    }
    return icons[type] || <ShoppingBag className="h-4 w-4" />
}

export default function OrderDetailPage() {
    const params = useParams()
    const router = useRouter()
    const orderId = params.orderId as string

    const { data: orderDetails, isLoading } = useQuery({
        queryKey: ['order-details', orderId],
        queryFn: async () => {
            try {
                const details = await GetOrderDetails(orderId)
                return details
            } catch (error) {
                console.error('Error fetching order details:', error)
                throw error
            }
        },
        enabled: !!orderId,
    })

    // Extract order data from OrderResponse structure
    const order = orderDetails
    const items: (OrderItem & { order_item_modifiers?: OrderItemModifier[] })[] = orderDetails?.order_items || []
    const payments: OrderPayment[] = orderDetails?.order_payments || []

    if (isLoading) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10" />
                    <Skeleton className="h-8 w-64" />
                </div>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-48" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-32 w-full" />
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (!order) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Orders
                </Button>
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">Order not found</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">
                                Order #{order.display_number || order.order_number}
                            </h1>
                            <OrderStatusBadge status={order.status} />
                        </div>
                        <p className="text-muted-foreground mt-1">
                            {formatDate(order.created_at)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                        <Printer className="h-4 w-4 mr-2" />
                        Print Receipt
                    </Button>
                    {order.status !== 'void' && order.status !== 'cancelled' && (
                        <>
                            <Button variant="outline" size="sm">
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Refund
                            </Button>
                            <Button variant="destructive" size="sm">
                                <X className="h-4 w-4 mr-2" />
                                Void
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Main Content */}
                <div className="md:col-span-2 space-y-6">
                    {/* Order Type */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Order Type</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                {getOrderTypeIcon(order.order_type)}
                                <span className="text-sm font-medium capitalize">
                                    {order.order_type.replace('_', ' ')}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Customer Information */}
                    {(order.customer_name || order.customer_phone || order.table_number) && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Customer Information</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {order.customer_name && (
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        <span>{order.customer_name}</span>
                                    </div>
                                )}
                                {order.customer_phone && (
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-4 w-4 text-muted-foreground" />
                                        <span>{order.customer_phone}</span>
                                    </div>
                                )}
                                {order.table_number && (
                                    <div className="flex items-center gap-2">
                                        <Utensils className="h-4 w-4 text-muted-foreground" />
                                        <span>Table {order.table_number}</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Order Items */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Order Items</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {items.length > 0 ? (
                                <div className="space-y-3">
                                    {items.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-start justify-between rounded-lg border p-4"
                                        >
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{item.item_name}</span>
                                                    {item.is_voided && (
                                                        <Badge variant="destructive" className="text-xs">
                                                            Voided
                                                        </Badge>
                                                    )}
                                                </div>
                                                {item.item_description && (
                                                    <p className="text-sm text-muted-foreground mt-1">
                                                        {item.item_description}
                                                    </p>
                                                )}
                                                {item.selected_size_name && (
                                                    <p className="text-sm text-muted-foreground">
                                                        Size: {item.selected_size_name}
                                                    </p>
                                                )}
                                                {/* Modifiers */}
                                                {item.order_item_modifiers && item.order_item_modifiers.length > 0 && (
                                                    <div className="mt-2 space-y-1">
                                                        {item.order_item_modifiers.map((modifier) => (
                                                            <div
                                                                key={modifier.id}
                                                                className="text-sm text-muted-foreground pl-3 border-l-2 border-muted"
                                                            >
                                                                {modifier.modifier_group_name}: {modifier.modifier_name}
                                                                {modifier.quantity > 1 && ` (×${modifier.quantity})`}
                                                                {modifier.price_modifier > 0 && (
                                                                    <span className="ml-1">
                                                                        +{formatCurrency(modifier.price_modifier)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {item.special_instructions && (
                                                    <p className="text-sm text-muted-foreground italic mt-1">
                                                        Note: {item.special_instructions}
                                                    </p>
                                                )}
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    Qty: {item.quantity} × {formatCurrency(item.unit_price)}
                                                </p>
                                            </div>
                                            <div className="text-right ml-4">
                                                <p className="font-semibold">
                                                    {formatCurrency(item.subtotal)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No items found</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Payment History */}
                    {payments.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Payment History</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {payments.map((payment) => (
                                        <div
                                            key={payment.id}
                                            className="flex items-center justify-between rounded-lg border p-4"
                                        >
                                            <div>
                                                <p className="text-sm font-medium capitalize">
                                                    {payment.payment_method.replace('_', ' ')}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {formatDate(payment.initiated_at)}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <PaymentStatusBadge status={payment.status} />
                                                <p className="text-sm font-semibold mt-1">
                                                    {formatCurrency(payment.total_amount)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Payment Status */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Payment Status</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <PaymentStatusBadge status={order.payment_status} />
                            <Separator />
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Total</span>
                                    <span className="font-semibold text-lg">
                                        {formatCurrency(order.total_amount)}
                                    </span>
                                </div>
                                {order.amount_paid > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Amount Paid</span>
                                        <span className="text-green-600 font-medium">
                                            {formatCurrency(order.amount_paid)}
                                        </span>
                                    </div>
                                )}
                                {order.amount_due > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Amount Due</span>
                                        <span className="text-amber-600 font-medium">
                                            {formatCurrency(order.amount_due)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Pricing Breakdown */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Pricing Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Subtotal</span>
                                <span>{formatCurrency(order.subtotal)}</span>
                            </div>
                            {order.tax_amount > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Tax</span>
                                    <span>{formatCurrency(order.tax_amount)}</span>
                                </div>
                            )}
                            {order.tip_amount > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Tip</span>
                                    <span>{formatCurrency(order.tip_amount)}</span>
                                </div>
                            )}
                            {order.discount_amount > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Discount</span>
                                    <span className="text-green-600">
                                        -{formatCurrency(order.discount_amount)}
                                    </span>
                                </div>
                            )}
                            {order.service_charge > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Service Charge</span>
                                    <span>{formatCurrency(order.service_charge)}</span>
                                </div>
                            )}
                            <Separator />
                            <div className="flex justify-between font-semibold text-base">
                                <span>Total</span>
                                <span>{formatCurrency(order.total_amount)}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Special Instructions */}
                    {order.special_instructions && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Special Instructions</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    {order.special_instructions}
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}

