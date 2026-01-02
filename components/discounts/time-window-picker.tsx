'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TimeWindowPickerProps {
    start?: string | null
    end?: string | null
    onChange: (start: string | undefined, end: string | undefined) => void
}

export function TimeWindowPicker({ start, end, onChange }: TimeWindowPickerProps) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
                <Label htmlFor="applicable_hours_start">Start time</Label>
                <Input
                    id="applicable_hours_start"
                    type="time"
                    value={start ?? ''}
                    onChange={(e) => onChange(e.target.value || undefined, end ?? undefined)}
                />
            </div>
            <div className="flex flex-col gap-2">
                <Label htmlFor="applicable_hours_end">End time</Label>
                <Input
                    id="applicable_hours_end"
                    type="time"
                    value={end ?? ''}
                    onChange={(e) => onChange(start ?? undefined, e.target.value || undefined)}
                />
            </div>
        </div>
    )
}

