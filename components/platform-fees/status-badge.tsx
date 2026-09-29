import { cn } from '@/lib/utils'

/*
 * Status is never colour-coded (UI-DESIGN-SYSTEM §4.6b, D-12): every state is
 * the same neutral pill and the word carries the meaning. On a muted record
 * card, render `paymentStatusLabel()` as plain text instead of a pill (§3.5).
 */

export function paymentStatusLabel(status: string, isReturned: boolean): string {
  if (isReturned && status !== 'refunded' && status !== 'partially_refunded') return 'Returned'
  switch (status) {
    case 'captured':
      return 'Collected'
    case 'partially_refunded':
      return 'Partial refund'
    case 'refunded':
      return 'Refunded'
    case 'disputed':
      return 'Disputed'
    case 'failed':
      return 'Failed'
    case 'voided':
    case 'void':
      return 'Voided'
    default:
      return status.replace(/_/g, ' ')
  }
}

export function StatusBadge({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium',
        className
      )}
    >
      {children}
    </span>
  )
}

export function PaymentStatusBadge({
  status,
  isReturned,
}: {
  status: string
  isReturned: boolean
}) {
  return <StatusBadge>{paymentStatusLabel(status, isReturned)}</StatusBadge>
}
