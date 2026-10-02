'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { HQ_ROLES, type HQRoleCode, type HQRoleConfig } from '@/types/admin'
import { changeAdminUserRole } from '@/app/manage/actions/admin-user-management'

/** HQ roles, highest level first. */
export const HQ_ROLES_BY_LEVEL = Object.values(HQ_ROLES).sort((a, b) => b.level - a.level)

/**
 * Changes a user's HQ role. Shared by the user list ("Edit role") and the user
 * profile ("Edit membership"), so the two cannot drift apart.
 *
 * A list the user works through, so it goes full screen below `sm` (the dialog
 * default). The dialog clips; only the list scrolls (§12).
 */
export function EditRoleDialog({
    open,
    onOpenChange,
    userId,
    organizationId,
    subject,
    currentRole,
    roles,
    notice,
    onSaved,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    userId: string
    organizationId: string
    /** Who or what is being edited: the user's email, or the organization's name. */
    subject: string
    currentRole: string | null | undefined
    /** The roles the viewer may assign, highest first. */
    roles: HQRoleConfig[]
    /** Shown above the list and disables it, e.g. for a non-HQ organization. */
    notice?: string
    onSaved?: () => void
}) {
    const initialRole = currentRole && HQ_ROLES[currentRole as HQRoleCode] ? (currentRole as HQRoleCode) : null
    const [selected, setSelected] = useState<HQRoleCode | null>(initialRole)
    const [saving, setSaving] = useState(false)

    // Each opening starts from the user's current role.
    const [wasOpen, setWasOpen] = useState(open)
    if (open !== wasOpen) {
        setWasOpen(open)
        if (open) setSelected(initialRole)
    }

    const handleSave = async () => {
        if (!selected || selected === initialRole) return
        setSaving(true)
        try {
            const result = await changeAdminUserRole({ userId, roleCode: selected, organizationId })
            if (!result.success) {
                toast.error(result.message || 'Failed to update role')
                return
            }
            toast.success('Role updated')
            onOpenChange(false)
            onSaved?.()
        } catch (error) {
            console.error('[EditRoleDialog] Failed to update role:', error)
            toast.error('Failed to update role')
        } finally {
            setSaving(false)
        }
    }

    const locked = saving || !!notice

    return (
        <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
            <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-h-[85vh] sm:max-w-lg">
                <DialogHeader className="shrink-0 px-6 pb-4 pr-14 pt-6 text-left">
                    <DialogTitle>Edit role</DialogTitle>
                    <DialogDescription className="truncate">{subject}</DialogDescription>
                </DialogHeader>

                <div className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-6 pb-2">
                    {notice && (
                        <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{notice}</p>
                    )}
                    <div role="radiogroup" aria-label="HQ role" className="space-y-2">
                        {roles.map((role) => {
                            const isSelected = selected === role.code
                            return (
                                <button
                                    key={role.code}
                                    type="button"
                                    role="radio"
                                    aria-checked={isSelected}
                                    disabled={locked}
                                    onClick={() => setSelected(role.code)}
                                    className={cn(
                                        'w-full rounded-2xl px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                                        // Selected is a ring on a deeper fill, never a hue (§3.5).
                                        isSelected ? 'bg-muted ring-1 ring-border' : 'bg-muted/45 hover:bg-muted'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-x-2">
                                                <span className="text-sm font-semibold">{role.name}</span>
                                                {initialRole === role.code && (
                                                    <span className="text-xs text-muted-foreground">Current</span>
                                                )}
                                            </div>
                                            <p className="mt-1 text-xs leading-snug text-muted-foreground">
                                                {role.description}
                                            </p>
                                            <p className="mt-1.5 font-mono text-[0.6875rem] text-muted-foreground">
                                                {role.code} · level {role.level}
                                            </p>
                                        </div>
                                        <span
                                            aria-hidden
                                            className={cn(
                                                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                                isSelected
                                                    ? 'border-foreground bg-foreground text-background'
                                                    : 'border-muted-foreground/40'
                                            )}
                                        >
                                            {isSelected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                                        </span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                <DialogFooter className="shrink-0 gap-2 px-6 pb-6 pt-4 sm:justify-between">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void handleSave()}
                        disabled={locked || !selected || selected === initialRole}
                    >
                        {saving ? 'Saving…' : 'Save role'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
