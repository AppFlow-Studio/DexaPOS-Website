'use client'

import { startOfYear, subDays, subMonths } from 'date-fns'
import { cn } from '@/lib/utils'

export type DateRangePreset = '7D' | '30D' | '90D' | 'YTD' | '12M'

const presets: DateRangePreset[] = ['7D', '30D', '90D', 'YTD', '12M']

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
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5',
        className
      )}
    >
      {presets.map((p) => {
        const active = p === value
        return (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(p)}
            className={cn(
              'min-w-[44px] rounded px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}
