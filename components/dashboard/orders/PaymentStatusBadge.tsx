'use client'

import { PaymentStatus } from '@/types/order-management'
import { StatusBadge } from '@/components/ui/status-badge'

interface PaymentStatusBadgeProps {
    status: PaymentStatus | string
    className?: string
    /**
     * Optional dimension label (e.g. "Payment") rendered as a "{prefix}: {label}" pill.
     * Use on surfaces that show order + payment status side by side, where a bare
     * label can collide (both read "Void" when an order is voided). Leave unset in
     * table columns that already carry a "Payment" header.
     */
    prefix?: string
}

/** Human-readable label per payment status. */
const STATUS_LABELS: Record<PaymentStatus, string> = {
    pending: 'Awaiting Payment',
    processing: 'Processing',
    authorized: 'Authorized',
    captured: 'Paid',
    failed: 'Failed',
    declined: 'Declined',
    partial: 'Partially Paid',
    refunded: 'Refunded',
    partially_refunded: 'Partially Refunded',
    void: 'Void',
    paid: 'Paid',
}

export function PaymentStatusBadge({ status, className, prefix }: PaymentStatusBadgeProps) {
    const label = STATUS_LABELS[status as PaymentStatus] || STATUS_LABELS.pending

    return (
        <StatusBadge
            status={status}
            label={prefix ? `${prefix}: ${label}` : label}
            className={className}
        />
    )
}
