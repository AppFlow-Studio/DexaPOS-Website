'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { DateRange } from 'react-day-picker'
import { format, subDays } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'

interface DateRangePickerProps {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
}

// `activeLabel` matches what getPresetLabel() derives from the applied range,
// which is what decides the selected button.
const PRESETS = [
  { days: 7, label: '7D', activeLabel: '7 Days' },
  { days: 30, label: '30D', activeLabel: '30 Days' },
  { days: 90, label: '90D', activeLabel: '90 Days' },
] as const

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [tempRange, setTempRange] = useState<DateRange | undefined>({
    from: new Date(from),
    to: new Date(to),
  })

  const handlePreset = (days: number) => {
    const toDate = new Date()
    const fromDate = subDays(toDate, days)
    onChange({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    })
  }

  const handleCustomApply = () => {
    if (!tempRange?.from) return
    // A single click in range mode selects only `from`. Treat that as a
    // one-day range so Apply is never a dead end mid-selection.
    onChange({
      from: tempRange.from.toISOString(),
      to: (tempRange.to ?? tempRange.from).toISOString(),
    })
    setIsOpen(false)
  }

  // Re-seed the draft from the applied range each time the popover opens, so a
  // dismissed half-finished selection doesn't carry over to the next open.
  const handleOpenChange = (open: boolean) => {
    if (open) setTempRange({ from: new Date(from), to: new Date(to) })
    setIsOpen(open)
  }

  const getPresetLabel = () => {
    const fromDate = new Date(from)
    const toDate = new Date(to)
    const diffDays = Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 7) return '7 Days'
    if (diffDays === 30) return '30 Days'
    if (diffDays === 90) return '90 Days'
    return 'Custom'
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Date Range:</span>

      {/* Preset Buttons */}
      <div className="flex gap-2">
        {PRESETS.map(({ days, label, activeLabel }) => (
          <Button
            key={days}
            size="sm"
            variant={getPresetLabel() === activeLabel ? 'default' : 'outline'}
            onClick={() => handlePreset(days)}
            className="transition-all duration-200"
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Custom Popover */}
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button 
            size="sm" 
            variant="outline" 
            className="gap-2 transition-all duration-200"
          >
            <CalendarIcon className="h-4 w-4 text-primary" />
            <span className="text-sm">
              {format(new Date(from), 'MMM d')} - {format(new Date(to), 'MMM d')}
            </span>
          </Button>
        </PopoverTrigger>
        {/* Radix anchors to the trigger, and the trigger sits at the left of
            its row — so on a phone an `align="end"` panel lands hard against
            one side rather than centred. `collisionPadding` keeps it off the
            viewport edge, and the panel below is sized to the full space
            between those gutters, which leaves Radix no room to favour a side:
            the result is centred. At `sm` and up it returns to a 19rem panel
            aligned to the trigger, which is the right behaviour on desktop. */}
        <PopoverContent
          className="w-auto rounded-xl border p-0 shadow-lg"
          align="end"
          collisionPadding={16}
        >
          <div className="w-[calc(100vw-2rem)] space-y-3 p-4 sm:w-[19rem]">
            <div className="flex items-baseline justify-between gap-2">
              <label className="text-sm font-medium text-foreground">
                Select range
              </label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {tempRange?.from
                  ? `${format(tempRange.from, 'MMM d')} - ${
                      tempRange.to ? format(tempRange.to, 'MMM d') : '…'
                    }`
                  : 'Pick a start date'}
              </span>
            </div>
            <Calendar
              mode="range"
              selected={tempRange}
              onSelect={setTempRange}
              defaultMonth={tempRange?.from}
              numberOfMonths={1}
              className="p-0"
            />
            <Button
              disabled={!tempRange?.from}
              onClick={handleCustomApply}
              className="w-full transition-all duration-200"
              size="sm"
            >
              Apply Range
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}