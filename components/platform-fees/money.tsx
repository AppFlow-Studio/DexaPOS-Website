import { cn } from '@/lib/utils'

interface MoneyProps {
  value: number | null | undefined
  className?: string
  zeroAsDash?: boolean
  signed?: boolean
}

export function Money({ value, className, zeroAsDash = false, signed = false }: MoneyProps) {
  const n = Number(value ?? 0)
  if (zeroAsDash && (!Number.isFinite(n) || n === 0)) {
    return <span className={cn('text-muted-foreground tabular-nums', className)}>—</span>
  }

  const isNegative = n < 0
  const abs = Math.abs(n)
  const dollars = Math.floor(abs)
  const cents = Math.round((abs - dollars) * 100)
  const dollarStr = dollars.toLocaleString('en-US')
  const centsStr = cents.toString().padStart(2, '0')

  const sign = isNegative ? '−' : signed && n > 0 ? '+' : ''

  return (
    <span className={cn('tabular-nums font-mono whitespace-nowrap', className)}>
      {sign}
      <span>${dollarStr}</span>
      <span className="text-muted-foreground font-normal">.{centsStr}</span>
    </span>
  )
}
