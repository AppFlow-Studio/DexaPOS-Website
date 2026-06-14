'use client'

import { PaymentStatus } from '@/types/order-management'
import { cn } from '@/lib/utils'

interface PaymentStatusBadgeProps {
    status: PaymentStatus
    className?: string
    /**
     * Optional dimension label (e.g. "Payment") rendered as a "{prefix}: {label}" pill.
     * Use on surfaces that show order + payment status side by side, where a bare
     * label can collide (both read "Void" when an order is voided). Leave unset in
     * table columns that already carry a "Payment" header.
     */
    prefix?: string
}

export function PaymentStatusBadge({ status, className, prefix }: PaymentStatusBadgeProps) {
    const statusConfig: Record<PaymentStatus, { label: string; dotColor: string; textColor: string; bgColor: string }> = {
        pending: {
            label: 'Awaiting Payment',
            dotColor: 'bg-amber-400',
            textColor: 'text-amber-700 dark:text-amber-400',
            bgColor: 'bg-amber-50 dark:bg-amber-900/20',
        },
        processing: {
            label: 'Processing',
            dotColor: 'bg-blue-400',
            textColor: 'text-blue-600 dark:text-blue-400',
            bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        },
        authorized: {
            label: 'Authorized',
            dotColor: 'bg-blue-400',
            textColor: 'text-blue-600 dark:text-blue-400',
            bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        },
        captured: {
            label: 'Paid',
            dotColor: 'bg-emerald-400',
            textColor: 'text-emerald-700 dark:text-emerald-400',
            bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
        },
        failed: {
            label: 'Failed',
            dotColor: 'bg-rose-400',
            textColor: 'text-rose-600 dark:text-rose-400',
            bgColor: 'bg-rose-50 dark:bg-rose-900/20',
        },
        declined: {
            label: 'Declined',
            dotColor: 'bg-rose-400',
            textColor: 'text-rose-600 dark:text-rose-400',
            bgColor: 'bg-rose-50 dark:bg-rose-900/20',
        },
        refunded: {
            label: 'Refunded',
            dotColor: 'bg-orange-400',
            textColor: 'text-orange-600 dark:text-orange-400',
            bgColor: 'bg-orange-50 dark:bg-orange-900/20',
        },
        partially_refunded: {
            label: 'Partially Refunded',
            dotColor: 'bg-orange-400',
            textColor: 'text-orange-600 dark:text-orange-400',
            bgColor: 'bg-orange-50 dark:bg-orange-900/20',
        },
        void: {
            label: 'Void',
            dotColor: 'bg-gray-400',
            textColor: 'text-gray-500 dark:text-gray-400',
            bgColor: 'bg-gray-50 dark:bg-gray-800/40',
        },
        paid: {
            label: 'Paid',
            dotColor: 'bg-emerald-400',
            textColor: 'text-emerald-700 dark:text-emerald-400',
            bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
        }
    }

    const config = statusConfig[status] || statusConfig.pending

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
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

