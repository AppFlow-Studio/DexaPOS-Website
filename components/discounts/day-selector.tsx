'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { DayOfWeek } from '@/types/discount'

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

    return (
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
    )
}

