'use client'

import * as React from 'react'
import {
    BottomSheet,
    BottomSheetContent,
    BottomSheetHeader,
    BottomSheetBody,
    BottomSheetFooter,
    BottomSheetTitle,
    BottomSheetDescription,
} from '@/components/ui/bottom-sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Order, OrderItem, OrderPayment, OrderItemModifier, OrderResponse, OrderStatusHistory, TableSessionWithEvents } from '@/types/order-management'
import { OrderStatusBadge } from './OrderStatusBadge'
import { PaymentStatusBadge } from './PaymentStatusBadge'
import { cn } from '@/lib/utils'
import {
    Calendar,
    User,
    Phone,
    Utensils,
    ShoppingBag,
    Truck,
    Globe,
    ChefHat,
    DollarSign,
    Printer,
    X,
    RotateCcw,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { GetOrderDetails } from '@/app/dashboard/actions/order'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowRight } from 'lucide-react'
import { OrderStatusTimeline } from './OrderStatusTimeline'

interface OrderDetailSheetProps {
    order: Order | OrderResponse | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

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

export function OrderDetailSheet({ order, open, onOpenChange }: OrderDetailSheetProps) {
    const router = useRouter()

    // Fetch full order details when sheet opens
    const { data: orderDetails, isLoading } = useQuery({
        queryKey: ['order-details', order?.id],
        queryFn: async () => {
            if (!order) return null
            try {
                const details = await GetOrderDetails(order.id)
                return details
            } catch (error) {
                console.error('Error fetching order details:', error)
                return null
            }
        },
        enabled: !!order && open,
    })

    if (!order) return null

    // Use fetched details if available, otherwise use the passed order
    // If order is OrderResponse, use it directly; if Order, we need to fetch details
    const displayOrder = (orderDetails || order) as OrderResponse
    const items = (displayOrder.order_items || []) as (OrderItem & { order_item_modifiers?: OrderItemModifier[] })[]
    const payments = (displayOrder.order_payments || []) as OrderPayment[]
    const statusHistory = (displayOrder.order_status_history || []) as OrderStatusHistory[]
    const tableSessions = (displayOrder.table_sessions || []) as TableSessionWithEvents[]

    const handleViewMoreDetails = () => {
        onOpenChange(false)
        router.push(`/dashboard/orders/${displayOrder.id}`)
    }

    return (
        <BottomSheet open={open} onOpenChange={onOpenChange}>
            <BottomSheetContent height="95">
                <BottomSheetHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <BottomSheetTitle>
                                Order #{displayOrder.display_number || displayOrder.order_number}
                            </BottomSheetTitle>
                            <BottomSheetDescription>
                                {formatDate(displayOrder.created_at)}
                            </BottomSheetDescription>
                        </div>
                        <OrderStatusBadge status={displayOrder.status} />
                    </div>
                </BottomSheetHeader>

                <BottomSheetBody>
                    <div className="space-y-6">
                        {/* Order Info */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                {getOrderTypeIcon(displayOrder.order_type)}
                                <span className="text-sm font-medium capitalize">
                                    {displayOrder.order_type.replace('_', ' ')}
                                </span>
                            </div>

                            {/* Customer Info */}
                            {(displayOrder.customer_name || displayOrder.customer_phone || displayOrder.table_number) && (
                                <div className="space-y-2 rounded-lg border p-4">
                                    <h3 className="text-sm font-semibold">Customer Information</h3>
                                    <div className="space-y-1.5 text-sm">
                                        {displayOrder.customer_name && (
                                            <div className="flex items-center gap-2">
                                                <User className="h-4 w-4 text-muted-foreground" />
                                                <span>{displayOrder.customer_name}</span>
                                            </div>
                                        )}
                                        {displayOrder.customer_phone && (
                                            <div className="flex items-center gap-2">
                                                <Phone className="h-4 w-4 text-muted-foreground" />
                                                <span>{displayOrder.customer_phone}</span>
                                            </div>
                                        )}
                                        {displayOrder.table_number && (
                                            <div className="flex items-center gap-2">
                                                <Utensils className="h-4 w-4 text-muted-foreground" />
                                                <span>Table {displayOrder.table_number}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Payment Status */}
                            <div className="flex items-center justify-between rounded-lg border p-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">Payment Status</p>
                                    <PaymentStatusBadge status={displayOrder.payment_status} className="mt-1" />
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-muted-foreground">Total</p>
                                    <p className="text-lg font-bold">{formatCurrency(displayOrder.total_amount)}</p>
                                </div>
                            </div>
                        </div>

                        <Separator />

                        {/* Order Items */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold">Order Items</h3>
                            {isLoading ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-16 w-full" />
                                    <Skeleton className="h-16 w-full" />
                                </div>
                            ) : items.length > 0 ? (
                                <div className="space-y-3">
                                    {items.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-start justify-between rounded-lg border p-3"
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
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {item.item_description}
                                                    </p>
                                                )}
                                                {item.selected_size_name && (
                                                    <p className="text-xs text-muted-foreground">
                                                        Size: {item.selected_size_name}
                                                    </p>
                                                )}
                                                {/* Modifiers */}
                                                {item.order_item_modifiers && item.order_item_modifiers.length > 0 && (
                                                    <div className="mt-2 space-y-1">
                                                        {item.order_item_modifiers.map((modifier) => (
                                                            <div
                                                                key={modifier.id}
                                                                className="text-xs text-muted-foreground pl-3 border-l-2 border-muted"
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
                                                    <p className="text-xs text-muted-foreground italic mt-1">
                                                        Note: {item.special_instructions}
                                                    </p>
                                                )}
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Qty: {item.quantity} × {formatCurrency(item.unit_price)}
                                                </p>
                                            </div>
                                            <div className="text-right ml-4">
                                                <p className="font-medium">
                                                    {formatCurrency(item.subtotal)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No items found</p>
                            )}
                        </div>

                        <Separator />

                        {/* Pricing Breakdown */}
                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold">Pricing Breakdown</h3>
                            <div className="space-y-1.5 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Subtotal</span>
                                    <span>{formatCurrency(displayOrder.subtotal)}</span>
                                </div>
                                {displayOrder.tax_amount > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Tax</span>
                                        <span>{formatCurrency(displayOrder.tax_amount)}</span>
                                    </div>
                                )}
                                {displayOrder.tip_amount > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Tip</span>
                                        <span>{formatCurrency(displayOrder.tip_amount)}</span>
                                    </div>
                                )}
                                {displayOrder.discount_amount > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Discount</span>
                                        <span className="text-green-600">
                                            -{formatCurrency(displayOrder.discount_amount)}
                                        </span>
                                    </div>
                                )}
                                {displayOrder.service_charge > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Service Charge</span>
                                        <span>{formatCurrency(displayOrder.service_charge)}</span>
                                    </div>
                                )}
                                <Separator />
                                <div className="flex justify-between font-semibold text-base">
                                    <span>Total</span>
                                    <span>{formatCurrency(displayOrder.total_amount)}</span>
                                </div>
                                {displayOrder.amount_paid > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Amount Paid</span>
                                        <span className="text-green-600">
                                            {formatCurrency(displayOrder.amount_paid)}
                                        </span>
                                    </div>
                                )}
                                {displayOrder.amount_due > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Amount Due</span>
                                        <span className="text-amber-600">
                                            {formatCurrency(displayOrder.amount_due)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Payment History */}
                        {payments.length > 0 && (
                            <>
                                <Separator />
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold">Payment History</h3>
                                    <div className="space-y-2">
                                        {payments.map((payment: OrderPayment) => (
                                            <div
                                                key={payment.id}
                                                className="flex items-center justify-between rounded-lg border p-3"
                                            >
                                                <div>
                                                    <p className="text-sm font-medium capitalize">
                                                        {payment.payment_method.replace('_', ' ')}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {formatDate(payment.initiated_at)}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <PaymentStatusBadge status={payment.status} />
                                                    <p className="text-sm font-medium mt-1">
                                                        {formatCurrency(payment.total_amount)}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Special Instructions */}
                        {displayOrder.special_instructions && (
                            <>
                                <Separator />
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold">Special Instructions</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {displayOrder.special_instructions}
                                    </p>
                                </div>
                            </>
                        )}

                        {/* Order Status Timeline */}
                        {(statusHistory.length > 0 || tableSessions.length > 0 || displayOrder.created_at) && (
                            <>
                                <Separator />
                                <OrderStatusTimeline
                                    statusHistory={statusHistory}
                                    currentStatus={displayOrder.status}
                                    createdAt={displayOrder.created_at}

                                    tableSessions={tableSessions}
                                />
                            </>
                        )}

                    </div>
                </BottomSheetBody>

                <BottomSheetFooter>
                    <div className="flex flex-col gap-2 w-full">
                        <Button
                            variant="default"
                            className="w-full"
                            size="sm"
                            onClick={handleViewMoreDetails}
                        >
                            View More Details
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" className="flex-1" size="sm">
                                <Printer className="h-4 w-4 mr-2" />
                                Print Receipt
                            </Button>
                            {displayOrder.status !== 'void' && displayOrder.status !== 'cancelled' && (
                                <>
                                    <Button variant="outline" className="flex-1" size="sm">
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                        Refund
                                    </Button>
                                    <Button variant="destructive" className="flex-1" size="sm">
                                        <X className="h-4 w-4 mr-2" />
                                        Void
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </BottomSheetFooter>
            </BottomSheetContent>
        </BottomSheet>
    )
}

