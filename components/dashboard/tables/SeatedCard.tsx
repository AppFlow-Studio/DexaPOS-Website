'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { TableWithSession } from '@/types/floor-plan'
import { OrderResponse } from '@/types/order-management'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Users, Clock, DollarSign, Eye, ArrowRight, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { TableStatusBadge } from './TableStatusBadge'
import { GetOrderDetails } from '@/app/dashboard/actions/order'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { OrderItem, OrderItemModifier } from '@/types/order-management'
import { cn } from '@/lib/utils'

interface SeatedCardProps {
    table: TableWithSession
    onViewOrder?: (tableId: string, orderId?: string) => void
    onTransfer?: (tableId: string) => void
    onClose?: (tableId: string) => void
}

// Format currency
function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount)
}

export function SeatedCard({ table, onViewOrder, onTransfer, onClose }: SeatedCardProps) {
    const session = table.session
    if (!session) return null

    const minutesSeated = session.minutes_seated || 0
    const hasOrder = !!session.order_id
    const [isItemsExpanded, setIsItemsExpanded] = React.useState(false)

    // Fetch order details if order_id exists
    const { data: orderDetails, isLoading: isLoadingOrder } = useQuery<OrderResponse | null>({
        queryKey: ['order-details', session.order_id],
        queryFn: async () => {
            if (!session.order_id) return null
            try {
                const details = await GetOrderDetails(session.order_id)
                return details
            } catch (error) {
                console.error('Error fetching order details:', error)
                return null
            }
        },
        enabled: hasOrder,
    })

    return (
        <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <CardTitle className="text-base">{table.name}</CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-4">
                            {session.guest_name && (
                                <span className="font-medium">{session.guest_name}</span>
                            )}
                            <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {session.party_size}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {Math.round(minutesSeated)} min
                            </span>
                        </CardDescription>
                    </div>
                    <TableStatusBadge status={session.status} />
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <div className="space-y-3">
                    {/* Order/Bill Information */}
                    {hasOrder && (
                        <div className="space-y-2">
                            {isLoadingOrder ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                </div>
                            ) : orderDetails ? (
                                <>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <DollarSign className="h-4 w-4" />
                                            Subtotal
                                        </span>
                                        <span className="font-medium">
                                            {formatCurrency(orderDetails.subtotal)}
                                        </span>
                                    </div>
                                    {orderDetails.tax_amount > 0 && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Tax</span>
                                            <span className="font-medium">
                                                {formatCurrency(orderDetails.tax_amount)}
                                            </span>
                                        </div>
                                    )}
                                    {orderDetails.tip_amount > 0 && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Tip</span>
                                            <span className="font-medium">
                                                {formatCurrency(orderDetails.tip_amount)}
                                            </span>
                                        </div>
                                    )}
                                    {orderDetails.discount_amount > 0 && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Discount</span>
                                            <span className="font-medium text-green-600">
                                                -{formatCurrency(orderDetails.discount_amount)}
                                            </span>
                                        </div>
                                    )}
                                    {orderDetails.service_charge > 0 && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Service Charge</span>
                                            <span className="font-medium">
                                                {formatCurrency(orderDetails.service_charge)}
                                            </span>
                                        </div>
                                    )}
                                    <Separator />
                                    <div className="flex items-center justify-between text-base font-semibold">
                                        <span className="flex items-center gap-1">
                                            <DollarSign className="h-4 w-4" />
                                            Total
                                        </span>
                                        <span>{formatCurrency(orderDetails.total_amount)}</span>
                                    </div>
                                    {orderDetails.amount_paid > 0 && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Amount Paid</span>
                                            <span className="font-medium text-green-600">
                                                {formatCurrency(orderDetails.amount_paid)}
                                            </span>
                                        </div>
                                    )}
                                    {orderDetails.amount_due > 0 && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Amount Due</span>
                                            <span className="font-medium text-orange-600">
                                                {formatCurrency(orderDetails.amount_due)}
                                            </span>
                                        </div>
                                    )}
                                    {/* Order Items - Collapsible */}
                                    {orderDetails.order_items && orderDetails.order_items.length > 0 && (
                                        <Collapsible open={isItemsExpanded} onOpenChange={setIsItemsExpanded}>
                                            <div className="mt-2 pt-2 border-t">
                                                <CollapsibleTrigger className="w-full flex items-center justify-between text-left hover:bg-accent rounded-md p-2 -m-2 transition-colors">
                                                    <p className="text-xs text-muted-foreground">
                                                        {orderDetails.order_items.length} item
                                                        {orderDetails.order_items.length !== 1 ? 's' : ''}
                                                    </p>
                                                    {isItemsExpanded ? (
                                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </CollapsibleTrigger>
                                                <CollapsibleContent className="mt-2 space-y-3">
                                                    {orderDetails.order_items.map((item: OrderItem & { order_item_modifiers?: OrderItemModifier[] }) => (
                                                        <div
                                                            key={item.id}
                                                            className="border rounded-lg p-3 space-y-2 bg-muted/30"
                                                        >
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="text-sm font-medium">
                                                                            {item.item_name}
                                                                        </p>
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
                                                                            {item.order_item_modifiers.map((modifier: OrderItemModifier) => (
                                                                                <div
                                                                                    key={modifier.id}
                                                                                    className="text-xs text-muted-foreground pl-3 border-l-2 border-muted"
                                                                                >
                                                                                    {modifier.modifier_group_name}: {modifier.modifier_name}
                                                                                    {modifier.quantity > 1 && ` (×${modifier.quantity})`}
                                                                                    {modifier.price_modifier > 0 && (
                                                                                        <span className="ml-1 font-medium">
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
                                                                    <p className="font-medium text-sm">
                                                                        {formatCurrency(item.subtotal)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </CollapsibleContent>
                                            </div>
                                        </Collapsible>
                                    )}
                                </>
                            ) : (
                                <div className="text-sm text-muted-foreground">
                                    Unable to load order details
                                </div>
                            )}
                        </div>
                    )}

                    {/* Guest Notes */}
                    {session.guest_notes && (
                        <div className="pt-2 border-t">
                            <p className="text-sm text-muted-foreground">{session.guest_notes}</p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                        {hasOrder && onViewOrder && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onViewOrder(table.id, session.order_id)}
                                className="flex-1"
                            >
                                <Eye className="h-4 w-4 mr-2" />
                                View Order
                            </Button>
                        )}
                        {onTransfer && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onTransfer(table.id)}
                                className="flex-1"
                            >
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Transfer
                            </Button>
                        )}
                        {onClose && (
                            <Button variant="ghost" size="sm" onClick={() => onClose(table.id)}>
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

