'use client'

import { OrderStatus } from '@/types/order-management'
import { cn } from '@/lib/utils'

interface OrderStatusBadgeProps {
    status: OrderStatus
    className?: string
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
    const statusConfig: Record<OrderStatus, { label: string; textColor: string; bgColor: string }> = {
        draft: {
            label: 'Open',
            textColor: 'text-gray-600 dark:text-gray-400',
            bgColor: 'bg-gray-50 dark:bg-gray-800/40',
        },
        pending: {
            label: 'Pending',
            textColor: 'text-amber-700 dark:text-amber-400',
            bgColor: 'bg-amber-50 dark:bg-amber-900/20',
        },
        sent_to_kitchen: {
            label: 'Sent to Kitchen',
            textColor: 'text-indigo-700 dark:text-indigo-400',
            bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
        },
        preparing: {
            label: 'Preparing',
            textColor: 'text-blue-700 dark:text-blue-400',
            bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        },
        ready: {
            label: 'Ready',
            textColor: 'text-emerald-700 dark:text-emerald-400',
            bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
        },
        completed: {
            label: 'Completed',
            textColor: 'text-gray-500 dark:text-gray-400',
            bgColor: 'bg-gray-50 dark:bg-gray-800/40',
        },
        cancelled: {
            label: 'Cancelled',
            textColor: 'text-rose-600 dark:text-rose-400',
            bgColor: 'bg-rose-50 dark:bg-rose-900/20',
        },
        refunded: {
            label: 'Refunded',
            textColor: 'text-orange-600 dark:text-orange-400',
            bgColor: 'bg-orange-50 dark:bg-orange-900/20',
        },
        void: {
            label: 'Void',
            textColor: 'text-rose-600 dark:text-rose-400',
            bgColor: 'bg-rose-50 dark:bg-rose-900/20',
        },
    }

    const config = statusConfig[status] || statusConfig.draft

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                config.bgColor,
                config.textColor,
                className
            )}
        >
            {config.label}
        </span>
    )
}

