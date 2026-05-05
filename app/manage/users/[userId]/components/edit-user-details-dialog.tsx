'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Mail } from 'lucide-react'
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
import { updateAdminUserDetails } from '@/app/manage/actions/admin-user-management'

interface EditUserDetailsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    userId: string
    initialFirstName: string
    initialLastName: string
    email: string
}

export function EditUserDetailsDialog({
    open,
    onOpenChange,
    userId,
    initialFirstName,
    initialLastName,
    email,
}: EditUserDetailsDialogProps) {
    const queryClient = useQueryClient()
    const [firstName, setFirstName] = useState(initialFirstName)
    const [lastName, setLastName] = useState(initialLastName)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (open) {
            setFirstName(initialFirstName)
            setLastName(initialLastName)
        }
    }, [open, initialFirstName, initialLastName])

    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()
    const isUnchanged =
        trimmedFirst === initialFirstName.trim() &&
        trimmedLast === initialLastName.trim()
    const isEmpty = !trimmedFirst && !trimmedLast

    const handleSave = async () => {
        if (isEmpty || isUnchanged || isSaving) return

        setIsSaving(true)
        try {
            const result = await updateAdminUserDetails({
                userId,
                firstName: trimmedFirst,
                lastName: trimmedLast,
            })

            if (result.success) {
                toast.success(result.message || 'User details updated.')
                await queryClient.invalidateQueries({ queryKey: ['userInfo', userId] })
                onOpenChange(false)
            } else {
                toast.error(result.message || 'Failed to update user details.')
            }
        } catch (error) {
            toast.error(
                `Failed to update user details: ${(error as Error).message || 'Unknown error'}`
            )
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Edit user details</DialogTitle>
                    <DialogDescription>
                        Update profile information for this HQ user. Changes sync to Clerk
                        and are recorded in the audit log.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-first-name">First name</Label>
                            <Input
                                id="edit-first-name"
                                value={firstName}
                                onChange={(event) => setFirstName(event.target.value)}
                                placeholder="Jane"
                                autoComplete="off"
                                disabled={isSaving}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-last-name">Last name</Label>
                            <Input
                                id="edit-last-name"
                                value={lastName}
                                onChange={(event) => setLastName(event.target.value)}
                                placeholder="Doe"
                                autoComplete="off"
                                disabled={isSaving}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="edit-email" className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            Email address
                        </Label>
                        <Input
                            id="edit-email"
                            value={email}
                            readOnly
                            disabled
                            className="bg-muted/40 cursor-not-allowed"
                        />
                        <p className="text-xs text-muted-foreground">
                            Email changes require user-side verification through Clerk and
                            cannot be edited from here.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSaving}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void handleSave()}
                        disabled={isSaving || isEmpty || isUnchanged}
                    >
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSaving ? 'Saving...' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
