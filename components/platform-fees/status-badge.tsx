import { cn } from '@/lib/utils'

type Tone = 'success' | 'info' | 'warning' | 'destructive' | 'neutral'

const toneClasses: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  destructive: 'bg-red-50 text-red-700 ring-red-200',
  neutral: 'bg-muted text-muted-foreground ring-border',
}

const dotClasses: Record<Tone, string> = {
  success: 'bg-emerald-500',
  info: 'bg-sky-500',
  warning: 'bg-amber-500',
  destructive: 'bg-red-500',
  neutral: 'bg-muted-foreground',
}

export function paymentStatusTone(status: string, isReturned: boolean): Tone {
  if (isReturned) return 'warning'
  switch (status) {
    case 'captured':
      return 'success'
    case 'partially_refunded':
      return 'warning'
    case 'refunded':
      return 'warning'
    case 'disputed':
      return 'destructive'
    case 'failed':
      return 'destructive'
    case 'voided':
    case 'void':
      return 'neutral'
    default:
      return 'neutral'
  }
}

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
  tone,
  children,
  className,
}: {
  tone: Tone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        toneClasses[tone],
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClasses[tone])} />
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
  const tone = paymentStatusTone(status, isReturned)
  return <StatusBadge tone={tone}>{paymentStatusLabel(status, isReturned)}</StatusBadge>
}
