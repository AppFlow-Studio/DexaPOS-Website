import { cn } from '@/lib/utils'

const brandTone: Record<string, string> = {
  visa: 'bg-blue-50 text-blue-700 ring-blue-200',
  mc: 'bg-orange-50 text-orange-700 ring-orange-200',
  mastercard: 'bg-orange-50 text-orange-700 ring-orange-200',
  amex: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  americanexpress: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  discover: 'bg-amber-50 text-amber-700 ring-amber-200',
  disc: 'bg-amber-50 text-amber-700 ring-amber-200',
}

const brandLabel: Record<string, string> = {
  visa: 'VISA',
  mc: 'MC',
  mastercard: 'MC',
  amex: 'AMEX',
  americanexpress: 'AMEX',
  discover: 'DISC',
  disc: 'DISC',
}

export function CardBrandPill({
  brand,
  last4,
}: {
  brand: string | null | undefined
  last4: string | null | undefined
}) {
  const key = (brand ?? '').toLowerCase().replace(/\s+/g, '')
  const tone = brandTone[key] ?? 'bg-muted text-muted-foreground ring-border'
  const label = brandLabel[key] ?? (brand ? brand.toUpperCase().slice(0, 4) : '—')
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span
        className={cn(
          'inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide ring-1 ring-inset',
          tone
        )}
      >
        {label}
      </span>
      {last4 && (
        <span className="font-mono text-muted-foreground">····{last4}</span>
      )}
    </span>
  )
}
