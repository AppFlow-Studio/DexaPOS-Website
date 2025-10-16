'use client'

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PendingOrgAdminInvitesModel } from '@/types/db-modles'
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { ClerkRevokeInvitation } from '../../actions/clerk-revoke-invitation'
export const RevokeAdminInvitePopup = ({ open, setOpen, invitation, refetch }: { open: boolean, setOpen: (open: boolean) => void, invitation: PendingOrgAdminInvitesModel, refetch: () => void }) => {
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
    const HandleRevokeInvitation = async () => {
        try {
            setIsLoading(true)
            const res = await ClerkRevokeInvitation(invitation.clerk_invite_id)
            if (res?.success) {
                toast.success('Admin invite revoked successfully')
                setOpen(false)
                refetch()
            } else {
                toast.error(res?.message || 'Failed to revoke admin invite')
            }
        } catch (error) {
            toast.error('Failed to revoke admin invite')
        } finally {

            setIsLoading(false)
        }
    }
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
                <DialogTitle>Revoke Admin Invite</DialogTitle>
                <DialogDescription>Are you sure you want to revoke this admin invite?</DialogDescription>
                <div className="flex items-center gap-4 mt-4 p-4 rounded-md border bg-muted">
                    <div className="h-12 w-12 flex items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary uppercase">
                        {invitation?.email?.[0] || 'A'}
                    </div>
                    <div>
                        <div className="font-semibold">{invitation?.email}</div>
                        <div className="text-sm mt-1 text-muted-foreground">
                            Invitation sent to admin<br />
                            {invitation?.email}
                        </div>
                        {invitation?.created_at && (
                            <div className="text-xs text-muted-foreground mt-1">
                                Invited on: {new Date(invitation.created_at).toLocaleDateString()} {new Date(invitation.created_at).toLocaleTimeString()}
                            </div>
                        )}
                    </div>
                </div>
                <Button variant="destructive" onClick={() => {
                    HandleRevokeInvitation()
                }}
                    disabled={isLoading}

                >{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Revoke'}</Button>
            </DialogContent>
        </Dialog>
    )
}