'use client'

import { DayOfWeek, defaultApplicableDays } from '@/types/discount'
import { cn } from '@/lib/utils'

const dayOptions: { label: string; short: string; value: DayOfWeek }[] = [
    { label: 'Sunday',    short: 'Su', value: 0 },
    { label: 'Monday',    short: 'Mo', value: 1 },
    { label: 'Tuesday',   short: 'Tu', value: 2 },
    { label: 'Wednesday', short: 'We', value: 3 },
    { label: 'Thursday',  short: 'Th', value: 4 },
    { label: 'Friday',    short: 'Fr', value: 5 },
    { label: 'Saturday',  short: 'Sa', value: 6 },
]

interface DaySelectorProps {
    value: DayOfWeek[]
    onChange: (value: DayOfWeek[]) => void
}

export function DaySelector({ value, onChange }: DaySelectorProps) {
    const handleToggle = (day: DayOfWeek) => {
        if (value.includes(day)) {
            onChange(value.filter((d) => d !== day))
        } else {
            onChange([...value, day].sort((a, b) => a - b))
        }
    }

    const allSelected = value.length === 7
    const noneSelected = value.length === 0

    return (
        <div className="space-y-3">
            <div className="flex gap-1.5">
                {dayOptions.map((day) => {
                    const selected = value.includes(day.value)
                    return (
                        <button
                            key={day.value}
                            type="button"
                            title={day.label}
                            onClick={() => handleToggle(day.value)}
                            className={cn(
                                'flex h-9 flex-1 items-center justify-center rounded-md text-xs font-semibold transition-colors select-none',
                                selected
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                            )}
                        >
                            {day.short}
                        </button>
                    )
                })}
            </div>

            <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <div className="flex gap-2">
                    {!allSelected && (
                        <button
                            type="button"
                            onClick={() => onChange([...defaultApplicableDays])}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Select all
                        </button>
                    )}
                    {!allSelected && !noneSelected && (
                        <span className="text-xs text-border">·</span>
                    )}
                    {!noneSelected && (
                        <button
                            type="button"
                            onClick={() => onChange([])}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
                <div className="h-px flex-1 bg-border" />
            </div>
        </div>
    )
}
