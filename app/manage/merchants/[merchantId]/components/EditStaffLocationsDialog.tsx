'use client'

import * as React from 'react'
import { CheckCircle2, Loader2, MapPin, Star } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
    useAdminUpdateStaffLocations,
    useMerchantLocationsForStaff,
    useMerchantStaffRoles,
} from '@/lib/queries/use-admin-staff'
import type { AdminStaffMember } from '@/types/staff'

interface EditStaffLocationsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    merchantId: string
    staff: AdminStaffMember | null
}

interface LocalAssignment {
    locationId: string
    roleCode: string
    isPrimary: boolean
    hourlyRate?: number | null
    employmentType?: string | null
}

export function EditStaffLocationsDialog({
    open,
    onOpenChange,
    merchantId,
    staff,
}: EditStaffLocationsDialogProps) {
    const updateMutation = useAdminUpdateStaffLocations()
    const { data: locations = [], isLoading: locationsLoading } =
        useMerchantLocationsForStaff(merchantId)
    const { data: roles = [], isLoading: rolesLoading } = useMerchantStaffRoles()

    const [assignments, setAssignments] = React.useState<LocalAssignment[]>([])

    React.useEffect(() => {
        if (open && staff) {
            const initial: LocalAssignment[] = staff.location_assignments
                .filter((a) => a.is_active)
                .map((a) => ({
                    locationId: a.location_id,
                    roleCode: a.role_code,
                    isPrimary: a.is_primary,
                    hourlyRate: a.hourly_rate ?? null,
                    employmentType: a.employment_type ?? null,
                }))
            setAssignments(initial)
        }
    }, [open, staff])

    if (!staff) return null

    const assignedIds = new Set(assignments.map((a) => a.locationId))
    const availableLocations = locations.filter((l) => !assignedIds.has(l.id))
    const defaultRole = roles[0]?.code || ''

    const togglePrimary = (locationId: string) => {
        setAssignments((prev) =>
            prev.map((a) => ({ ...a, isPrimary: a.locationId === locationId })),
        )
    }

    const updateRole = (locationId: string, roleCode: string) => {
        setAssignments((prev) =>
            prev.map((a) => (a.locationId === locationId ? { ...a, roleCode } : a)),
        )
    }

    const removeAssignment = (locationId: string) => {
        setAssignments((prev) => {
            const next = prev.filter((a) => a.locationId !== locationId)
            // Ensure a primary still exists
            if (next.length > 0 && !next.some((a) => a.isPrimary)) {
                next[0] = { ...next[0], isPrimary: true }
            }
            return next
        })
    }

    const addLocation = (locationId: string) => {
        if (!locationId || !defaultRole) return
        setAssignments((prev) => {
            const isFirst = prev.length === 0
            return [
                ...prev,
                {
                    locationId,
                    roleCode: defaultRole,
                    isPrimary: isFirst,
                },
            ]
        })
    }

    const isValid =
        assignments.length > 0 &&
        assignments.every((a) => a.locationId && a.roleCode) &&
        assignments.filter((a) => a.isPrimary).length === 1

    const handleSave = () => {
        if (!isValid || updateMutation.isPending || !staff.staff_profile_id) return

        updateMutation.mutate(
            {
                merchantId,
                staffProfileId: staff.staff_profile_id,
                assignments: assignments.map((a) => ({
                    locationId: a.locationId,
                    roleCode: a.roleCode,
                    isPrimary: a.isPrimary,
                    hourlyRate: a.hourlyRate ?? undefined,
                    employmentType: a.employmentType ?? undefined,
                })),
            },
            {
                onSuccess: (result) => {
                    if (!result.success) {
                        toast.error(result.error || 'Failed to update locations.')
                        return
                    }
                    toast.success('Location assignments updated.')
                    onOpenChange(false)
                },
                onError: (err) => {
                    toast.error(`Failed: ${(err as Error).message || 'Unknown error'}`)
                },
            },
        )
    }

    const locationName = (id: string) => locations.find((l) => l.id === id)?.name || id

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => !updateMutation.isPending && onOpenChange(next)}
        >
            <DialogContent className="sm:max-w-150 gap-0 p-0 overflow-hidden" elevation="high">
                <div className="px-6 pt-6 pb-4 border-b">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                                <MapPin className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                                <DialogTitle className="text-base">Edit location assignments</DialogTitle>
                                <DialogDescription className="text-xs mt-0.5 truncate">
                                    {staff.display_name}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                <div className="px-6 py-4 max-h-96 overflow-y-auto space-y-3">
                    {locationsLoading || rolesLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            {assignments.length === 0 ? (
                                <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center">
                                    <MapPin className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        No locations assigned. Add at least one below.
                                    </p>
                                </div>
                            ) : (
                                assignments.map((a) => (
                                    <div
                                        key={a.locationId}
                                        className={cn(
                                            'rounded-lg border px-4 py-3 space-y-3 transition-colors',
                                            a.isPrimary ? 'border-primary/40 bg-primary/5' : 'bg-card',
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-medium truncate">
                                                        {locationName(a.locationId)}
                                                    </span>
                                                    {a.isPrimary && (
                                                        <Badge className="bg-primary text-primary-foreground gap-1 px-1.5 py-0 h-5 text-[10px]">
                                                            <Star className="h-2.5 w-2.5 fill-current" />
                                                            Primary
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {!a.isPrimary && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 px-2 text-xs"
                                                        onClick={() => togglePrimary(a.locationId)}
                                                    >
                                                        <Star className="h-3 w-3 mr-1" />
                                                        Set primary
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                                    onClick={() => removeAssignment(a.locationId)}
                                                    disabled={assignments.length === 1}
                                                >
                                                    Remove
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-1.5">
                                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                                                Role
                                            </span>
                                            <Select
                                                value={a.roleCode}
                                                onValueChange={(v) => updateRole(a.locationId, v)}
                                            >
                                                <SelectTrigger className="h-8 text-sm">
                                                    <SelectValue placeholder="Select role" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {roles.map((r) => (
                                                        <SelectItem key={r.code} value={r.code}>
                                                            {r.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                ))
                            )}

                            {availableLocations.length > 0 && (
                                <div className="pt-2">
                                    <Select onValueChange={addLocation} value="">
                                        <SelectTrigger>
                                            <SelectValue placeholder="+ Add another location..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableLocations.map((loc) => (
                                                <SelectItem key={loc.id} value={loc.id}>
                                                    {loc.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-6 py-4 border-t bg-muted/20">
                    <DialogFooter className="gap-2 sm:gap-2 justify-between sm:justify-between">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={updateMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!isValid || updateMutation.isPending}
                        >
                            {updateMutation.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            <CheckCircle2 className="mr-1.5 h-4 w-4" />
                            {updateMutation.isPending ? 'Saving...' : 'Save assignments'}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
