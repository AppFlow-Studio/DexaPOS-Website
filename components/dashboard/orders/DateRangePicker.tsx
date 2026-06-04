'use client'

import * as React from 'react'
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
            <DropdownMenu
                modal={false}
                open={open}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && open) {
                        syncDraftFromApplied()
                    }
                    setOpen(nextOpen)
                }}
            >
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        <span>{displayText}</span>
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-auto z-[200]">
                    <DropdownMenuLabel>Presets</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {PRESETS.map((presetOption) => (
                        <DropdownMenuItem
                            key={presetOption.value}
                            onSelect={(event) => {
                                event.preventDefault()
                                handlePresetSelect(presetOption.value)
                            }}
                            className={cn(
                                draftPreset === presetOption.value && 'bg-accent'
                            )}
                        >
                            {presetOption.label}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Draft Range</DropdownMenuLabel>
                    <div className="p-2 space-y-3">
                        <DayPicker
                            mode="range"
                            selected={draftRange}
                            onSelect={(nextRange) => {
                                setDraftPreset('custom')
                                setDraftRange(nextRange)
                            }}
                            captionLayout="dropdown"
                            fromYear={2015}
                            toYear={currentYear}
                            showOutsideDays={true}
                            className="p-0"
                            classNames={{
                                months: "flex flex-col space-y-4",
                                month: "space-y-4",
                                caption: "flex justify-center pt-1 relative items-center gap-1",
                                caption_label: "hidden",
                                caption_dropdowns: "flex gap-1 items-center",
                                dropdown: cn(
                                    "appearance-none bg-background border border-input rounded-md px-2 py-1",
                                    "text-sm font-medium cursor-pointer",
                                    "hover:bg-accent hover:text-accent-foreground",
                                    "focus:outline-none focus:ring-1 focus:ring-ring"
                                ),
                                dropdown_year: "",
                                dropdown_month: "",
                                vhidden: "sr-only",
                                nav: "space-x-1 flex items-center",
                                nav_button: cn(
                                    buttonVariants({ variant: "outline" }),
                                    "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
                                ),
                                nav_button_previous: "absolute left-1",
                                nav_button_next: "absolute right-1",
                                table: "w-full border-collapse space-y-1",
                                head_row: "flex",
                                head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                                row: "flex w-full mt-2",
                                cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                                day: cn(
                                    buttonVariants({ variant: "ghost" }),
                                    "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
                                ),
                                day_range_end: "day-range-end",
                                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                                day_today: "bg-accent text-accent-foreground",
                                day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
                                day_disabled: "text-muted-foreground opacity-50",
                                day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                                day_hidden: "invisible",
                            }}
                            components={{
                                IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                                IconRight: () => <ChevronRight className="h-4 w-4" />,
                            }}
                        />
                        {draftRange?.from ? (
                            <p className="text-xs text-muted-foreground text-center">
                                {draftRange.to
                                    ? `${formatDateDisplay(draftRange.from)} -> ${formatDateDisplay(draftRange.to)}`
                                    : `From ${formatDateDisplay(draftRange.from)} - pick end date`}
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
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
