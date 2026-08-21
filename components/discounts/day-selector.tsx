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
        <div className="min-w-0 space-y-3">
            {/* A segmented pill rail: one track, seven round toggles inside it. */}
            <div className="flex w-full min-w-0 gap-0.5 rounded-full bg-muted/70 p-1">
                {dayOptions.map((day) => {
                    const selected = value.includes(day.value)
                    return (
                        <button
                            key={day.value}
                            type="button"
                            title={day.label}
                            aria-pressed={selected}
                            onClick={() => handleToggle(day.value)}
                            className={cn(
                                'flex h-8 min-w-0 flex-1 select-none items-center justify-center rounded-full text-xs font-medium transition-colors',
                                selected
                                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {day.short}
                        </button>
                    )
                })}
            </div>

            <div className="flex items-center justify-center gap-3">
                <div className="flex gap-2">
                    {!allSelected && (
                        <button
                            type="button"
                            onClick={() => onChange([...defaultApplicableDays])}
                            className="text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Select all
                        </button>
                    )}
                    {!allSelected && !noneSelected && (
                        <span className="text-[0.8125rem] text-border">·</span>
                    )}
                    {!noneSelected && (
                        <button
                            type="button"
                            onClick={() => onChange([])}
                            className="text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
