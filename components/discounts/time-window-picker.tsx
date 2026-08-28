'use client'

import { TimePickerTrigger } from '@/components/ui/time-picker'
import { ArrowRight, X } from 'lucide-react'

interface TimeWindowPickerProps {
    start?: string | null
    end?: string | null
    onChange: (start: string | undefined, end: string | undefined) => void
}

/** Formats an `HH:mm` value for the summary line. */
function to12Hour(value: string) {
    const [h, m] = value.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return value
    const period = h >= 12 ? 'PM' : 'AM'
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`
}

export function TimeWindowPicker({ start, end, onChange }: TimeWindowPickerProps) {
    const hasValue = start || end

    /**
     * `<input type="time">` renders the browser's own square dropdown, which
     * cannot be styled. `TimePickerTrigger` is the in-app equivalent and opens
     * a rounded panel that follows the design system.
     */
    const triggerClass =
        'h-9 w-full min-w-0 justify-start rounded-full border-0 bg-muted/60 px-4 text-[0.8125rem] font-normal tabular-nums shadow-none hover:bg-muted'

    return (
        <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                    <TimePickerTrigger
                        value={start ?? undefined}
                        onChange={(value) => onChange(value || undefined, end ?? undefined)}
                        placeholder="Start time"
                        className={triggerClass}
                    />
                </div>

                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />

                <div className="min-w-0 flex-1">
                    <TimePickerTrigger
                        value={end ?? undefined}
                        onChange={(value) => onChange(start ?? undefined, value || undefined)}
                        placeholder="End time"
                        className={triggerClass}
                    />
                </div>

                {/* Clear — DS-CTL-08 material, sized for a single glyph. */}
                {hasValue && (
                    <button
                        type="button"
                        onClick={() => onChange(undefined, undefined)}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border-0 bg-muted/60 text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground"
                        title="Clear time window"
                        aria-label="Clear time window"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {start && end && (
                <p className="text-[0.8125rem] text-muted-foreground">
                    Active from{' '}
                    <span className="font-medium text-foreground tabular-nums">
                        {to12Hour(start)}
                    </span>{' '}
                    to{' '}
                    <span className="font-medium text-foreground tabular-nums">
                        {to12Hour(end)}
                    </span>{' '}
                    each day.
                </p>
            )}
        </div>
    )
}
