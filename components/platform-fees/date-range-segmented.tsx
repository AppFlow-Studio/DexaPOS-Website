'use client'

import { startOfYear, subDays, subMonths } from 'date-fns'
import { cn } from '@/lib/utils'

export type DateRangePreset = '7D' | '30D' | '90D' | 'YTD' | '12M'

const presets: { value: DateRangePreset; label: string }[] = [
  { value: '7D', label: 'Last 7 days' },
  { value: '30D', label: 'Last 30 days' },
  { value: '90D', label: 'Last 90 days' },
  { value: 'YTD', label: 'Year to date' },
  { value: '12M', label: 'Last 12 months' },
]

export function presetToRange(preset: DateRangePreset): { from: string; to: string } {
  const to = new Date()
  let from: Date
  switch (preset) {
    case '7D':
      from = subDays(to, 7)
      break
    case '30D':
      from = subDays(to, 30)
      break
    case '90D':
      from = subDays(to, 90)
      break
    case 'YTD':
      from = startOfYear(to)
      break
    case '12M':
      from = subMonths(to, 12)
      break
  }
  return { from: from.toISOString(), to: to.toISOString() }
}

/**
 * Range presets as a pill rail (UI-DESIGN-SYSTEM §4.5). The active pill is the
 * neutral raised state, never a brand fill (§3.5). Pills are 44px tall on
 * phones (§13.6). Classes are literal, not tokens (C7).
 */
export function DateRangeSegmented({
  value,
  onChange,
  className,
}: {
  value: DateRangePreset
  onChange: (preset: DateRangePreset) => void
  className?: string
}) {
  return (
    <div className={cn('thin-scrollbar w-full min-w-0 max-w-full overflow-x-auto sm:w-auto', className)}>
      {/* Phones: the rail spans the row and the pills share it equally. */}
      <div
        role="group"
        aria-label="Date range"
        className="flex h-auto w-full flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1 sm:inline-flex sm:w-max"
      >
        {presets.map((p) => {
          const active = p.value === value
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={active}
              aria-label={p.label}
              title={p.label}
              onClick={() => onChange(p.value)}
              className={cn(
                'min-w-0 flex-1 whitespace-nowrap rounded-full px-2 py-2 text-[0.8125rem] font-medium tabular-nums transition-colors max-sm:h-11 sm:flex-none sm:shrink-0 sm:px-4',
                active
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p.value}
            </button>
          )
        })}
      </div>
    </div>
  )
}
