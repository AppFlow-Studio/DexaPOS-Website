'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { DayOfWeek, defaultApplicableDays } from '@/types/discount'

const dayOptions: { label: string; value: DayOfWeek }[] = [
    { label: 'Sun', value: 0 },
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
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

    const handleSelectAll = () => {
        onChange([...defaultApplicableDays])
    }

    const handleClearAll = () => {
        onChange([])
    }

    const allSelected = value.length === 7
    const noneSelected = value.length === 0

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {dayOptions.map((day) => (
                    <Label
                        key={day.value}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer"
                    >
                        <Checkbox
                            checked={value.includes(day.value)}
                            onCheckedChange={() => handleToggle(day.value)}
                        />
                        {day.label}
                    </Label>
                ))}
            </div>
            <div className="flex gap-2">
                {!allSelected && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleSelectAll}
                        className="h-7 text-xs text-muted-foreground"
                    >
                        Select all days
                    </Button>
                )}
                {!noneSelected && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClearAll}
                        className="h-7 text-xs text-muted-foreground"
                    >
                        Clear all
                    </Button>
                )}
            </div>
        </div>
    )
}

