'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { DateRange } from 'react-day-picker'
import { format, subDays } from 'date-fns'
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DateRangePickerProps {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
}

const PRESETS = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
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

  // The applied span in days, which is what decides the selected preset.
  // Derived from the range rather than stored, so an externally-set range
  // still lights the matching segment.
  const spanDays = Math.floor(
    (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)
  )
  const activePreset = PRESETS.find((p) => p.days === spanDays)

  // Each control has exactly one job: the segments choose a DURATION, the
  // trigger shows the resulting DATES. That split is what removes the last of
  // the duplication — a summary reading "90 days" sat 8px from a segment
  // reading "90D", so the loudest token in the row was also the least
  // informative. The dates live in the trigger now and nowhere else.
  //
  // The year appears only when the range crosses one ("Dec 25, 2025 – Mar 23,
  // 2026"). Printing it always would push the common same-year case toward
  // wrapping for information the reader already has; omitting it always makes
  // a range spanning New Year ambiguous. Both ends take the year together, so
  // the two halves stay symmetrical.
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const crossesYears = fromDate.getFullYear() !== toDate.getFullYear()
  const dateFormat = crossesYears ? 'MMM d, yyyy' : 'MMM d'
  const dateLabel = `${format(fromDate, dateFormat)} – ${format(toDate, dateFormat)}`

  // One label carries the whole state for assistive tech, which otherwise got
  // "7D, button" with no indication of what it controlled or which was live.
  // A same-day custom pick spans 0 days but covers 1, so it reads as "1 day".
  const spokenDays = Math.max(1, spanDays)
  const spokenFormat = crossesYears ? 'MMMM d, yyyy' : 'MMMM d'
  const periodLabel = `Period: ${
    activePreset ? `last ${activePreset.days} days` : `${spokenDays} ${spokenDays === 1 ? 'day' : 'days'}`
  }, ${format(fromDate, spokenFormat)} through ${format(toDate, spokenFormat)}`

  return (
    // `role="group"` with a single spoken label: the segments are one control,
    // not three unrelated buttons, and the label states the applied period in
    // full so it never has to be reconstructed from the pressed segment plus
    // the field text.
    //
    // Two rows on a phone (segments, then a full-width date field), one inline
    // row from `sm` up. The bar is sticky for the whole page, so a permanently
    // full-width 44px field would pin a heavy band across a wide desktop; at
    // phone width that same field is the right tap target and there is no
    // width to waste on a half-empty row.
    <div
      role="group"
      aria-label={periodLabel}
      className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
    >
      {/* Segments row. On a phone the label and the track share this line so
          the date button below gets the full width to itself. */}
      <div className="flex items-center gap-3">
        {/* "Period", not "Date Range" — shorter, and it names the concept
            rather than the widget. `aria-hidden` because the group label
            already says it. Hidden below `sm`, where the segment labels and
            the calendar icon are self-explanatory and the width is better
            spent on the control itself. */}
        <span aria-hidden className="hidden text-sm text-muted-foreground sm:inline">
          Period
        </span>

        {/* One connected segmented control rather than three floating pills.
            Separate bordered buttons read as three independent actions; a
            shared `bg-muted/60` track reads as one control with one of three
            states, which is what it is — the same track/pill language as the
            tab strips above, so the page has one vocabulary for "pick one".

            The selected segment takes a solid brand fill. A white raised pill
            alone was too quiet against the track to find at a glance, and the
            fill is the one unambiguous "this is the live one" signal that does
            not depend on noticing a 1px shadow. */}
        <div className="flex flex-1 items-center gap-1 rounded-full bg-muted/60 p-1 sm:flex-none">
          {PRESETS.map(({ days, label }) => {
            const isActive = activePreset?.days === days
            return (
              <button
                key={days}
                type="button"
                aria-pressed={isActive}
                onClick={() => handlePreset(days)}
                className={cn(
                  // `flex-1` below `sm` so the three segments split the row
                  // evenly and each clears the 44px touch target; natural
                  // width once the row goes inline.
                  'flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:py-1.5',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  isActive
                    ? 'bg-[#0C4FD1] text-white shadow-sm hover:bg-[#0A45B8] dark:bg-[#2C6BE5] dark:hover:bg-[#3A78EE]'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom Popover */}
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          {/* A field, not a caption. As muted ghost text this read as page
              status and gave no sign it could be opened — the one remaining
              weakness in the row. It now carries a border, its own surface, a
              44px height and a trailing chevron, which are the three things
              that say "this opens something".

              It still shows the exact dates rather than the word "Custom",
              because that is its job in the split: segments pick a duration,
              this shows and edits the dates. The chevron and border carry the
              affordance, so the label does not have to. */}
          <Button
            variant="outline"
            aria-label="Custom analytics date range"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            className={cn(
              // 44px: the row's tallest element and a full touch target. The
              // shared Button sizes top out at h-10/40px, so it is set here.
              'h-11 w-full justify-between gap-2 px-4 font-medium tabular-nums sm:w-auto',
              // A custom range is the only state no segment displays, so the
              // field takes the accent border that marks it as carrying the
              // live value on its own.
              !activePreset && 'border-[#0C4FD1] dark:border-[#6CA0FF]'
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {/* One line, never wrapped: the year only appears when the range
                  crosses one, and even then the field is wide enough. */}
              <span className="truncate text-sm">{dateLabel}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
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