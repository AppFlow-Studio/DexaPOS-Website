'use client'

import * as React from 'react'
import {
    BottomSheet,
    BottomSheetContent,
    BottomSheetHeader,
    BottomSheetBody,
    BottomSheetFooter,
    BottomSheetTitle,
    BottomSheetDescription,
} from '@/components/ui/bottom-sheet'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UnifiedStaffMember, EmploymentType } from '@/types/staff'
import { RolesModel } from '@/types/db-modles'
import { cn } from '@/lib/utils'
import {
    Mail,
    Phone,
    MapPin,
    Lock,
    CheckCircle2,
    UserX,
    UserCheck,
    KeyRound,
    Activity,
    Edit,
    Save,
    X,
    DollarSign,
    ArrowUpCircle,
    Info,
    Loader2,
} from 'lucide-react'
import {
    useDeactivateStaff,
    useReactivateStaff,
    useResetStaffPIN,
    useUpdateStaffAssignment,
    useUpgradePOSToClerk,
} from '@/app/dashboard/hooks/useStaff'
import { toast } from 'sonner'
import { GetMerchantRoles } from '@/app/dashboard/actions/staff-invite'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'

interface StaffDetailSheetProps {
    staff: UnifiedStaffMember 
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function StaffDetailSheet({ staff, open, onOpenChange }: StaffDetailSheetProps) {
    if (!staff) return null

    const deactivateStaff = useDeactivateStaff()
    const reactivateStaff = useReactivateStaff()
    const resetPIN = useResetStaffPIN()
    const updateAssignment = useUpdateStaffAssignment()
    const upgradePOSToClerk = useUpgradePOSToClerk()
    const { data: userInfo } = useUserInfo()

    // Edit mode state
    const [isEditMode, setIsEditMode] = React.useState(false)
    const [editedRole, setEditedRole] = React.useState<string>('')
    const [editedEmploymentType, setEditedEmploymentType] = React.useState<EmploymentType | null>(null)
    const [editedHourlyRate, setEditedHourlyRate] = React.useState<string>('')
    const [roles, setRoles] = React.useState<RolesModel[]>([])

    // Upgrade mode state
    const [showUpgradeDialog, setShowUpgradeDialog] = React.useState(false)
    const [upgradeEmail, setUpgradeEmail] = React.useState<string>('')


    const initials = `${staff.first_name?.[0] || ''}${staff.last_name?.[0] || ''}`.toUpperCase()

    const activeLocations = staff.location_assignments.filter(a => a.is_active)
    const primaryLocation = staff.location_assignments.find(a => a.is_primary)
    const hasPin = staff.location_assignments.some(a => a.has_pin)

    // Get current user's role level for filtering assignable roles
    const currentUserLevel = React.useMemo(() => {
        if (!userInfo?.members?.[0]) return 100 // Fallback to high level
        const member = userInfo.members[0]
        const roleCode = member.role_code || member.role
        const role = roles.find(r => r.code === roleCode)
        return role?.level || 100
    }, [userInfo, roles])

    const handleStatusToggle = () => {
        if (!primaryLocation) {
            toast.error('No primary location found')
            return
        }

        if (staff.overall_is_active) {
            deactivateStaff.mutate({
                memberId: staff.member_id,
                locationId: primaryLocation.location_id,
            })
        } else {
            reactivateStaff.mutate({
                memberId: staff.member_id,
                locationId: primaryLocation.location_id,
            })
        }
    }

    const handleResetPIN = () => {
        if (!primaryLocation) {
            toast.error('No primary location found')
            return
        }
        if (!hasPin) {
            toast.info('This staff member does not have POS access yet')
            return
        }

        resetPIN.mutate({
            memberId: staff.member_id,
            locationId: primaryLocation.location_id,
        })
    }

    // Load roles when edit mode is enabled
    React.useEffect(() => {
        if (open && isEditMode) {
            GetMerchantRoles().then(rolesData => {
                setRoles(rolesData)
            })
        }
    }, [open, isEditMode])

    // Reset edit state when staff changes
    React.useEffect(() => {
        if (staff && primaryLocation) {
            setEditedRole(primaryLocation.role_code)
            setEditedEmploymentType(primaryLocation.employment_type as EmploymentType | null)
            setEditedHourlyRate(primaryLocation.hourly_rate?.toString() || '')
        }
        setIsEditMode(false)
    }, [staff?.member_id])

    const handleSaveChanges = () => {
        if (!primaryLocation) {
            toast.error('No primary location found')
            return
        }

        const updates: any = {}

        if (editedRole !== primaryLocation.role_code) {
            updates.role_code = editedRole
        }
        if (editedEmploymentType !== primaryLocation.employment_type) {
            updates.employment_type = editedEmploymentType
        }
        const newRate = editedHourlyRate ? parseFloat(editedHourlyRate) : null
        if (newRate !== primaryLocation.hourly_rate) {
            updates.hourly_rate = newRate
        }

        if (Object.keys(updates).length === 0) {
            setIsEditMode(false)
            toast.info('No changes to save')
            return
        }

        updateAssignment.mutate(
            {
                memberId: staff.member_id,
                locationId: primaryLocation.location_id,
                updates
            },
            {
                onSuccess: () => {
                    setIsEditMode(false)
                    toast.success('Assignment updated successfully')
                }
            }
        )
    }

    const handleCancelEdit = () => {
        if (primaryLocation) {
            setEditedRole(primaryLocation.role_code)
            setEditedEmploymentType(primaryLocation.employment_type as EmploymentType | null)
            setEditedHourlyRate(primaryLocation.hourly_rate?.toString() || '')
        }
        setIsEditMode(false)
    }

    const handleUpgradeToClerk = () => {
        if (!primaryLocation) {
            toast.error('No primary location found')
            return
        }

        if (!upgradeEmail || !upgradeEmail.includes('@')) {
            toast.error('Please enter a valid email address')
            return
        }

        upgradePOSToClerk.mutate(
            {
                memberId: staff.member_id,
                locationId: primaryLocation.location_id,
                email: upgradeEmail
            },
            {
                onSuccess: () => {
                    setShowUpgradeDialog(false)
                    setUpgradeEmail('')
                }
            }
        )
    }

    const handleCancelUpgrade = () => {
        setShowUpgradeDialog(false)
        setUpgradeEmail('')
    }

    return (
        <BottomSheet open={open} onOpenChange={onOpenChange}>
            <BottomSheetContent className="w-full max-w-7xl mx-auto" height="95">
                <BottomSheetHeader className="flex flex-col gap-2">
                    <BottomSheetTitle>Staff details</BottomSheetTitle>
                    <BottomSheetDescription>
                        View and manage this team member’s access, locations, and POS settings.
                    </BottomSheetDescription>
                </BottomSheetHeader>
                <BottomSheetBody className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Profile column */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-12 w-12">
                                    <AvatarImage src={staff.avatar_url || undefined} alt={staff.display_name} />
                                    <AvatarFallback>{initials}</AvatarFallback>
                                </Avatar>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-base">
                                            {staff.first_name} {staff.last_name}
                                        </span>
                                        {!staff.is_clerk_user && (
                                            <Badge variant="outline" className="gap-1 text-xs">
                                                <Lock className="h-3 w-3" />
                                                POS only
                                            </Badge>
                                        )}
                                    </div>
                                    {staff.email && (
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Mail className="h-3 w-3" />
                                            {staff.email}
                                        </div>
                                    )}
                                    {staff.phone && (
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Phone className="h-3 w-3" />
                                            {staff.phone}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Separator />

                            {/* Primary role & location */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                        Primary assignment
                                    </div>
                                    {!isEditMode && primaryLocation && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 gap-1"
                                            onClick={() => setIsEditMode(true)}
                                        >
                                            <Edit className="h-3 w-3" />
                                            Edit
                                        </Button>
                                    )}
                                </div>

                                {primaryLocation ? (
                                    <div className="space-y-3">
                                        {/* Role Selection/Display */}
                                        <div className="space-y-2">
                                            <Label className="text-xs">Role</Label>
                                            {isEditMode ? (
                                                <Select
                                                    value={editedRole}
                                                    onValueChange={setEditedRole}
                                                >
                                                    <SelectTrigger className="h-9">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {roles
                                                            .filter(r => r.level <= currentUserLevel)
                                                            .map(role => (
                                                                <SelectItem key={role.code} value={role.code}>
                                                                    <div className="flex items-center gap-2">
                                                                        <span>{role.name}</span>
                                                                        <Badge variant="outline" className="text-xs">
                                                                            {role.code}
                                                                        </Badge>
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">
                                                        {primaryLocation.role_name}
                                                    </span>
                                                    <Badge variant="outline" className="text-xs">
                                                        {primaryLocation.role_code}
                                                    </Badge>
                                                </div>
                                            )}
                                        </div>

                                        {/* Employment Type (POS-only staff) */}
                                        {!staff.is_clerk_user && (
                                            <div className="space-y-2">
                                                <Label className="text-xs">Employment Type</Label>
                                                {isEditMode ? (
                                                    <Select
                                                        value={editedEmploymentType || undefined}
                                                        onValueChange={(value) => setEditedEmploymentType(value as EmploymentType)}
                                                    >
                                                        <SelectTrigger className="h-9">
                                                            <SelectValue placeholder="Select type" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="full-time">Full-time</SelectItem>
                                                            <SelectItem value="part-time">Part-time</SelectItem>
                                                            <SelectItem value="contractor">Contractor</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <div className="text-sm">
                                                        {primaryLocation.employment_type ? (
                                                            <Badge variant="outline" className="capitalize">
                                                                {primaryLocation.employment_type.replace('-', ' ')}
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-muted-foreground">Not set</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Hourly Rate (POS-only staff) */}
                                        {!staff.is_clerk_user && (
                                            <div className="space-y-2">
                                                <Label className="text-xs">Hourly Rate</Label>
                                                {isEditMode ? (
                                                    <div className="relative">
                                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            placeholder="0.00"
                                                            value={editedHourlyRate}
                                                            onChange={(e) => setEditedHourlyRate(e.target.value)}
                                                            className="h-9 pl-9"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="text-sm">
                                                        {primaryLocation.hourly_rate ? (
                                                            `$${primaryLocation.hourly_rate.toFixed(2)}/hour`
                                                        ) : (
                                                            <span className="text-muted-foreground">Not set</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Location */}
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <MapPin className="h-3 w-3" />
                                            {primaryLocation.location_name}
                                        </div>

                                        {/* Edit Mode Actions */}
                                        {isEditMode && (
                                            <div className="flex items-center gap-2 pt-2">
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="flex-1 gap-1"
                                                    onClick={handleSaveChanges}
                                                    disabled={updateAssignment.isPending}
                                                >
                                                    {updateAssignment.isPending ? (
                                                        <>
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                            Saving...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Save className="h-3 w-3" />
                                                            Save Changes
                                                        </>
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1 gap-1"
                                                    onClick={handleCancelEdit}
                                                    disabled={updateAssignment.isPending}
                                                >
                                                    <X className="h-3 w-3" />
                                                    Cancel
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-sm text-muted-foreground">No primary location</span>
                                )}
                            </div>

                            {/* Status */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                            Status
                                        </div>
                                        <div className="text-sm">
                                            {staff.overall_is_active ? 'Active' : 'Inactive'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={staff.overall_is_active}
                                            onCheckedChange={handleStatusToggle}
                                            disabled={
                                                !primaryLocation ||
                                                deactivateStaff.isPending ||
                                                reactivateStaff.isPending
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Settings column */}
                        <div className="space-y-4 lg:col-span-1">
                            {/* POS access card */}
                            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">POS access</span>
                                            <span className="text-xs text-muted-foreground">
                                                PIN-based login at assigned locations
                                            </span>
                                        </div>
                                    </div>
                                    <Badge
                                        variant={hasPin ? 'default' : 'outline'}
                                        className={cn(
                                            'text-xs gap-1',
                                            hasPin ? 'bg-emerald-600 text-white' : ''
                                        )}
                                    >
                                        {hasPin ? (
                                            <>
                                                <CheckCircle2 className="h-3 w-3" />
                                                PIN set
                                            </>
                                        ) : (
                                            'No PIN'
                                        )}
                                    </Badge>
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                    <div className="text-xs text-muted-foreground">
                                        Reset the POS PIN for this staff member’s primary location.
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1"
                                        onClick={handleResetPIN}
                                        disabled={
                                            !primaryLocation ||
                                            resetPIN.isPending
                                        }
                                    >
                                        <KeyRound className="h-3 w-3" />
                                        Reset PIN
                                    </Button>
                                </div>
                            </div>

                            {/* Upgrade to Dashboard User */}
                            {!staff.is_clerk_user && (
                                <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">Upgrade to Dashboard User</span>
                                            <span className="text-xs text-muted-foreground">
                                                Grant this staff member access to the web dashboard
                                            </span>
                                        </div>
                                    </div>

                                    {!showUpgradeDialog ? (
                                        <div className="pt-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="gap-1 w-full"
                                                onClick={() => setShowUpgradeDialog(true)}
                                                disabled={!primaryLocation}
                                            >
                                                <ArrowUpCircle className="h-3 w-3" />
                                                Upgrade Account
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3 pt-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="upgrade-email" className="text-xs">
                                                    Email Address
                                                </Label>
                                                <Input
                                                    id="upgrade-email"
                                                    type="email"
                                                    placeholder="user@example.com"
                                                    value={upgradeEmail}
                                                    onChange={(e) => setUpgradeEmail(e.target.value)}
                                                    className="h-9"
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    A temporary password will be generated and displayed
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    className="flex-1 gap-1"
                                                    onClick={handleUpgradeToClerk}
                                                    disabled={upgradePOSToClerk.isPending || !upgradeEmail}
                                                >
                                                    {upgradePOSToClerk.isPending && (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    )}
                                                    Confirm Upgrade
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={handleCancelUpgrade}
                                                    disabled={upgradePOSToClerk.isPending}
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Locations overview */}
                            <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium">Locations</span>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                        {activeLocations.length} active
                                    </Badge>
                                </div>
                                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                    {staff.location_assignments.map((assignment) => (
                                        <div
                                            key={assignment.location_id + assignment.role_code}
                                            className="flex items-center justify-between text-xs py-1"
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-medium">
                                                    {assignment.location_name}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    {assignment.role_name}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {assignment.is_primary && (
                                                    <Badge variant="default" className="text-[10px]">
                                                        Primary
                                                    </Badge>
                                                )}
                                                {!assignment.is_active && (
                                                    <Badge variant="outline" className="text-[10px]">
                                                        Inactive
                                                    </Badge>
                                                )}
                                                {assignment.has_pin && (
                                                    <Badge variant="secondary" className="text-[10px] gap-1">
                                                        <Lock className="h-3 w-3" />
                                                        PIN
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Logs / activity column */}
                        <div className="space-y-4 lg:col-span-1">
                            <div className="rounded-xl border bg-muted/10 p-4 space-y-3 h-full">
                                <div className="flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Activity log</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    No activity yet. When this staff member performs actions in the
                                    system, they will appear here for review.
                                </p>
                            </div>
                        </div>
                    </div>
                </BottomSheetBody>
                <BottomSheetFooter className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                        Member ID: {staff.member_id}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                        >
                            Close
                        </Button>
                        {staff.overall_is_active ? (
                            <Button
                                variant="destructive"
                                size="sm"
                                className="gap-1"
                                onClick={handleStatusToggle}
                                disabled={!primaryLocation}
                            >
                                <UserX className="h-3 w-3" />
                                Deactivate
                            </Button>
                        ) : (
                            <Button
                                variant="default"
                                size="sm"
                                className="gap-1"
                                onClick={handleStatusToggle}
                                disabled={!primaryLocation}
                            >
                                <UserCheck className="h-3 w-3" />
                                Reactivate
                            </Button>
                        )}
                    </div>
                </BottomSheetFooter>
            </BottomSheetContent>
        </BottomSheet>
    )
}


