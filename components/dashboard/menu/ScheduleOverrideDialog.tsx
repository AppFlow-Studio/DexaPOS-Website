'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useScheduleVisibilityMutation, useResetScheduleMutation } from '@/app/dashboard/hooks/useLocationScopedSchedules'

interface ScheduleOverrideDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    schedule: {
        id: string
        name: string
        effective_is_active: boolean
        has_location_override: boolean
    }
    locationName: string
}

export function ScheduleOverrideDialog({
    open,
    onOpenChange,
    schedule,
    locationName,
}: ScheduleOverrideDialogProps) {
    const visibilityMutation = useScheduleVisibilityMutation()
    const resetMutation = useResetScheduleMutation()

    const [isActive, setIsActive] = useState(schedule.effective_is_active)

    // Reset form when schedule changes
    useEffect(() => {
        setIsActive(schedule.effective_is_active)
    }, [schedule])

    const handleSave = async () => {
        visibilityMutation.mutate({
            scheduleId: schedule.id,
            isActive: isActive,
        }, {
            onSuccess: () => {
                onOpenChange(false)
            }
        })
    }

    const handleReset = async () => {
        resetMutation.mutate(schedule.id, {
            onSuccess: () => {
                onOpenChange(false)
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                elevation="high"
                overlayClassName="bg-slate-950/40 backdrop-blur-sm"
                className="max-w-md"
            >
                <DialogHeader>
                    <DialogTitle>Customize "{schedule.name}"</DialogTitle>
                    <DialogDescription>
                        Set location-specific settings for <Badge variant="secondary">{locationName}</Badge>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Visibility Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="is-active">Active at this location</Label>
                            <p className="text-xs text-muted-foreground">
                                Control whether this schedule is active at {locationName}
                            </p>
                        </div>
                        <Switch
                            id="is-active"
                            checked={isActive}
                            onCheckedChange={setIsActive}
                        />
                    </div>

                    {schedule.has_location_override && (
                        <div className="rounded-lg bg-muted p-3">
                            <p className="text-sm text-muted-foreground">
                                This schedule has a location-specific override. Click "Reset to Global" to remove the override and use the global setting.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex gap-2">
                    {schedule.has_location_override && (
                        <Button
                            variant="outline"
                            onClick={handleReset}
                            disabled={resetMutation.isPending}
                        >
                            Reset to Global
                        </Button>
                    )}
                    <Button
                        onClick={handleSave}
                        disabled={visibilityMutation.isPending}
                    >
                        {visibilityMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
