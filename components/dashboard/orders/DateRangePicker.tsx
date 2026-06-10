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
                    <Button variant="outline" className="gap-2 max-w-full min-w-0">
                        <CalendarIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{displayText}</span>
                        <ChevronDown className="h-4 w-4 shrink-0" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0 z-[200]">
                    <div className="flex">
                        {/* Preset list */}
                        <div className="flex flex-col border-r border-border min-w-[130px] py-2">
                            <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Presets</p>
                            {PRESETS.map((presetOption) => (
                                <button
                                    key={presetOption.value}
                                    type="button"
                                    onClick={() => handlePresetSelect(presetOption.value)}
                                    className={cn(
                                        'px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors',
                                        draftPreset === presetOption.value && 'bg-accent font-medium'
                                    )}
                                >
                                    {presetOption.label}
                                </button>
                            ))}
                        </div>

                        {/* Calendar + footer */}
                        <div className="relative p-3 space-y-3">
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
                                    month_caption: "flex justify-center pt-1 relative items-center gap-1 h-8",
                                    caption_label: "hidden",
                                    dropdowns: "flex gap-1 items-center",
                                    dropdown: cn(
                                        "appearance-none bg-background border border-input rounded-md px-2 py-1",
                                        "text-sm font-medium cursor-pointer",
                                        "hover:bg-accent hover:text-accent-foreground",
                                        "focus:outline-none focus:ring-1 focus:ring-ring"
                                    ),
                                    dropdown_root: "relative",
                                    nav: "flex items-center justify-between absolute left-3 right-3 top-3 h-8",
                                    button_previous: cn(
                                        buttonVariants({ variant: "outline" }),
                                        "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                                    ),
                                    button_next: cn(
                                        buttonVariants({ variant: "outline" }),
                                        "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                                    ),
                                    month_grid: "w-full border-collapse",
                                    weekdays: "flex",
                                    weekday: "text-muted-foreground w-9 font-normal text-[0.8rem] text-center",
                                    weeks: "flex flex-col gap-1 mt-2",
                                    week: "flex",
                                    day: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 [&:has([data-selected])]:bg-accent [&:has([data-selected][data-range-end])]:rounded-r-md [&:has([data-selected][data-range-start])]:rounded-l-md first:[&:has([data-selected])]:rounded-l-md last:[&:has([data-selected])]:rounded-r-md",
                                    day_button: cn(
                                        buttonVariants({ variant: "ghost" }),
                                        "h-9 w-9 p-0 font-normal",
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
                            {draftRange?.from ? (
                                <p className="text-xs text-muted-foreground text-center">
                                    {draftRange.to
                                        ? `${formatDateDisplay(draftRange.from)} → ${formatDateDisplay(draftRange.to)}`
                                        : `From ${formatDateDisplay(draftRange.from)} — pick end date`}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground text-center">
                                    Pick a start and end date, then apply.
                                </p>
                            )}
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={handleCancel}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="flex-1"
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
