'use client'

import { Input } from '@/components/ui/input'
import { Clock, ArrowRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TimeWindowPickerProps {
    start?: string | null
    end?: string | null
    onChange: (start: string | undefined, end: string | undefined) => void
}

export function TimeWindowPicker({ start, end, onChange }: TimeWindowPickerProps) {
    const hasValue = start || end

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                {/* Start time */}
                <div className="relative flex-1">
                    <Clock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        type="time"
                        className={cn('pl-8 text-sm', !start && 'text-muted-foreground')}
                        value={start ?? ''}
                        onChange={(e) => onChange(e.target.value || undefined, end ?? undefined)}
                    />
                </div>

                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />

                {/* End time */}
                <div className="relative flex-1">
                    <Clock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        type="time"
                        className={cn('pl-8 text-sm', !end && 'text-muted-foreground')}
                        value={end ?? ''}
                        onChange={(e) => onChange(start ?? undefined, e.target.value || undefined)}
                    />
                </div>

                {/* Clear */}
                {hasValue && (
                    <button
                        type="button"
                        onClick={() => onChange(undefined, undefined)}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Clear time window"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {start && end && (
                <p className="text-xs text-muted-foreground">
                    Active from <span className="font-medium text-foreground">{start}</span> to <span className="font-medium text-foreground">{end}</span> each day.
                </p>
            )}
        </div>
    )
}
