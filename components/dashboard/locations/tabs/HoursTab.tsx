'use client'

import { useState } from 'react'
import { Location, BusinessHours, DayHours, DEFAULT_BUSINESS_HOURS } from '@/types/merchant_locations'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Clock,
    Edit,
    Save,
    X,
    Copy,
    Loader2,
    Sun,
    Moon
} from 'lucide-react'
import { toast } from 'sonner'
import { UpdateLocation } from '@/app/dashboard/actions/locations'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface HoursTabProps {
    location: Location
    onUpdate?: () => void
    setHasUnsavedChanges: (value: boolean) => void
}

const DAYS_OF_WEEK = [
    { key: 'monday', label: 'Monday', short: 'Mon' },
    { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
    { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
    { key: 'thursday', label: 'Thursday', short: 'Thu' },
    { key: 'friday', label: 'Friday', short: 'Fri' },
    { key: 'saturday', label: 'Saturday', short: 'Sat' },
    { key: 'sunday', label: 'Sunday', short: 'Sun' },
] as const

// Generate time options in 30-minute intervals
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2)
    const minutes = (i % 2) * 30
    const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
    const ampm = hours < 12 ? 'AM' : 'PM'
    const label = `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`
    return { value: time, label }
})

export function HoursTab({ location, onUpdate, setHasUnsavedChanges }: HoursTabProps) {
    const queryClient = useQueryClient()
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    // Initialize business hours with defaults for missing days
    const initializeHours = (): BusinessHours => {
        const hours = { ...DEFAULT_BUSINESS_HOURS }
        if (location.business_hours) {
            Object.keys(location.business_hours).forEach((day) => {
                const dayKey = day as keyof BusinessHours
                if (location.business_hours[dayKey]) {
                    hours[dayKey] = location.business_hours[dayKey]
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
        setBusinessHours(prev => ({
            ...prev,
            [day]: {
                ...prev[day],
                ...updates
            }
        }))
    }

    const handleCopyToAll = () => {
        const mondayHours = businessHours.monday
        if (!mondayHours) return

        const newHours: BusinessHours = {}
        DAYS_OF_WEEK.forEach(({ key }) => {
            newHours[key] = { ...mondayHours }
        })
        setBusinessHours(newHours)
        toast.info('Copied Monday hours to all days')
    }

    const handleSave = async () => {
        setIsSaving(true)

        try {
            const result = await UpdateLocation(location.id, {
                business_hours: businessHours
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
        } catch (error) {
            toast.error('Update Failed', { description: 'An unexpected error occurred' })
        } finally {
            setIsSaving(false)
        }
    }

    const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':').map(Number)
        const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
        const ampm = hours < 12 ? 'AM' : 'PM'
        return `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`
    }

    const getDayHours = (day: keyof BusinessHours): DayHours => {
        return businessHours[day] || DEFAULT_BUSINESS_HOURS[day] || { open: '09:00', close: '17:00', is_closed: false }
    }

    const isWeekday = (day: string) => !['saturday', 'sunday'].includes(day)

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Operating Hours
                        </CardTitle>
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
                        <div className="space-y-4 animate-in fade-in duration-200">
                            {/* Copy button */}
                            <div className="flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCopyToAll}
                                    className="gap-1"
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                    Copy Monday to All
                                </Button>
                            </div>

                            {/* Days editor */}
                            <div className="space-y-3">
                                {DAYS_OF_WEEK.map(({ key, label }, index) => {
                                    const hours = getDayHours(key)
                                    return (
                                        <div
                                            key={key}
                                            className={cn(
                                                "flex items-center gap-4 p-3 rounded-lg border",
                                                "animate-in fade-in slide-in-from-left-2 duration-200",
                                                hours.is_closed && "bg-muted/50"
                                            )}
                                            style={{ animationDelay: `${index * 30}ms` }}
                                        >
                                            <div className="w-24 flex items-center gap-2">
                                                {isWeekday(key) ? (
                                                    <Sun className="h-4 w-4 text-amber-500" />
                                                ) : (
                                                    <Moon className="h-4 w-4 text-indigo-500" />
                                                )}
                                                <Label className="font-medium">{label}</Label>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    checked={hours.is_closed}
                                                    onCheckedChange={(checked) =>
                                                        handleDayChange(key, { is_closed: !!checked })
                                                    }
                                                />
                                                <Label className="text-sm text-muted-foreground">Closed</Label>
                                            </div>

                                            <div className={cn(
                                                "flex-1 flex items-center gap-2",
                                                hours.is_closed && "opacity-50 pointer-events-none"
                                            )}>
                                                <Select
                                                    value={hours.open}
                                                    onValueChange={(value) => handleDayChange(key, { open: value })}
                                                    disabled={hours.is_closed}
                                                >
                                                    <SelectTrigger className="w-32">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {TIME_OPTIONS.map((option) => (
                                                            <SelectItem key={option.value} value={option.value}>
                                                                {option.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>

                                                <span className="text-muted-foreground">to</span>

                                                <Select
                                                    value={hours.close}
                                                    onValueChange={(value) => handleDayChange(key, { close: value })}
                                                    disabled={hours.is_closed}
                                                >
                                                    <SelectTrigger className="w-32">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {TIME_OPTIONS.map((option) => (
                                                            <SelectItem key={option.value} value={option.value}>
                                                                {option.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Save/Cancel buttons */}
                            <div className="flex items-center gap-2 pt-2">
                                <Button onClick={handleSave} disabled={isSaving} size="sm">
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4 mr-1" />
                                    )}
                                    Save Hours
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                                    <X className="h-4 w-4 mr-1" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {DAYS_OF_WEEK.map(({ key, label, short }, index) => {
                                const hours = getDayHours(key)
                                return (
                                    <div
                                        key={key}
                                        className={cn(
                                            "flex items-center justify-between py-2 border-b last:border-0",
                                            "animate-in fade-in slide-in-from-left-1 duration-200"
                                        )}
                                        style={{ animationDelay: `${index * 30}ms` }}
                                    >
                                        <div className="flex items-center gap-2">
                                            {isWeekday(key) ? (
                                                <Sun className="h-4 w-4 text-amber-500" />
                                            ) : (
                                                <Moon className="h-4 w-4 text-indigo-500" />
                                            )}
                                            <span className="font-medium w-24">{label}</span>
                                        </div>
                                        {hours.is_closed ? (
                                            <Badge variant="secondary" className="text-xs">
                                                Closed
                                            </Badge>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">
                                                {formatTime(hours.open)} - {formatTime(hours.close)}
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Visual Weekly Preview */}
            {!isEditing && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Weekly Overview</CardTitle>
                        <CardDescription>Visual representation of operating hours</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-7 gap-1">
                            {DAYS_OF_WEEK.map(({ key, short }) => {
                                const hours = getDayHours(key)
                                const openHour = parseInt(hours.open.split(':')[0])
                                const closeHour = parseInt(hours.close.split(':')[0])
                                const duration = hours.is_closed ? 0 : closeHour - openHour

                                return (
                                    <div key={key} className="text-center">
                                        <p className="text-xs font-medium mb-1">{short}</p>
                                        <div className="h-24 bg-muted rounded relative overflow-hidden">
                                            {!hours.is_closed && (
                                                <div
                                                    className="absolute left-0 right-0 bg-primary/30 rounded"
                                                    style={{
                                                        top: `${(openHour / 24) * 100}%`,
                                                        height: `${(duration / 24) * 100}%`,
                                                    }}
                                                />
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

