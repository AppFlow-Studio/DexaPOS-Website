'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Clock, ChevronUp, ChevronDown } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

interface TimePickerProps {
    value?: string // "HH:MM" format (24h)
    onChange?: (value: string) => void
    className?: string
    disabled?: boolean
    compact?: boolean
}

// Generate arrays for hours, minutes
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1) // 1-12
const MINUTES = Array.from({ length: 60 }, (_, i) => i) // 0-59
const TIME_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

// Item height for scroll calculations
const ITEM_HEIGHT = 44

function WheelColumn({
    items,
    value,
    onChange,
    formatValue = (v) => v.toString(),
    label,
    compact = false,
}: {
    items: number[]
    value: number
    onChange: (value: number) => void
    formatValue?: (value: number) => string
    label?: string
    compact?: boolean
}) {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const scrollTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const [isScrolling, setIsScrolling] = React.useState(false)
    const itemHeight = compact ? 24 : ITEM_HEIGHT

    // Scroll to the selected value on mount and when value changes externally
    React.useEffect(() => {
        if (containerRef.current && !isScrolling) {
            const index = items.indexOf(value)
            if (index !== -1) {
                containerRef.current.scrollTo({
                    top: index * itemHeight,
                    behavior: 'smooth'
                })
            }
        }
    }, [value, items, isScrolling, itemHeight])

    const handleScroll = React.useCallback(() => {
        if (!containerRef.current) return

        setIsScrolling(true)
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)

        // Debounce to detect when scrolling stops
        const scrollTop = containerRef.current.scrollTop
        const index = Math.round(scrollTop / itemHeight)
        const clampedIndex = Math.max(0, Math.min(items.length - 1, index))

        // Snap to nearest item
        scrollTimeoutRef.current = setTimeout(() => {
            if (containerRef.current) {
                containerRef.current.scrollTo({
                    top: clampedIndex * itemHeight,
                    behavior: 'smooth'
                })
            }
            onChange(items[clampedIndex])
            setIsScrolling(false)
        }, 100)
    }, [items, itemHeight, onChange])

    const increment = () => {
        const currentIndex = items.indexOf(value)
        const nextIndex = (currentIndex + 1) % items.length
        onChange(items[nextIndex])
    }

    const decrement = () => {
        const currentIndex = items.indexOf(value)
        const prevIndex = (currentIndex - 1 + items.length) % items.length
        onChange(items[prevIndex])
    }

    return (
        <div className="flex flex-col items-center">
            {label && (
                <span className={cn("text-xs text-muted-foreground font-medium uppercase tracking-wider", compact ? "mb-1 text-[0.625rem]" : "mb-2")}>
                    {label}
                </span>
            )}
            <div className={cn("flex flex-col overflow-hidden rounded-xl bg-muted/50", compact ? "h-[82px]" : "h-[132px]")}>
                {/* Increment button */}
                <button
                    type="button"
                    onClick={decrement}
                    aria-label={`Previous ${label?.toLowerCase() ?? 'value'}`}
                    className={cn("flex shrink-0 items-center justify-center transition-colors hover:bg-muted", compact ? "h-4" : "h-6")}
                >
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                </button>

                {/* Scroll container */}
                <div className={cn("relative overflow-hidden", compact ? "h-[50px]" : "h-[84px]")}>
                    {/* Selection highlight */}
                    <div className={cn("absolute inset-x-0 top-1/2 -translate-y-1/2 bg-primary/10 border-y border-primary/20 pointer-events-none z-10", compact ? "h-6" : "h-[44px]")} />

                    {/* Gradient overlays */}
                    <div className={cn("absolute inset-x-0 top-0 bg-gradient-to-b from-background to-transparent z-[5] pointer-events-none", compact ? "h-5" : "h-10")} />
                    <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-background to-transparent z-[5] pointer-events-none", compact ? "h-5" : "h-10")} />

                    {/* Scrollable list */}
                    <div
                        ref={containerRef}
                        className="h-full overflow-y-auto scrollbar-none scroll-smooth px-4"
                        onScroll={handleScroll}
                        style={{
                            scrollSnapType: 'y mandatory',
                            paddingTop: compact ? 12 : 20,
                            paddingBottom: compact ? 12 : 20,
                        }}
                    >
                        {items.map((item, index) => {
                            const isSelected = item === value
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => onChange(item)}
                                    className={cn(
                                        cn("w-full flex items-center justify-center font-semibold transition-all", compact ? "h-6 text-sm" : "h-[44px] text-xl"),
                                        "scroll-snap-align-center",
                                        isSelected
                                            ? "text-primary scale-110"
                                            : "text-muted-foreground/60 hover:text-muted-foreground"
                                    )}
                                    style={{ scrollSnapAlign: 'center' }}
                                >
                                    {formatValue(item)}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Decrement button */}
                <button
                    type="button"
                    onClick={increment}
                    aria-label={`Next ${label?.toLowerCase() ?? 'value'}`}
                    className={cn("flex shrink-0 items-center justify-center transition-colors hover:bg-muted", compact ? "h-5" : "h-6")}
                >
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
            </div>
        </div>
    )
}

function AmPmToggle({
    value,
    onChange,
    compact = false,
}: {
    value: 'AM' | 'PM'
    onChange: (value: 'AM' | 'PM') => void
    compact?: boolean
}) {
    return (
        <div className="flex flex-col gap-1">
            <span className={cn("text-xs text-muted-foreground font-medium uppercase tracking-wider text-center", compact ? "mb-1 text-[0.625rem]" : "mb-2")}>
                Period
            </span>
            <div className="flex flex-col bg-muted/50 rounded-xl overflow-hidden">
                <button
                    type="button"
                    onClick={() => onChange('AM')}
                    className={cn(
                        cn("font-semibold transition-all", compact ? "px-2 py-1.5 text-sm" : "px-4 py-3 text-lg"),
                        value === 'AM'
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted"
                    )}
                >
                    AM
                </button>
                <button
                    type="button"
                    onClick={() => onChange('PM')}
                    className={cn(
                        cn("font-semibold transition-all", compact ? "px-2 py-1.5 text-sm" : "px-4 py-3 text-lg"),
                        value === 'PM'
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted"
                    )}
                >
                    PM
                </button>
            </div>
        </div>
    )
}

export function TimePicker({ value, onChange, className, disabled, compact = false }: TimePickerProps) {
    // Parse the value (24h format) to hours, minutes, and AM/PM
    const parsed = React.useMemo(() => {
        if (!value) {
            return { hour: 12, minute: 0, period: 'AM' as const }
        }
        const [h, m] = value.split(':').map(Number)
        const period = h >= 12 ? 'PM' as const : 'AM' as const
        const hour12 = h % 12 || 12
        return { hour: hour12, minute: m, period }
    }, [value])

    const [hour, setHour] = React.useState(parsed.hour)
    const [minute, setMinute] = React.useState(parsed.minute)
    const [period, setPeriod] = React.useState<'AM' | 'PM'>(parsed.period)

    // Sync internal state with external value
    React.useEffect(() => {
        setHour(parsed.hour)
        setMinute(parsed.minute)
        setPeriod(parsed.period)
    }, [parsed])

    // Convert back to 24h format and call onChange
    const emitChange = React.useCallback((h: number, m: number, p: 'AM' | 'PM') => {
        let hour24 = h
        if (p === 'PM' && h !== 12) {
            hour24 = h + 12
        } else if (p === 'AM' && h === 12) {
            hour24 = 0
        }
        const timeString = `${hour24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
        onChange?.(timeString)
    }, [onChange])

    const handleHourChange = (h: number) => {
        setHour(h)
        emitChange(h, minute, period)
    }

    const handleMinuteChange = (m: number) => {
        setMinute(m)
        emitChange(hour, m, period)
    }

    const handlePeriodChange = (p: 'AM' | 'PM') => {
        setPeriod(p)
        emitChange(hour, minute, p)
    }

    const separatorHeight = compact ? 'h-[82px]' : 'h-[132px]'
    const separatorTextSize = compact ? 'text-2xl' : 'text-3xl'

    return (
        <div className={cn(
            "flex items-end justify-center gap-2 p-4",
            compact && "gap-1 p-2",
            disabled && "opacity-50 pointer-events-none",
            className
        )}>
            <WheelColumn
                items={HOURS}
                value={hour}
                onChange={handleHourChange}
                formatValue={(v) => v.toString()}
                label="Hour"
                compact={compact}
            />

            <div className={cn("flex flex-col items-center justify-center mt-6", separatorHeight)}>
                <span className={cn("font-bold text-muted-foreground", separatorTextSize)}>:</span>
            </div>

            <WheelColumn
                items={MINUTES}
                value={minute}
                onChange={handleMinuteChange}
                formatValue={(v) => v.toString().padStart(2, '0')}
                label="Minute"
                compact={compact}
            />

            <div className={cn(compact ? "ml-1" : "ml-2")}>
                <AmPmToggle value={period} onChange={handlePeriodChange} compact={compact} />
            </div>
        </div>
    )
}

// Compact time display that opens the picker
interface TimePickerTriggerProps {
    value?: string
    onChange?: (value: string) => void
    id?: string
    placeholder?: string
    className?: string
    disabled?: boolean
    compact?: boolean
}

export function TimePickerTrigger({ value, onChange, id, placeholder = "Select time", className, disabled, compact = false }: TimePickerTriggerProps) {
    const [isOpen, setIsOpen] = React.useState(false)
    const [tempValue, setTempValue] = React.useState(value || '09:00')

    React.useEffect(() => {
        if (value) {
            setTempValue(value)
        }
    }, [value])

    const displayValue = React.useMemo(() => {
        if (!value) return placeholder
        const [h, m] = value.split(':').map(Number)
        const period = h >= 12 ? 'PM' : 'AM'
        const hour12 = h % 12 || 12
        return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
    }, [value, placeholder])

    const parsedTime = React.useMemo(() => {
        const [hour24, minute] = tempValue.split(':').map(Number)
        return {
            hour: hour24 % 12 || 12,
            minute: Number.isNaN(minute) ? 0 : minute,
            period: hour24 >= 12 ? 'PM' as const : 'AM' as const,
        }
    }, [tempValue])

    const setTimePart = (hour: number, minute: number, period: 'AM' | 'PM') => {
        let hour24 = hour % 12
        if (period === 'PM') hour24 += 12
        setTempValue(`${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
    }

    const handleConfirm = () => {
        onChange?.(tempValue)
        setIsOpen(false)
    }

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        "justify-start font-normal",
                        !value && "text-muted-foreground",
                        className
                    )}
                >
                    <Clock className="mr-2 h-4 w-4" />
                    {displayValue}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                align="center"
                sideOffset={8}
                collisionPadding={16}
                avoidCollisions
                className={cn("max-w-[calc(100vw-2rem)] rounded-2xl p-0", compact ? "w-[240px]" : "w-[320px]")}
            >
                <div className="p-2 text-center">
                    <h3 className="font-semibold">Select Time</h3>
                </div>

                <div className="flex items-center gap-1.5 p-3">
                    <Select value={String(parsedTime.hour)} onValueChange={(next) => setTimePart(Number(next), parsedTime.minute, parsedTime.period)}>
                        <SelectTrigger size="sm" aria-label="Hour" className="min-w-0 flex-1 justify-center rounded-xl border-border/70 px-2">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" className="max-h-36 min-w-0 rounded-xl border-border/70 p-1">
                            {HOURS.map((hour) => (
                                <SelectItem key={hour} value={String(hour)} className="rounded-lg tabular-nums">
                                    {String(hour).padStart(2, '0')}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">:</span>
                    <Select value={String(parsedTime.minute)} onValueChange={(next) => setTimePart(parsedTime.hour, Number(next), parsedTime.period)}>
                        <SelectTrigger size="sm" aria-label="Minute" className="min-w-0 flex-1 justify-center rounded-xl border-border/70 px-2">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" className="max-h-36 min-w-0 rounded-xl border-border/70 p-1">
                            {TIME_MINUTES.map((minute) => (
                                <SelectItem key={minute} value={String(minute)} className="rounded-lg tabular-nums">
                                    {String(minute).padStart(2, '0')}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={parsedTime.period} onValueChange={(next) => setTimePart(parsedTime.hour, parsedTime.minute, next as 'AM' | 'PM')}>
                        <SelectTrigger size="sm" aria-label="AM or PM" className="min-w-0 flex-1 justify-center rounded-xl border-border/70 px-2">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" className="min-w-0 rounded-xl border-border/70 p-1">
                            <SelectItem value="AM" className="rounded-lg">AM</SelectItem>
                            <SelectItem value="PM" className="rounded-lg">PM</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex justify-center gap-2 p-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-full px-3 text-xs"
                        onClick={() => setIsOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button type="button" className="h-8 rounded-full px-3 text-xs" onClick={handleConfirm}>
                        Confirm
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}

// Simple inline time input for forms
interface TimeInputProps {
    value?: string // "HH:MM" format
    onChange?: (value: string) => void
    className?: string
    disabled?: boolean
}

export function TimeInput({ value = '09:00', onChange, className, disabled }: TimeInputProps) {
    const [hour, setHour] = React.useState(() => {
        const [h] = value.split(':').map(Number)
        return h % 12 || 12
    })
    const [minute, setMinute] = React.useState(() => {
        const [, m] = value.split(':').map(Number)
        return m
    })
    const [period, setPeriod] = React.useState<'AM' | 'PM'>(() => {
        const [h] = value.split(':').map(Number)
        return h >= 12 ? 'PM' : 'AM'
    })

    const emitChange = React.useCallback((h: number, m: number, p: 'AM' | 'PM') => {
        let hour24 = h
        if (p === 'PM' && h !== 12) {
            hour24 = h + 12
        } else if (p === 'AM' && h === 12) {
            hour24 = 0
        }
        onChange?.(`${hour24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }, [onChange])

    return (
        <div className={cn(
            "inline-flex items-center justify-center gap-0.5 bg-muted/50 rounded-lg px-2 py-2",
            disabled && "opacity-50 pointer-events-none",
            className
        )}>
            <Select
                value={String(hour)}
                onValueChange={(value) => {
                    const h = Number(value)
                    setHour(h)
                    emitChange(h, minute, period)
                }}
                disabled={disabled}
            >
                <SelectTrigger
                    size="sm"
                    aria-label="Hour"
                    className="w-[3.75rem] gap-1 border-0 bg-transparent px-1 text-lg font-semibold shadow-none focus-visible:ring-0"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 min-w-[4.5rem] rounded-xl border-border/70 p-1">
                    {HOURS.map(h => (
                        <SelectItem key={h} value={String(h)}>{h}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <span className="text-lg font-bold text-muted-foreground">:</span>

            <Select
                value={String(minute)}
                onValueChange={(value) => {
                    const m = Number(value)
                    setMinute(m)
                    emitChange(hour, m, period)
                }}
                disabled={disabled}
            >
                <SelectTrigger
                    size="sm"
                    aria-label="Minute"
                    className="w-[4.25rem] gap-1 border-0 bg-transparent px-1 text-lg font-semibold shadow-none focus-visible:ring-0"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 min-w-[4.5rem] rounded-xl border-border/70 p-1">
                    {MINUTES.map(m => (
                        <SelectItem key={m} value={String(m)}>
                            {m.toString().padStart(2, '0')}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select
                value={period}
                onValueChange={(value) => {
                    const p = value as 'AM' | 'PM'
                    setPeriod(p)
                    emitChange(hour, minute, p)
                }}
                disabled={disabled}
            >
                <SelectTrigger
                    size="sm"
                    aria-label="Period"
                    className="ml-1 w-[4.25rem] gap-1 border-0 bg-transparent px-1 text-sm font-semibold text-primary shadow-none focus-visible:ring-0"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-[4.5rem] rounded-xl border-border/70 p-1">
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                </SelectContent>
            </Select>
        </div>
    )
}

// Filled pill trigger that opens a rounded popover with the time wheel
interface TimePickerPopoverProps {
    value?: string
    onChange?: (value: string) => void
    placeholder?: string
    className?: string
    disabled?: boolean
}

export function TimePickerPopover({ value, onChange, placeholder = "Select time", className, disabled }: TimePickerPopoverProps) {
    return (
        <TimePickerTrigger
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className={className}
            disabled={disabled}
            compact
        />
    )
}

