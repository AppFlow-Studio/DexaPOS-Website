'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface TimeWindowPickerProps {
    start?: string | null
    end?: string | null
    onChange: (start: string | undefined, end: string | undefined) => void
}

export function TimeWindowPicker({ start, end, onChange }: TimeWindowPickerProps) {
    const hasValue = start || end

    const handleClear = () => {
        onChange(undefined, undefined)
    }

    return (
        <div className="space-y-2">
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
            {hasValue && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="h-7 text-xs text-muted-foreground"
                >
                    <X className="h-3 w-3 mr-1" />
                    Clear time window
                </Button>
            )}
        </div>
    )
}

