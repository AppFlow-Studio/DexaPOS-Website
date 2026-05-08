'use client'

import * as React from 'react'
import { Loader2, User } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useAdminUpdateStaffProfile } from '@/lib/queries/use-admin-staff'
import type { AdminStaffMember } from '@/types/staff'

interface EditStaffProfileDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    merchantId: string
    staff: AdminStaffMember | null
}

export function EditStaffProfileDialog({
    open,
    onOpenChange,
    merchantId,
    staff,
}: EditStaffProfileDialogProps) {
    const mutation = useAdminUpdateStaffProfile()

    const [firstName, setFirstName] = React.useState('')
    const [lastName, setLastName] = React.useState('')
    const [email, setEmail] = React.useState('')
    const [phone, setPhone] = React.useState('')

    React.useEffect(() => {
        if (open && staff) {
            setFirstName(staff.first_name || '')
            setLastName(staff.last_name || '')
            setEmail(staff.email || '')
            setPhone(staff.phone || '')
        }
    }, [open, staff])

    if (!staff) return null

    const isClerkUser = staff.account_type === 'clerk'
    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    const isValid = !!trimmedFirst && !!trimmedLast
    const isUnchanged =
        trimmedFirst === (staff.first_name || '').trim() &&
        trimmedLast === (staff.last_name || '').trim() &&
        (email.trim() || null) === (staff.email || null) &&
        (phone.trim() || null) === (staff.phone || null)

    const handleSave = () => {
        if (!isValid || isUnchanged || mutation.isPending) return

        mutation.mutate(
            {
                merchantId,
                staffProfileId: staff.staff_profile_id || '',
                changes: {
                    firstName: trimmedFirst,
                    lastName: trimmedLast,
                    email: isClerkUser ? undefined : (email.trim() || null),
                    phone: phone.trim() || null,
                },
            },
            {
                onSuccess: (result) => {
                    if (!result.success) {
                        toast.error(result.error || 'Failed to update staff profile.')
                        return
                    }
                    toast.success('Staff profile updated.')
                    onOpenChange(false)
                },
                onError: (error) => {
                    toast.error(`Failed: ${(error as Error).message || 'Unknown error'}`)
                },
            },
        )
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
        >
            <DialogContent className="sm:max-w-115" elevation="high">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                            <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-base">Edit staff profile</DialogTitle>
                            <DialogDescription className="text-xs mt-0.5 truncate">
                                {staff.display_name}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="staff-first-name">First name</Label>
                            <Input
                                id="staff-first-name"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                disabled={mutation.isPending}
                                autoComplete="off"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="staff-last-name">Last name</Label>
                            <Input
                                id="staff-last-name"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                disabled={mutation.isPending}
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="staff-email">Email</Label>
                        <Input
                            id="staff-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={mutation.isPending || isClerkUser}
                            className={isClerkUser ? 'bg-muted/40 cursor-not-allowed' : ''}
                        />
                        {isClerkUser && (
                            <p className="text-xs text-muted-foreground">
                                Email changes for dashboard users require Clerk verification
                                and cannot be edited from here.
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="staff-phone">Phone</Label>
                        <Input
                            id="staff-phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            disabled={mutation.isPending}
                            autoComplete="off"
                            placeholder="+1 555 123 4567"
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-2 justify-between sm:justify-between">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={mutation.isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!isValid || isUnchanged || mutation.isPending}
                    >
                        {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {mutation.isPending ? 'Saving...' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
