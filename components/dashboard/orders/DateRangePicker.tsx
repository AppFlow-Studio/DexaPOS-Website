'use client'

import * as React from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type DatePreset =
    | 'today'
    | 'last_7_days'
    | 'last_30_days'
    | 'last_90_days'
    | 'this_month'
    | 'last_month'
    | 'custom'

interface DateRangePickerProps {
    dateFrom: Date | null
    dateTo: Date | null
    onDateRangeChange: (from: Date | null, to: Date | null) => void
    preset?: DatePreset
    onPresetChange?: (preset: DatePreset) => void
    className?: string
}

const PRESETS: Array<{ value: DatePreset; label: string; getDates: () => { from: Date; to: Date } }> = [
    {
        value: 'today',
        label: 'Today',
        getDates: () => {
            const to = new Date()
            const from = new Date()
            return { from, to }
        },
    },
    {
        value: 'last_7_days',
        label: 'Last 7 days',
        getDates: () => {
            const to = new Date()
            const from = new Date()
            from.setDate(from.getDate() - 7)
            return { from, to }
        },
    },
    {
        value: 'last_30_days',
        label: 'Last 30 days',
        getDates: () => {
            const to = new Date()
            const from = new Date()
            from.setDate(from.getDate() - 30)
            return { from, to }
        },
    },
    {
        value: 'last_90_days',
        label: 'Last 90 days',
        getDates: () => {
            const to = new Date()
            const from = new Date()
            from.setDate(from.getDate() - 90)
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
            return { from, to }
        },
    },
]

function formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0]
}

function formatDateDisplay(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function DateRangePicker({
    dateFrom,
    dateTo,
    onDateRangeChange,
    preset = 'last_7_days',
    onPresetChange,
    className,
}: DateRangePickerProps) {
    const [isCustomOpen, setIsCustomOpen] = React.useState(false)
    const [customFrom, setCustomFrom] = React.useState<string>('')
    const [customTo, setCustomTo] = React.useState<string>('')

    // Initialize with preset if dates are null
    React.useEffect(() => {
        if (!dateFrom || !dateTo) {
            const presetConfig = PRESETS.find(p => p.value === preset) || PRESETS[0]
            const { from, to } = presetConfig.getDates()
            onDateRangeChange(from, to)
        }
    }, [])

    const handlePresetSelect = (presetValue: DatePreset) => {
        if (presetValue === 'custom') {
            setIsCustomOpen(true)
            if (dateFrom && dateTo) {
                setCustomFrom(formatDateForInput(dateFrom))
                setCustomTo(formatDateForInput(dateTo))
            }
            onPresetChange?.(presetValue)
            return
        }

        const presetConfig = PRESETS.find(p => p.value === presetValue)
        if (presetConfig) {
            const { from, to } = presetConfig.getDates()
            onDateRangeChange(from, to)
            onPresetChange?.(presetValue)
        }
    }

    const handleCustomDateApply = () => {
        if (customFrom && customTo) {
            const from = new Date(customFrom)
            const to = new Date(customTo)
            from.setHours(0, 0, 0, 0)
            to.setHours(23, 59, 59, 999)
            onDateRangeChange(from, to)
            setIsCustomOpen(false)
            onPresetChange?.('custom')
        }
    }

    const currentPreset = PRESETS.find(p => p.value === preset)
    const displayText = dateFrom && dateTo
        ? `${formatDateDisplay(dateFrom)} - ${formatDateDisplay(dateTo)}`
        : currentPreset?.label || 'Select date range'

    return (
        <div className={cn('flex items-center gap-2', className)}>
            <DropdownMenu open={isCustomOpen} onOpenChange={setIsCustomOpen}>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>{displayText}</span>
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>Presets</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {PRESETS.map((presetOption) => (
                        <DropdownMenuItem
                            key={presetOption.value}
                            onClick={() => handlePresetSelect(presetOption.value)}
                            className={cn(
                                preset === presetOption.value && 'bg-accent'
                            )}
                        >
                            {presetOption.label}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Custom Range</DropdownMenuLabel>
                    <div className="p-2 space-y-2">
                        <div className="space-y-1">
                            <Label htmlFor="custom-from" className="text-xs">From</Label>
                            <Input
                                id="custom-from"
                                type="date"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                className="h-8"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="custom-to" className="text-xs">To</Label>
                            <Input
                                id="custom-to"
                                type="date"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                className="h-8"
                            />
                        </div>
                        <Button
                            size="sm"
                            onClick={handleCustomDateApply}
                            className="w-full"
                            disabled={!customFrom || !customTo}
                        >
                            Apply
                        </Button>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}

