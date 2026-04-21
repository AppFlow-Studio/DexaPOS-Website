'use client'

import { useState } from 'react'
import { Location, BusinessHours, DayHours, DEFAULT_BUSINESS_HOURS } from '@/types/merchant_locations'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Clock, Edit, Save, X, Copy, Loader2, Moon } from 'lucide-react'
import { toast } from 'sonner'
import { UpdateLocation } from '@/app/dashboard/actions/locations'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

interface HoursTabProps {
    location: Location
    onUpdate?: () => void
    setHasUnsavedChanges: (value: boolean) => void
}

const DAYS_OF_WEEK = [
    { key: 'monday',    label: 'Monday',    short: 'Mon' },
    { key: 'tuesday',   label: 'Tuesday',   short: 'Tue' },
    { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
    { key: 'thursday',  label: 'Thursday',  short: 'Thu' },
    { key: 'friday',    label: 'Friday',    short: 'Fri' },
    { key: 'saturday',  label: 'Saturday',  short: 'Sat' },
    { key: 'sunday',    label: 'Sunday',    short: 'Sun' },
] as const

// Same-day options: 00:00 – 23:30 in 30-min steps
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2)
    const m = (i % 2) * 30
    const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    const ampm = h < 12 ? 'AM' : 'PM'
    return { value, label: `${hour12}:${m.toString().padStart(2, '0')} ${ampm}` }
})

// Overnight close options: 00:00 – 06:00 (next day) in 30-min steps
const OVERNIGHT_CLOSE_OPTIONS = Array.from({ length: 13 }, (_, i) => {
    const totalMinutes = i * 30
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    const hour12 = h === 0 ? 12 : h
    return { value, label: `${hour12}:${m.toString().padStart(2, '0')} AM (next day)` }
})

export function HoursTab({ location, onUpdate, setHasUnsavedChanges }: HoursTabProps) {
    const queryClient = useQueryClient()
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    const initializeHours = (): BusinessHours => {
        const hours = { ...DEFAULT_BUSINESS_HOURS }
        if (location.business_hours) {
            Object.keys(location.business_hours).forEach((day) => {
                const dayKey = day as keyof BusinessHours
                const raw = location.business_hours[dayKey] as any
                if (!raw) return
                hours[dayKey] = {
                    open: raw.open || raw.from || '09:00',
                    close: raw.close || raw.to || '17:00',
                    is_closed: raw.is_closed ?? (raw.enabled === false),
                    is_overnight: raw.is_overnight ?? false,
                }
            })
        }
        return hours
    }

    const [businessHours, setBusinessHours] = useState<BusinessHours>(initializeHours)

    const handleStartEdit = () => {
        setBusinessHours(initializeHours())
        setIsEditing(true)
        setHasUnsavedChanges(true)
    }

    const handleCancel = () => {
        setBusinessHours(initializeHours())
        setIsEditing(false)
        setHasUnsavedChanges(false)
    }

    const handleDayChange = (day: keyof BusinessHours, updates: Partial<DayHours>) => {
        setBusinessHours(prev => ({ ...prev, [day]: { ...prev[day], ...updates } }))
    }

    const handleCopyToAll = () => {
        const mondayHours = businessHours.monday
        if (!mondayHours) return
        const newHours: BusinessHours = {}
        DAYS_OF_WEEK.forEach(({ key }) => { newHours[key] = { ...mondayHours } })
        setBusinessHours(newHours)
        toast.info('Copied Monday hours to all days')
    }

    const handleSave = async () => {
        setIsSaving(true)

        // Track latest overnight close for the tip system's business_day_end_hour
        let latestCloseAfterMidnight = 0
        DAYS_OF_WEEK.forEach(({ key }) => {
            const day = businessHours[key as keyof BusinessHours]
            if (!day || day.is_closed || !day.open || !day.close) return
            const openH = parseInt(day.open.split(':')[0])
            const closeH = parseInt(day.close.split(':')[0])
            if (closeH < openH && closeH > latestCloseAfterMidnight) {
                latestCloseAfterMidnight = closeH
            }
        })

        const dbHours: Record<string, any> = {}
        DAYS_OF_WEEK.forEach(({ key }) => {
            const day = businessHours[key as keyof BusinessHours]
            if (!day) return
            dbHours[key] = {
                from: day.open,
                to: day.close,
                enabled: !day.is_closed,
                is24Hours: false,
                open: day.open,
                close: day.close,
                is_closed: day.is_closed,
                is_overnight: day.is_overnight ?? false,
            }
        })

        try {
            const result = await UpdateLocation(location.id, {
                business_hours: dbHours as any,
                business_day_end_hour: latestCloseAfterMidnight,
            })

            if (result.error) {
                toast.error('Update Failed', { description: result.error })
                return
            }

            toast.success('Business Hours Updated', {
                description: 'Operating hours have been saved.',
                icon: <Clock className="h-4 w-4" />,
            })

            queryClient.invalidateQueries({ queryKey: ['locations'] })
            onUpdate?.()
            setIsEditing(false)
            setHasUnsavedChanges(false)
        } catch {
            toast.error('Update Failed', { description: 'An unexpected error occurred' })
        } finally {
            setIsSaving(false)
        }
    }

    const formatTime = (time: string | null | undefined) => {
        if (!time) return '--:--'
        const [h, m] = time.split(':').map(Number)
        const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
        const ampm = h < 12 ? 'AM' : 'PM'
        return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
    }

    const getDayHours = (day: keyof BusinessHours): DayHours =>
        businessHours[day] || DEFAULT_BUSINESS_HOURS[day] || { open: '09:00', close: '17:00', is_closed: false, is_overnight: false }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-base">Business Hours</CardTitle>
                        <CardDescription>Set when this location is open for business</CardDescription>
                    </div>
                    {!isEditing && (
                        <Button variant="ghost" size="sm" onClick={handleStartEdit}>
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                        </Button>
                    )}
                </CardHeader>

                <CardContent>
                    {isEditing ? (
                        <div className="space-y-3 animate-in fade-in duration-200">
                            {/* Toolbar */}
                            <div className="flex justify-end">
                                <Button variant="outline" size="sm" onClick={handleCopyToAll} className="gap-1.5">
                                    <Copy className="h-3.5 w-3.5" />
                                    Copy Monday to all
                                </Button>
                            </div>

                            {/* Day rows — matches AdminLocationDetailSheet layout exactly */}
                            {DAYS_OF_WEEK.map(({ key, label }) => {
                                const day = getDayHours(key)
                                const isOvernight = day.is_overnight ?? false
                                const closeOptions = isOvernight ? OVERNIGHT_CLOSE_OPTIONS : TIME_OPTIONS

                                const handleOvernightToggle = (checked: boolean) => {
                                    if (checked) {
                                        const keepClose = day.close <= '06:00' ? day.close : '02:00'
                                        handleDayChange(key, { is_overnight: true, close: keepClose })
                                    } else {
                                        handleDayChange(key, { is_overnight: false, close: '23:00' })
                                    }
                                }

                                return (
                                    <div key={key} className={cn('rounded-xl border p-4', day.is_closed && 'bg-muted/40')}>
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                            {/* Left: day name + open/closed toggle */}
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-2 w-32 shrink-0">
                                                    <span className="text-sm font-medium">{label}</span>
                                                    {isOvernight && !day.is_closed && (
                                                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50 gap-1 px-1.5">
                                                            <Moon className="h-2.5 w-2.5" />
                                                            Overnight
                                                        </Badge>
                                                    )}
                                                </div>
                                                <Switch
                                                    checked={!day.is_closed}
                                                    onCheckedChange={(checked) => handleDayChange(key, { is_closed: !checked })}
                                                />
                                                <span className="text-sm text-muted-foreground">
                                                    {day.is_closed ? 'Closed' : 'Open'}
                                                </span>
                                            </div>

                                            {/* Right: time pickers + overnight toggle */}
                                            <div className={cn(
                                                'flex flex-col gap-2 sm:flex-row sm:items-center',
                                                day.is_closed && 'pointer-events-none opacity-40'
                                            )}>
                                                <Select
                                                    value={day.open}
                                                    onValueChange={(value) => handleDayChange(key, { open: value })}
                                                    disabled={day.is_closed}
                                                >
                                                    <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {TIME_OPTIONS.map((opt) => (
                                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>

                                                <span className="text-sm text-muted-foreground text-center">to</span>

                                                <Select
                                                    value={day.close}
                                                    onValueChange={(value) => handleDayChange(key, { close: value })}
                                                    disabled={day.is_closed}
                                                >
                                                    <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {closeOptions.map((opt) => (
                                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>

                                                <div className="flex items-center gap-1.5">
                                                    <Switch
                                                        id={`overnight-${key}`}
                                                        checked={isOvernight}
                                                        onCheckedChange={handleOvernightToggle}
                                                        disabled={day.is_closed}
                                                    />
                                                    <Label
                                                        htmlFor={`overnight-${key}`}
                                                        className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
                                                    >
                                                        Closes next day
                                                    </Label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}

                            {/* Actions */}
                            <div className="flex items-center gap-2 pt-1">
                                <Button onClick={handleSave} disabled={isSaving} size="sm">
                                    {isSaving
                                        ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                        : <Save className="h-4 w-4 mr-1.5" />}
                                    Save Hours
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                                    <X className="h-4 w-4 mr-1.5" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        /* Read-only view */
                        <div className="space-y-1">
                            {DAYS_OF_WEEK.map(({ key, label }) => {
                                const day = getDayHours(key)
                                return (
                                    <div
                                        key={key}
                                        className="flex items-center justify-between py-2.5 border-b last:border-0"
                                    >
                                        <div className="flex items-center gap-2 w-32 shrink-0">
                                            <span className="text-sm font-medium">{label}</span>
                                        </div>
                                        {day.is_closed ? (
                                            <Badge variant="secondary" className="text-xs">Closed</Badge>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                {day.is_overnight && (
                                                    <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50 gap-1 px-1.5">
                                                        <Moon className="h-2.5 w-2.5" />
                                                        Overnight
                                                    </Badge>
                                                )}
                                                <span className="text-sm text-muted-foreground">
                                                    {formatTime(day.open)} – {formatTime(day.close)}
                                                    {day.is_overnight ? ' (next day)' : ''}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Weekly visual preview */}
            {!isEditing && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Weekly Overview</CardTitle>
                        <CardDescription>Visual representation of operating hours</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-7 gap-1">
                            {DAYS_OF_WEEK.map(({ key, short }) => {
                                const day = getDayHours(key)
                                const openHour = day.open ? parseInt(day.open.split(':')[0]) : 9
                                const closeHour = day.close ? parseInt(day.close.split(':')[0]) : 17
                                const isOvernight = day.is_overnight ?? false

                                // For overnight: bar runs from openHour → midnight (overflow hidden)
                                // plus a second segment from midnight → closeHour at the top
                                const topPct = (openHour / 24) * 100
                                const heightPct = isOvernight
                                    ? ((24 - openHour) / 24) * 100
                                    : ((closeHour - openHour) / 24) * 100
                                const overnightSegmentPct = isOvernight ? (closeHour / 24) * 100 : 0

                                return (
                                    <div key={key} className="text-center">
                                        <p className="text-xs font-medium mb-1">{short}</p>
                                        <div className="h-24 bg-muted rounded relative overflow-hidden">
                                            {!day.is_closed && (
                                                <>
                                                    {/* Main block (open → midnight or open → close) */}
                                                    <div
                                                        className={cn(
                                                            'absolute left-0 right-0 rounded',
                                                            isOvernight ? 'bg-orange-400/40' : 'bg-primary/30'
                                                        )}
                                                        style={{ top: `${topPct}%`, height: `${heightPct}%` }}
                                                    />
                                                    {/* Overnight wrap segment (midnight → close next day) */}
                                                    {isOvernight && (
                                                        <div
                                                            className="absolute left-0 right-0 top-0 rounded bg-orange-400/40"
                                                            style={{ height: `${overnightSegmentPct}%` }}
                                                        />
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-2">
                            <span>12 AM</span>
                            <span>12 PM</span>
                            <span>12 AM</span>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
