'use client'

import * as React from 'react'
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { DayPicker } from 'react-day-picker'
import type { DateRange } from 'react-day-picker'

export type DatePreset =
    | 'today'
    | 'yesterday'
    | 'last_7_days'
    | 'last_30_days'
    | 'this_month'
    | 'last_month'
    | 'custom'

interface DateRangePickerProps {
    dateFrom: Date | null
    dateTo: Date | null
    onDateRangeChange: (from: Date | null, to: Date | null) => void
    preset?: DatePreset
    onPresetChange?: (preset: DatePreset) => void
    initializeWhenEmpty?: boolean
    className?: string
    /** Restyles the trigger button only. Lets a borderless surface opt out of the
     *  default outlined look without changing it for every other consumer. */
    triggerClassName?: string
    /** Restyles the popover panel. It renders in a portal, so a page that wants
     *  to reach it with its own CSS needs a hook class applied here. */
    contentClassName?: string
    /** Which trigger edge the panel anchors to. Defaults to the trigger's left
     *  edge; pass "end" when the trigger sits at the right of its row, so the
     *  panel opens leftward instead of running toward the viewport edge. */
    align?: "start" | "center" | "end"
}

const PRESETS: Array<{ value: DatePreset; label: string; getDates: () => { from: Date; to: Date } }> = [
    {
        value: 'today',
        label: 'Today',
        getDates: () => {
            const from = new Date()
            const to = new Date()
            from.setHours(0, 0, 0, 0)
            to.setHours(23, 59, 59, 999)
            return { from, to }
        },
    },
    {
        value: 'yesterday',
        label: 'Yesterday',
        getDates: () => {
            const from = new Date()
            from.setDate(from.getDate() - 1)
            from.setHours(0, 0, 0, 0)
            const to = new Date(from)
            to.setHours(23, 59, 59, 999)
            return { from, to }
        },
    },
    {
        value: 'last_7_days',
        label: 'Last 7 days',
        getDates: () => {
            const from = new Date()
            const to = new Date()
            from.setDate(from.getDate() - 6)
            from.setHours(0, 0, 0, 0)
            to.setHours(23, 59, 59, 999)
            return { from, to }
        },
    },
    {
        value: 'last_30_days',
        label: 'Last 30 days',
        getDates: () => {
            const from = new Date()
            const to = new Date()
            from.setDate(from.getDate() - 29)
            from.setHours(0, 0, 0, 0)
            to.setHours(23, 59, 59, 999)
            return { from, to }
        },
    },
    {
        value: 'this_month',
        label: 'This month',
        getDates: () => {
            const now = new Date()
            const from = new Date(now.getFullYear(), now.getMonth(), 1)
            const to = new Date()
            to.setHours(23, 59, 59, 999)
            return { from, to }
        },
    },
    {
        value: 'last_month',
        label: 'Last month',
        getDates: () => {
            const now = new Date()
            const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            const to = new Date(now.getFullYear(), now.getMonth(), 0)
            to.setHours(23, 59, 59, 999)
            return { from, to }
        },
    },
    {
        value: 'custom',
        label: 'Custom range',
        getDates: () => {
            const to = new Date()
            const from = new Date()
            from.setDate(from.getDate() - 7)
            from.setHours(0, 0, 0, 0)
            to.setHours(23, 59, 59, 999)
            return { from, to }
        },
    },
]

function formatDateDisplay(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function normalizeAppliedRange(dateFrom: Date | null, dateTo: Date | null): DateRange | undefined {
    if (!dateFrom || !dateTo) return undefined
    return {
        from: new Date(dateFrom),
        to: new Date(dateTo),
    }
}

export function DateRangePicker({
    dateFrom,
    dateTo,
    onDateRangeChange,
    preset = 'last_7_days',
    onPresetChange,
    initializeWhenEmpty = true,
    className,
    triggerClassName,
    contentClassName,
    // Every caller renders this trigger in `PageHeader actions`, i.e. hard against
    // the right edge of the page. Aligning the panel's *left* edge to the trigger
    // pushed the two-month calendar off-screen; anchoring the right edge opens it
    // leftward into available space instead.
    align = "end",
}: DateRangePickerProps) {
    const [open, setOpen] = React.useState(false)
    const [draftPreset, setDraftPreset] = React.useState<DatePreset>(preset)
    const [draftRange, setDraftRange] = React.useState<DateRange | undefined>(
        normalizeAppliedRange(dateFrom, dateTo)
    )

    const syncDraftFromApplied = React.useCallback(() => {
        setDraftPreset(preset)
        setDraftRange(normalizeAppliedRange(dateFrom, dateTo))
    }, [dateFrom, dateTo, preset])

    React.useEffect(() => {
        if (!initializeWhenEmpty) return
        if (dateFrom || dateTo) return

        const presetConfig = PRESETS.find((entry) => entry.value === preset) || PRESETS[0]
        const { from, to } = presetConfig.getDates()
        onDateRangeChange(from, to)
    }, [dateFrom, dateTo, initializeWhenEmpty, onDateRangeChange, preset])

    React.useEffect(() => {
        if (open) {
            syncDraftFromApplied()
        }
    }, [open, syncDraftFromApplied])

    const handlePresetSelect = (presetValue: DatePreset) => {
        setDraftPreset(presetValue)
        const presetConfig = PRESETS.find((entry) => entry.value === presetValue)
        if (presetConfig) {
            const { from, to } = presetConfig.getDates()
            setDraftRange({ from, to })
        }
    }

    const handleCancel = () => {
        syncDraftFromApplied()
        setOpen(false)
    }

    const handleApply = () => {
        if (!draftRange?.from || !draftRange?.to) {
            return
        }

        const from = new Date(draftRange.from)
        const to = new Date(draftRange.to)
        from.setHours(0, 0, 0, 0)
        to.setHours(23, 59, 59, 999)

        onDateRangeChange(from, to)
        onPresetChange?.(draftPreset)
        setOpen(false)
    }

    const currentPreset = PRESETS.find((entry) => entry.value === preset)
    const displayText = dateFrom && dateTo
        ? `${formatDateDisplay(dateFrom)} - ${formatDateDisplay(dateTo)}`
        : currentPreset?.label || 'Select date range'

    const currentYear = new Date().getFullYear()

    return (
        <div className={cn('flex items-center gap-2', className)}>
            <Popover
                modal={false}
                open={open}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && open) {
                        syncDraftFromApplied()
                    }
                    setOpen(nextOpen)
                }}
            >
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className={cn('gap-2 max-w-full min-w-0 bg-white dark:bg-white', triggerClassName)}
                    >
                        <CalendarIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{displayText}</span>
                        <ChevronDown className="h-4 w-4 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align={align}
                    // Always drop downward. Radix would otherwise flip the panel
                    // above the trigger whenever the calendar doesn't fit below,
                    // which makes the control jump around near the bottom of the
                    // viewport. `avoidCollisions={false}` keeps it anchored under
                    // the trigger and lets the page scroll to reveal the rest.
                    side="bottom"
                    avoidCollisions={false}
                    // Keeping focus on the trigger means wheel/touch scrolling
                    // still reaches the page while the panel is open.
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    // The panel is portalled and `position: fixed`, so it is not
                    // part of the page's scrollable content — if it runs past the
                    // bottom of the viewport, no amount of page scrolling can
                    // reveal the footer. Cap it to the space actually available
                    // below the trigger (Radix measures this into the CSS var);
                    // the columns below scroll within that budget.
                    // Also cap the width to the viewport: the preset rail and
                    // calendar side by side are wider than a phone, so without
                    // this the panel ran off-screen and the right-hand days and
                    // the Apply button were unreachable. Below `sm` the two
                    // columns stack instead (see the flex direction below).
                    collisionPadding={8}
                    className={cn(
                        // Width is capped by Radix's measured available width,
                        // not 100vw: with avoidCollisions off the panel stays
                        // anchored to the trigger, which is already inset from
                        // the left edge, so a full-viewport cap still let the
                        // right side (Apply, last preset chips) run off-screen
                        // at 320px. The var accounts for that offset.
                        //
                        // Below sm that "available width" var is unreliable —
                        // it's measured from the trigger's edge, not the true
                        // viewport, so on a phone the panel can still overflow
                        // the opposite edge (see the mobile calendar overflow
                        // fix). Clamp to an explicit viewport-relative cap there
                        // instead, and let sm+ fall back to the Radix var.
                        'w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[var(--radix-popover-content-available-width)]',
                        'p-0 z-[200] rounded-2xl bg-popover',
                        'max-h-[var(--radix-popover-content-available-height)] overflow-hidden',
                        contentClassName
                    )}
                >
                    <div className="flex max-h-[inherit] min-h-0 flex-col sm:flex-row">
                        {/* Preset list — scrolls on its own so it never pushes
                            the calendar's footer out of reach. When stacked it
                            becomes a horizontal strip of chips so it costs one
                            row rather than the full list height. */}
                        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2 sm:min-w-[130px] sm:flex-col sm:gap-0 sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-0 sm:py-2">
                            {/* The heading only makes sense above a vertical
                                list; in the stacked chip strip it would eat a
                                whole row. */}
                            <p className="hidden px-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider sm:block">Presets</p>
                            {PRESETS.map((presetOption) => (
                                <button
                                    key={presetOption.value}
                                    type="button"
                                    onClick={() => handlePresetSelect(presetOption.value)}
                                    className={cn(
                                        'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-accent',
                                        'sm:rounded-none sm:text-left',
                                        draftPreset === presetOption.value && 'bg-accent font-medium'
                                    )}
                                >
                                    {presetOption.label}
                                </button>
                            ))}
                        </div>

                        {/* Calendar + footer. The calendar scrolls within
                            whatever height is left; the summary line and the
                            Cancel/Apply row stay pinned to the bottom so they
                            are always reachable on a short viewport. */}
                        {/* 300px left the month grid and the month/year dropdowns
                            fighting for the same row; 340px gives the caption its
                            own breathing room without widening the phone layout,
                            where this column is full-width anyway. */}
                        <div className="relative flex min-h-0 min-w-0 flex-col p-3 gap-3 sm:min-w-[340px]">
                            {/* `overflow-x-clip` (not `visible`, which CSS
                                promotes to `auto` next to a scrolling axis)
                                keeps the month grid at its natural width
                                instead of reserving a horizontal gutter. The
                                right padding keeps the vertical scrollbar from
                                landing on top of the month nav arrows. */}
                            <div className="min-h-0 overflow-y-auto overflow-x-clip pr-2">
                            <DayPicker
                                mode="range"
                                selected={draftRange}
                                onSelect={(nextRange) => {
                                    setDraftPreset('custom')
                                    setDraftRange(nextRange)
                                }}
                                captionLayout="dropdown"
                                startMonth={new Date(2015, 0)}
                                endMonth={new Date(currentYear, 11)}
                                showOutsideDays={true}
                                classNames={{
                                    root: "p-0",
                                    months: "flex flex-col",
                                    month: "flex flex-col gap-4",
                                    // Caption holds the month/year dropdowns on
                                    // the left and leaves room on the right for
                                    // the (absolutely-positioned) nav arrows so
                                    // the two never overlap and steal clicks.
                                    month_caption: "flex justify-start pt-1 relative items-center gap-1 h-8 pr-16",
                                    caption_label: "hidden",
                                    dropdowns: "flex min-w-0 gap-1 items-center",
                                    dropdown: cn(
                                        "min-w-0 appearance-none bg-background border border-input rounded-lg px-2 py-1",
                                        "text-sm font-medium cursor-pointer",
                                        "hover:bg-accent hover:text-accent-foreground",
                                        "focus:outline-none focus:ring-1 focus:ring-ring"
                                    ),
                                    dropdown_root: "relative",
                                    // Both arrows grouped at the top-right. z-10
                                    // lifts them above the (normal-flow) caption
                                    // div, whose full-width box otherwise covers
                                    // the arrows and swallows the click.
                                    // Offset clears the scroll wrapper's right
                                    // padding so the scrollbar never overlaps
                                    // the arrows.
                                    nav: "flex items-center gap-1 absolute right-5 top-3 h-8 z-10",
                                    button_previous: cn(
                                        buttonVariants({ variant: "outline" }),
                                        "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                                    ),
                                    button_next: cn(
                                        buttonVariants({ variant: "outline" }),
                                        "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                                    ),
                                    // Day cells are fluid rather than a fixed
                                    // w-9: seven 36px columns plus the preset
                                    // rail overflow a phone, which clipped the
                                    // right-hand days off-screen. flex-1 with a
                                    // max keeps the desktop size but lets the
                                    // grid shrink to whatever width is left.
                                    month_grid: "w-full border-collapse",
                                    weekdays: "flex",
                                    weekday: "text-muted-foreground min-w-0 flex-1 basis-0 max-w-9 font-normal text-[0.8rem] text-center",
                                    weeks: "flex flex-col gap-1 mt-2",
                                    week: "flex",
                                    day: "h-9 min-w-0 flex-1 basis-0 max-w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 [&:has([data-selected])]:bg-accent [&:has([data-selected][data-range-end])]:rounded-r-md [&:has([data-selected][data-range-start])]:rounded-l-md first:[&:has([data-selected])]:rounded-l-md last:[&:has([data-selected])]:rounded-r-md",
                                    day_button: cn(
                                        buttonVariants({ variant: "ghost" }),
                                        "h-9 w-full p-0 font-normal",
                                        "[&[data-selected]]:opacity-100",
                                        "[&[data-range-start]]:bg-primary [&[data-range-start]]:text-primary-foreground",
                                        "[&[data-range-end]]:bg-primary [&[data-range-end]]:text-primary-foreground",
                                        "[&[data-selected][data-range-middle]]:bg-transparent [&[data-selected][data-range-middle]]:text-accent-foreground",
                                    ),
                                    range_start: "rounded-l-md",
                                    range_end: "rounded-r-md",
                                    range_middle: "bg-accent",
                                    selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                                    today: "bg-accent text-accent-foreground",
                                    outside: "text-muted-foreground opacity-50 [&[data-selected]]:bg-accent/50 [&[data-selected]]:text-muted-foreground [&[data-selected]]:opacity-30",
                                    disabled: "text-muted-foreground opacity-50",
                                    hidden: "invisible",
                                }}
                                components={{
                                    Chevron: ({ orientation }) => orientation === 'left'
                                        ? <ChevronLeft className="h-4 w-4" />
                                        : <ChevronRight className="h-4 w-4" />,
                                }}
                            />
                            </div>
                            {draftRange?.from ? (
                                <p className="shrink-0 text-xs text-muted-foreground text-center">
                                    {draftRange.to
                                        ? `${formatDateDisplay(draftRange.from)} → ${formatDateDisplay(draftRange.to)}`
                                        : `From ${formatDateDisplay(draftRange.from)} — pick end date`}
                                </p>
                            ) : (
                                <p className="shrink-0 text-xs text-muted-foreground text-center">
                                    Pick a start and end date, then apply.
                                </p>
                            )}
                            <div className="flex shrink-0 items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 rounded-full"
                                    onClick={handleCancel}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="flex-1 rounded-full"
                                    onClick={handleApply}
                                    disabled={!draftRange?.from || !draftRange?.to}
                                >
                                    Apply
                                </Button>
                            </div>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    )
}
