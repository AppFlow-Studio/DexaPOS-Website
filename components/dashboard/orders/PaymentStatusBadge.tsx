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

/** Human-readable label per payment status. Presentation is deliberately flat — no per-status colour. */
const STATUS_LABELS: Record<PaymentStatus, string> = {
    pending: 'Awaiting Payment',
    processing: 'Processing',
    authorized: 'Authorized',
    captured: 'Paid',
    failed: 'Failed',
    declined: 'Declined',
    refunded: 'Refunded',
    partially_refunded: 'Partially Refunded',
    void: 'Void',
    paid: 'Paid',
}

export function PaymentStatusBadge({ status, className, prefix }: PaymentStatusBadgeProps) {
    const label = STATUS_LABELS[status] || STATUS_LABELS.pending

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground',
                className
            )}
        >
            {prefix ? `${prefix}: ${label}` : label}
        </span>
    )
}
