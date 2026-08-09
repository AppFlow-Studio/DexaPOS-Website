'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Clock, ChevronUp, ChevronDown } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

interface TimePickerProps {
    value?: string // "HH:MM" format (24h)
    onChange?: (value: string) => void
    className?: string
    disabled?: boolean
}

// Generate arrays for hours, minutes
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1) // 1-12
const MINUTES = Array.from({ length: 60 }, (_, i) => i) // 0-59

// Item height for scroll calculations
const ITEM_HEIGHT = 44

function WheelColumn({
    items,
    value,
    onChange,
    formatValue = (v) => v.toString(),
    label,
}: {
    items: number[]
    value: number
    onChange: (value: number) => void
    formatValue?: (value: number) => string
    label?: string
}) {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [isScrolling, setIsScrolling] = React.useState(false)

    // Scroll to the selected value on mount and when value changes externally
    React.useEffect(() => {
        if (containerRef.current && !isScrolling) {
            const index = items.indexOf(value)
            if (index !== -1) {
                containerRef.current.scrollTo({
                    top: index * ITEM_HEIGHT,
                    behavior: 'smooth'
                })
            }
        }
    }, [value, items, isScrolling])

    const handleScroll = React.useCallback(() => {
        if (!containerRef.current) return

        setIsScrolling(true)

        // Debounce to detect when scrolling stops
        const scrollTop = containerRef.current.scrollTop
        const index = Math.round(scrollTop / ITEM_HEIGHT)
        const clampedIndex = Math.max(0, Math.min(items.length - 1, index))

        // Snap to nearest item
        setTimeout(() => {
            if (containerRef.current) {
                containerRef.current.scrollTo({
                    top: clampedIndex * ITEM_HEIGHT,
                    behavior: 'smooth'
                })
            }
            onChange(items[clampedIndex])
            setIsScrolling(false)
        }, 100)
    }, [items, onChange])

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
                <span className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">
                    {label}
                </span>
            )}
            <div className="flex h-[132px] flex-col overflow-hidden rounded-xl bg-muted/50">
                {/* Increment button */}
                <button
                    type="button"
                    onClick={decrement}
                    aria-label={`Previous ${label?.toLowerCase() ?? 'value'}`}
                    className="flex h-6 shrink-0 items-center justify-center transition-colors hover:bg-muted"
                >
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                </button>

                {/* Scroll container */}
                <div className="relative h-[84px] overflow-hidden">
                    {/* Selection highlight */}
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[44px] bg-primary/10 border-y border-primary/20 pointer-events-none z-10" />

                    {/* Gradient overlays */}
                    <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-background to-transparent z-[5] pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent z-[5] pointer-events-none" />

                    {/* Scrollable list */}
                    <div
                        ref={containerRef}
                        className="h-full overflow-y-auto scrollbar-none scroll-smooth px-4"
                        onScroll={handleScroll}
                        style={{
                            scrollSnapType: 'y mandatory',
                            paddingTop: 20,
                            paddingBottom: 20,
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
                                        "w-full h-[44px] flex items-center justify-center text-xl font-semibold transition-all",
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
                    className="flex h-6 shrink-0 items-center justify-center transition-colors hover:bg-muted"
                >
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
            </div>
        </div>
    )
}

function AmPmToggle({
    value,
    onChange
}: {
    value: 'AM' | 'PM'
    onChange: (value: 'AM' | 'PM') => void
}) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider text-center">
                Period
            </span>
            <div className="flex flex-col bg-muted/50 rounded-xl overflow-hidden">
                <button
                    type="button"
                    onClick={() => onChange('AM')}
                    className={cn(
                        "px-4 py-3 text-lg font-semibold transition-all",
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
                        "px-4 py-3 text-lg font-semibold transition-all",
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

export function TimePicker({ value, onChange, className, disabled }: TimePickerProps) {
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

    return (
        <div className={cn(
            "flex items-end justify-center gap-2 p-4",
            disabled && "opacity-50 pointer-events-none",
            className
        )}>
            <WheelColumn
                items={HOURS}
                value={hour}
                onChange={handleHourChange}
                formatValue={(v) => v.toString()}
                label="Hour"
            />

            <div className="flex flex-col items-center justify-center h-[132px] mt-6">
                <span className="text-3xl font-bold text-muted-foreground">:</span>
            </div>

            <WheelColumn
                items={MINUTES}
                value={minute}
                onChange={handleMinuteChange}
                formatValue={(v) => v.toString().padStart(2, '0')}
                label="Minute"
            />

            <div className="ml-2">
                <AmPmToggle value={period} onChange={handlePeriodChange} />
            </div>
        </div>
    )
}

// Compact time display that opens the picker
interface TimePickerTriggerProps {
    value?: string
    onChange?: (value: string) => void
    placeholder?: string
    className?: string
    disabled?: boolean
}

export function TimePickerTrigger({ value, onChange, placeholder = "Select time", className, disabled }: TimePickerTriggerProps) {
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

    const handleConfirm = () => {
        onChange?.(tempValue)
        setIsOpen(false)
    }

    return (
        <>
            <Button
                type="button"
                variant="outline"
                onClick={() => !disabled && setIsOpen(true)}
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

            {isOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
                    onClick={() => setIsOpen(false)}
                >
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" />
                    <div
                        className={cn(
                            "relative bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm",
                            "animate-in slide-in-from-bottom sm:zoom-in-95 duration-300"
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-center pt-3 pb-1 sm:hidden">
                            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
                        </div>

                        <div className="p-4 border-b text-center">
                            <h3 className="font-semibold">Select Time</h3>
                        </div>

                        <TimePicker
                            value={tempValue}
                            onChange={setTempValue}
                        />

                        <div className="p-4 border-t flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1"
                                onClick={() => setIsOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="flex-1"
                                onClick={handleConfirm}
                            >
                                Confirm
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
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
                <SelectContent className="max-h-60 min-w-[4.5rem]">
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
                <SelectContent className="max-h-60 min-w-[4.5rem]">
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
                <SelectContent className="min-w-[4.5rem]">
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                </SelectContent>
            </Select>
        </div>
    )
}

