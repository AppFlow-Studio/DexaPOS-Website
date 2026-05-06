'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Loader2, Shield } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { HQ_ROLES, type HQRoleCode } from '@/types/admin'
import { changeAdminUserRole } from '@/app/manage/actions/admin-user-management'

interface EditMembershipDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    userId: string
    organizationId: string
    organizationName: string
    currentRole: string | null
    actorRoleLevel: number
    isSuperAdmin: boolean
}

const ROLE_LEVEL_COLOR: Record<number, { badge: string; ring: string; dot: string }> = {
    10: {
        badge: 'bg-red-50 text-red-700 border-red-200',
        ring: 'border-red-400 bg-red-50/40',
        dot: 'bg-red-500',
    },
    8: {
        badge: 'bg-orange-50 text-orange-700 border-orange-200',
        ring: 'border-orange-400 bg-orange-50/40',
        dot: 'bg-orange-500',
    },
    5: {
        badge: 'bg-blue-50 text-blue-700 border-blue-200',
        ring: 'border-blue-400 bg-blue-50/40',
        dot: 'bg-blue-500',
    },
}

function getRoleColors(level: number) {
    return (
        ROLE_LEVEL_COLOR[level] ?? {
            badge: 'bg-muted text-muted-foreground border-border',
            ring: 'border-border bg-muted/20',
            dot: 'bg-muted-foreground',
        }
    )
}

export function EditMembershipDialog({
    open,
    onOpenChange,
    userId,
    organizationId,
    organizationName,
    currentRole,
    actorRoleLevel,
    isSuperAdmin,
}: EditMembershipDialogProps) {
    const queryClient = useQueryClient()

    const isHQOrg =
        (currentRole ?? '').startsWith('hq.') ||
        Object.keys(HQ_ROLES).includes(currentRole ?? '')

    const initialRole = (currentRole as HQRoleCode | null) ?? null
    const [selectedRole, setSelectedRole] = useState<HQRoleCode | ''>(initialRole ?? '')
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (open) setSelectedRole(initialRole ?? '')
    }, [open, initialRole])

    const assignableRoles = useMemo(() => {
        return Object.values(HQ_ROLES)
            .filter((role) => isSuperAdmin || role.level <= actorRoleLevel)
            .sort((a, b) => b.level - a.level)
    }, [actorRoleLevel, isSuperAdmin])

    const isUnchanged = selectedRole === (initialRole ?? '')

    const handleSave = async () => {
        if (!selectedRole || isUnchanged || isSaving) return

        setIsSaving(true)
        try {
            const result = await changeAdminUserRole({
                userId,
                roleCode: selectedRole,
                organizationId,
            })

            if (result.success) {
                toast.success(result.message || 'Membership updated.')
                await queryClient.invalidateQueries({ queryKey: ['userInfo', userId] })
                onOpenChange(false)
            } else {
                toast.error(result.message || 'Failed to update membership.')
            }
        } catch (error) {
            toast.error(
                `Failed to update membership: ${(error as Error).message || 'Unknown error'}`
            )
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
            <DialogContent className="sm:max-w-115">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                            <Shield className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-base">Edit membership</DialogTitle>
                            <DialogDescription className="text-xs mt-0.5">
                                {organizationName}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-3">
                    {!isHQOrg && (
                        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-800 leading-relaxed">
                                Role editing from HQ is only supported for HQ organizations.
                                Use merchant-side staff management for merchant roles.
                            </p>
                        </div>
                    )}

                    <div className="space-y-2">
                        {assignableRoles.map((role) => {
                            const isSelected = selectedRole === role.code
                            const isCurrent = currentRole === role.code
                            const colors = getRoleColors(role.level)

                            return (
                                <button
                                    key={role.code}
                                    type="button"
                                    disabled={isSaving || !isHQOrg}
                                    onClick={() => setSelectedRole(role.code)}
                                    className={cn(
                                        'w-full text-left rounded-lg border px-4 py-3 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                                        'disabled:opacity-50 disabled:cursor-not-allowed',
                                        isSelected
                                            ? `${colors.ring} shadow-sm`
                                            : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className={cn(
                                                    'h-2.5 w-2.5 rounded-full shrink-0',
                                                    colors.dot
                                                )}
                                            />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-semibold leading-none">
                                                        {role.name}
                                                    </span>
                                                    {isCurrent && (
                                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border">
                                                            Current
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1 leading-snug">
                                                    {role.description}
                                                </p>
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center mt-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded border',
                                                        colors.badge
                                                    )}
                                                >
                                                    {role.code} · level {role.level}
                                                </span>
                                            </div>
                                        </div>
                                        <div
                                            className={cn(
                                                'h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors',
                                                isSelected
                                                    ? 'border-primary bg-primary'
                                                    : 'border-muted-foreground/30 bg-transparent'
                                            )}
                                        >
                                            {isSelected && (
                                                <CheckCircle2 className="h-3 w-3 text-white" />
                                            )}
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                <DialogFooter className="mt-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSaving}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void handleSave()}
                        disabled={isSaving || isUnchanged || !selectedRole || !isHQOrg}
                    >
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSaving ? 'Saving...' : 'Save membership'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
