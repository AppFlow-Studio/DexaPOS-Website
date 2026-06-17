'use client'

import { OrderStatus } from '@/types/order-management'
import { ORDER_STATUS_LABELS } from '@/lib/constants/order-status'
import { cn } from '@/lib/utils'

interface OrderStatusBadgeProps {
    status: OrderStatus
    className?: string
    /**
     * Optional dimension label (e.g. "Order") rendered as a "{prefix}: {label}" pill.
     * Use on surfaces that show order + payment status side by side, where a bare
     * label can collide (both read "Void" when an order is voided). Leave unset in
     * table columns that already carry a "Status" header.
     */
    prefix?: string
}

export function OrderStatusBadge({ status, className, prefix }: OrderStatusBadgeProps) {
    const statusColors: Record<OrderStatus, { dotColor: string; textColor: string; bgColor: string }> = {
        draft: {
            dotColor: 'bg-gray-400',
            textColor: 'text-gray-600 dark:text-gray-400',
            bgColor: 'bg-gray-50 dark:bg-gray-800/40',
        },
        pending: {
            dotColor: 'bg-amber-400',
            textColor: 'text-amber-700 dark:text-amber-400',
            bgColor: 'bg-amber-50 dark:bg-amber-900/20',
        },
        sent_to_kitchen: {
            dotColor: 'bg-indigo-400',
            textColor: 'text-indigo-700 dark:text-indigo-400',
            bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
        },
        preparing: {
            dotColor: 'bg-blue-400',
            textColor: 'text-blue-700 dark:text-blue-400',
            bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        },
        ready: {
            dotColor: 'bg-emerald-400',
            textColor: 'text-emerald-700 dark:text-emerald-400',
            bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
        },
        completed: {
            dotColor: 'bg-gray-400',
            textColor: 'text-gray-500 dark:text-gray-400',
            bgColor: 'bg-gray-50 dark:bg-gray-800/40',
        },
        cancelled: {
            dotColor: 'bg-rose-400',
            textColor: 'text-rose-600 dark:text-rose-400',
            bgColor: 'bg-rose-50 dark:bg-rose-900/20',
        },
        refunded: {
            dotColor: 'bg-orange-400',
            textColor: 'text-orange-600 dark:text-orange-400',
            bgColor: 'bg-orange-50 dark:bg-orange-900/20',
        },
        void: {
            dotColor: 'bg-rose-400',
            textColor: 'text-rose-600 dark:text-rose-400',
            bgColor: 'bg-rose-50 dark:bg-rose-900/20',
        },
    }

    const colors = statusColors[status] || statusColors.draft
    const config = { ...colors, label: ORDER_STATUS_LABELS[status] ?? ORDER_STATUS_LABELS.draft }

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                config.bgColor,
                config.textColor,
                className
            )}
        >
            <span className={cn('h-1.5 w-1.5 rounded-full', config.dotColor)} />
            {prefix ? `${prefix}: ${config.label}` : config.label}
        </span>
    )
}

