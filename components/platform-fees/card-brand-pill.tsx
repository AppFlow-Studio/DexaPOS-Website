const brandLabel: Record<string, string> = {
  visa: 'VISA',
  mc: 'MC',
  mastercard: 'MC',
  amex: 'AMEX',
  americanexpress: 'AMEX',
  discover: 'DISC',
  disc: 'DISC',
}

export function cardBrandLabel(brand: string | null | undefined): string {
  const key = (brand ?? '').toLowerCase().replace(/\s+/g, '')
  return brandLabel[key] ?? (brand ? brand.toUpperCase().slice(0, 4) : '—')
}

/**
 * Card network + last four. The network is a word in a neutral pill, never a
 * per-brand hue (UI-DESIGN-SYSTEM §3.5: no per-category colour).
 */
export function CardBrandPill({
  brand,
  last4,
}: {
  brand: string | null | undefined
  last4: string | null | undefined
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="inline-flex items-center justify-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide">
        {cardBrandLabel(brand)}
      </span>
      {last4 && (
        <span className="font-mono text-muted-foreground">····{last4}</span>
      )}
    </span>
  )
}
