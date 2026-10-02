'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BusinessHours, DayHours, DEFAULT_BUSINESS_HOURS } from '@/types/merchant_locations'
import { cn } from '@/lib/utils'
import { Copy, Moon, RotateCcw } from 'lucide-react'

interface BusinessHoursStepProps {
    data: { business_hours: BusinessHours }
    onChange: (data: { business_hours: BusinessHours }) => void
    errors?: Record<string, string>
}

const DAYS = [
    { key: 'monday',    label: 'Monday' },
    { key: 'tuesday',   label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday',  label: 'Thursday' },
    { key: 'friday',    label: 'Friday' },
    { key: 'saturday',  label: 'Saturday' },
    { key: 'sunday',    label: 'Sunday' },
] as const

// Same-day options: 00:00 – 23:30
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2)
    const minutes = (i % 2) * 30
    const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    const label = new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    })
    return { value: time, label }
})

// Overnight close options: 00:00 – 06:00 (next day)
const OVERNIGHT_CLOSE_OPTIONS = Array.from({ length: 13 }, (_, i) => {
    const totalMinutes = i * 30
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    const hour12 = h === 0 ? 12 : h
    const label = `${hour12}:${m.toString().padStart(2, '0')} AM (next day)`
    return { value, label }
})

/*
 * The time lists hold 48 half-hour slots. Uncapped, the dropdown filled the
 * screen, so it is held to about six short rows at every width; the list
 * scrolls, and Radix scrolls the chosen time into view.
 *
 * A plain `max-h-48`, not an arbitrary `max-h-[min(…, var(…))]`: the arbitrary
 * class did not take effect, and because tailwind-merge had already dropped the
 * base cap, the menu ended up with no height limit at all.
 */
const TIME_MENU = 'max-h-48'
const TIME_ITEM = 'py-1 text-[0.8125rem]'

function DayHoursRow({
    day,
    label,
    hours,
    onChange,
    error,
}: {
    day: string
    label: string
    hours: DayHours
    onChange: (hours: DayHours) => void
    error?: string
}) {
    const isOvernight = hours.is_overnight ?? false
    const closeOptions = isOvernight ? OVERNIGHT_CLOSE_OPTIONS : TIME_OPTIONS

    const handleOvernightToggle = (checked: boolean) => {
        if (checked) {
            const keepClose = hours.close <= '06:00' ? hours.close : '02:00'
            onChange({ ...hours, is_overnight: true, close: keepClose })
        } else {
            onChange({ ...hours, is_overnight: false, close: '23:00' })
        }
    }

    return (
        // Borderless tinted card (§5.8); a closed day is quieter, not coloured.
        <div className={cn('@container rounded-2xl p-4', hours.is_closed ? 'bg-muted/25' : 'bg-muted/45')}>
            <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center @3xl:justify-between">

                {/* Left: day name + open/closed toggle */}
                <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5 w-28 shrink-0">
                        <span className="text-sm font-medium">{label}</span>
                        {/* Plain words on a tinted card, not an orange pill (§3.5). */}
                        {isOvernight && !hours.is_closed && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Moon className="h-3 w-3" />
                                Overnight
                            </span>
                        )}
                    </div>
                    <Switch
                        checked={!hours.is_closed}
                        onCheckedChange={(checked) => onChange({ ...hours, is_closed: !checked })}
                    />
                    <span className="text-sm text-muted-foreground w-10">
                        {hours.is_closed ? 'Closed' : 'Open'}
                    </span>
                </div>

                {/* Right: time pickers + overnight toggle */}
                {hours.is_closed ? (
                    <span className="text-sm text-muted-foreground @3xl:text-right">Closed all day</span>
                ) : (
                    <div className="flex flex-col gap-2 @md:flex-row @md:flex-wrap @md:items-center">
                        <Select
                            value={hours.open}
                            onValueChange={(value) => onChange({ ...hours, open: value })}
                        >
                            <SelectTrigger className="w-full border-0 bg-background shadow-none @md:w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className={TIME_MENU}>
                                {TIME_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value} className={TIME_ITEM}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <span className="text-sm text-muted-foreground text-center hidden @md:block">to</span>

                        <Select
                            value={hours.close}
                            onValueChange={(value) => onChange({ ...hours, close: value })}
                        >
                            {/* w-48 ensures "12:00 AM (next day)" fits without truncation */}
                            <SelectTrigger className="w-full border-0 bg-background shadow-none @md:w-48">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className={TIME_MENU}>
                                {closeOptions.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value} className={TIME_ITEM}>{opt.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="flex items-center gap-1.5">
                            <Switch
                                id={`overnight-${day}`}
                                checked={isOvernight}
                                onCheckedChange={handleOvernightToggle}
                            />
                            <Label
                                htmlFor={`overnight-${day}`}
                                className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
                            >
                                Closes next day
                            </Label>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <p className="text-xs text-destructive mt-2">{error}</p>
            )}
        </div>
    )
}

export function BusinessHoursStep({ data, onChange, errors }: BusinessHoursStepProps) {
    const hours = data.business_hours

    const updateDay = (day: keyof BusinessHours, dayHours: DayHours) => {
        onChange({ business_hours: { ...hours, [day]: dayHours } })
    }

    const copyToAllDays = () => {
        const mondayHours = hours.monday || DEFAULT_BUSINESS_HOURS.monday!
        onChange({
            business_hours: {
                monday:    mondayHours,
                tuesday:   { ...mondayHours },
                wednesday: { ...mondayHours },
                thursday:  { ...mondayHours },
                friday:    { ...mondayHours },
                saturday:  { ...mondayHours },
                sunday:    { ...mondayHours },
            },
        })
    }

    const resetToDefaults = () => {
        onChange({ business_hours: DEFAULT_BUSINESS_HOURS })
    }

    const getDefaultHours = (day: keyof BusinessHours): DayHours =>
        hours[day] || DEFAULT_BUSINESS_HOURS[day] || { open: '09:00', close: '21:00', is_closed: false, is_overnight: false }

    return (
        <div className="space-y-6">
            {/* Toolbar — wraps rather than overflowing on phones. */}
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copyToAllDays} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    Copy Monday to all
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={resetToDefaults} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                </Button>
            </div>

            {/* Day rows */}
            <div className="space-y-3">
                {DAYS.map(({ key, label }) => (
                    <DayHoursRow
                        key={key}
                        day={key}
                        label={label}
                        hours={getDefaultHours(key)}
                        onChange={(dayHours) => updateDay(key, dayHours)}
                        error={errors?.[key]}
                    />
                ))}
            </div>

            {errors?.business_hours && (
                <p className="text-sm text-destructive">{errors.business_hours}</p>
            )}

            {/* Tips — a neutral callout (§3.5), desktop only (§13.4). */}
            <div className="rounded-2xl bg-muted/60 px-4 py-3 max-sm:hidden">
                <h4 className="text-sm font-medium mb-2">Tips</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Toggle the switch to mark a day as open or closed</li>
                    <li>• Enable &ldquo;Closes next day&rdquo; for overnight hours (e.g. 12 PM – 2 AM)</li>
                    <li>• Use &ldquo;Copy Monday to all&rdquo; for consistent hours</li>
                    <li>• Times are in 30-minute intervals</li>
                    <li>• For 24-hour operation, set open: 12:00 AM, close: 11:30 PM</li>
                </ul>
            </div>
        </div>
    )
}
