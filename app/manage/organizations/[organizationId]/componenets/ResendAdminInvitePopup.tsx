'use client'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PendingOrgAdminInvitesModel } from '@/types/db-modles'
import { ClerkResendInvitationAdmin } from '../../actions/clerk-resend-invitation-admin'
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export const ResendAdminInvitePopup = ({
    open,
    setOpen,
    invitation,
    refetch
}: {
    open: boolean
    setOpen: (open: boolean) => void
    invitation: PendingOrgAdminInvitesModel
    refetch: () => void
}) => {
    const [isLoading, setIsLoading] = useState(false)

    if (!invitation?.clerk_invite_id) {
        return (
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogTitle>Error</DialogTitle>
                    <DialogDescription>
                        Couldn't get the invitation ID. Please try again or contact support.
                    </DialogDescription>
                </DialogContent>
            </Dialog>
        )
    }

    const handleResendInvitation = async () => {
        try {
            setIsLoading(true)
            const res = await ClerkResendInvitationAdmin(invitation.clerk_invite_id)
            if (res?.success) {
                toast.success('Admin invite resent successfully')
                refetch()
                setOpen(false)
            } else {
                toast.error(res?.message || 'Failed to resend admin invite')
            }
        } catch (error) {
            toast.error('Failed to resend admin invite')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
                <DialogTitle>Resend Admin Invite</DialogTitle>
                <DialogDescription>
                    Are you sure you want to resend this admin invitation? A new invitation email will be sent.
                </DialogDescription>
                <div className="flex items-center gap-4 mt-4 p-4 rounded-md border bg-muted">
                    <div className="h-12 w-12 flex items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary uppercase">
                        {invitation?.email?.[0] || 'A'}
                    </div>
                    <div>
                        <div className="font-semibold">{invitation?.email}</div>
                        <div className="text-sm mt-1 text-muted-foreground">
                            Invitation will be resent to admin<br />
                            {invitation?.email}
                        </div>
                        {invitation?.created_at && (
                            <div className="text-xs text-muted-foreground mt-1">
                                Originally invited on: {new Date(invitation.created_at).toLocaleDateString()} {new Date(invitation.created_at).toLocaleTimeString()}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                    <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleResendInvitation}
                        disabled={isLoading}
                    >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resend Invite'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}