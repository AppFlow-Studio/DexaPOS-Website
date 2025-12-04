'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BusinessHours, DayHours, DEFAULT_BUSINESS_HOURS } from '@/types/merchant_locations'
import { Copy, RotateCcw } from 'lucide-react'

interface BusinessHoursStepProps {
    data: { business_hours: BusinessHours }
    onChange: (data: { business_hours: BusinessHours }) => void
    errors?: Record<string, string>
}

const DAYS = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' },
] as const

// Generate time options in 30-minute intervals
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2)
    const minutes = (i % 2) * 30
    const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    const label = new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    })
    return { value: time, label }
})

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
    return (
        <div className="flex items-center gap-4 py-3 border-b last:border-0">
            <div className="w-28 shrink-0">
                <span className="font-medium text-sm">{label}</span>
            </div>

            <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground sr-only">Closed</Label>
                <Checkbox
                    checked={!hours.is_closed}
                    onCheckedChange={(checked) => onChange({ ...hours, is_closed: !checked })}
                />
                <span className="text-xs text-muted-foreground w-12">
                    {hours.is_closed ? 'Closed' : 'Open'}
                </span>
            </div>

            {!hours.is_closed && (
                <div className="flex items-center gap-2 flex-1">
                    <Select
                        value={hours.open}
                        onValueChange={(value) => onChange({ ...hours, open: value })}
                    >
                        <SelectTrigger className="w-[120px] h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TIME_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <span className="text-muted-foreground text-sm">to</span>

                    <Select
                        value={hours.close}
                        onValueChange={(value) => onChange({ ...hours, close: value })}
                    >
                        <SelectTrigger className="w-[120px] h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TIME_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {hours.is_closed && (
                <div className="flex-1 text-sm text-muted-foreground italic">
                    Location closed
                </div>
            )}

            {error && (
                <span className="text-xs text-destructive">{error}</span>
            )}
        </div>
    )
}

export function BusinessHoursStep({ data, onChange, errors }: BusinessHoursStepProps) {
    const hours = data.business_hours

    const updateDay = (day: keyof BusinessHours, dayHours: DayHours) => {
        onChange({
            business_hours: {
                ...hours,
                [day]: dayHours,
            },
        })
    }

    const copyToAllDays = () => {
        const mondayHours = hours.monday || DEFAULT_BUSINESS_HOURS.monday!
        onChange({
            business_hours: {
                monday: mondayHours,
                tuesday: { ...mondayHours },
                wednesday: { ...mondayHours },
                thursday: { ...mondayHours },
                friday: { ...mondayHours },
                saturday: { ...mondayHours },
                sunday: { ...mondayHours },
            },
        })
    }

    const resetToDefaults = () => {
        onChange({ business_hours: DEFAULT_BUSINESS_HOURS })
    }

    const getDefaultHours = (day: keyof BusinessHours): DayHours => {
        return hours[day] || DEFAULT_BUSINESS_HOURS[day] || { open: '09:00', close: '21:00', is_closed: false }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">
                        Set your regular business hours for this location
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={copyToAllDays}
                        className="gap-1.5"
                    >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Monday to all
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={resetToDefaults}
                        className="gap-1.5"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                    </Button>
                </div>
            </div>

            <div className="border rounded-lg p-4">
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

            <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="text-sm font-medium mb-2">Tips</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Toggle the Checkbox to mark a day as closed</li>
                    <li>• Use "Copy Monday to all" for consistent hours</li>
                    <li>• Times are in 30-minute intervals</li>
                    <li>• For 24-hour operation, set open: 00:00, close: 23:30</li>
                </ul>
            </div>
        </div>
    )
}

