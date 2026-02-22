'use client'

import { Badge } from '@/components/ui/badge'
import { OrderStatus } from '@/types/order-management'
import { cn } from '@/lib/utils'

interface OrderStatusBadgeProps {
    status: OrderStatus
    className?: string
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
    const statusConfig: Record<OrderStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
        draft: {
            label: 'Draft',
            variant: 'outline',
            className: 'bg-gray-100 text-gray-700 border-gray-300',
        },
        pending: {
            label: 'Pending',
            variant: 'default',
            className: 'bg-amber-100 text-amber-800 border-amber-300',
        },
        sent_to_kitchen: {
            label: 'Sent to Kitchen',
            variant: 'default',
            className: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        },
        preparing: {
            label: 'Preparing',
            variant: 'default',
            className: 'bg-blue-100 text-blue-800 border-blue-300',
        },
        ready: {
            label: 'Ready',
            variant: 'default',
            className: 'bg-green-100 text-green-800 border-green-300',
        },
        completed: {
            label: 'Completed',
            variant: 'secondary',
            className: 'bg-gray-100 text-gray-700 border-gray-300',
        },
        cancelled: {
            label: 'Cancelled',
            variant: 'destructive',
            className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-100 dark:border-red-800',
        },
        refunded: {
            label: 'Refunded',
            variant: 'outline',
            className: 'bg-orange-100 text-orange-800 border-orange-300',
        },
        void: {
            label: 'Void',
            variant: 'destructive',
            className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-100 dark:border-red-800',
        },
    }

    const config = statusConfig[status] || statusConfig.draft

    return (
        <Badge
            variant={config.variant}
            className={cn('text-xs font-medium', config.className, className)}
        >
            {config.label}
        </Badge>
    )
}

