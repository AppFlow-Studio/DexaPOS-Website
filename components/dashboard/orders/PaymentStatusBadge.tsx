'use client'

import { Badge } from '@/components/ui/badge'
import { PaymentStatus } from '@/types/order-management'
import { cn } from '@/lib/utils'

interface PaymentStatusBadgeProps {
    status: PaymentStatus
    className?: string
}

export function PaymentStatusBadge({ status, className }: PaymentStatusBadgeProps) {
    const statusConfig: Record<PaymentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
        pending: {
            label: 'Payment Pending',
            variant: 'default',
            className: 'bg-amber-100 text-amber-800 border-amber-300',
        },
        processing: {
            label: 'Processing',
            variant: 'default',
            className: 'bg-blue-100 text-blue-800 border-blue-300',
        },
        authorized: {
            label: 'Authorized',
            variant: 'default',
            className: 'bg-blue-100 text-blue-800 border-blue-300',
        },
        captured: {
            label: 'Paid',
            variant: 'default',
            className: 'bg-green-100 text-green-800 border-green-300',
        },
        failed: {
            label: 'Failed',
            variant: 'destructive',
            className: 'bg-red-100 text-red-800 border-red-300',
        },
        declined: {
            label: 'Declined',
            variant: 'destructive',
            className: 'bg-red-100 text-red-800 border-red-300',
        },
        refunded: {
            label: 'Refunded',
            variant: 'outline',
            className: 'bg-orange-100 text-orange-800 border-orange-300',
        },
        partially_refunded: {
            label: 'Partially Refunded',
            variant: 'outline',
            className: 'bg-orange-100 text-orange-800 border-orange-300',
        },
        void: {
            label: 'Void',
            variant: 'outline',
            className: 'bg-slate-100 text-slate-700 border-slate-300',
        },
        paid: {

            label: 'Paid',
            variant: 'default',
            className: 'bg-green-100 text-green-800 border-green-300',

        }
    }

    const config = statusConfig[status] || statusConfig.pending

    return (
        <Badge
            variant={config.variant}
            className={cn('text-xs font-medium', config.className, className)}
        >
            {config.label}
        </Badge>
    )
}

