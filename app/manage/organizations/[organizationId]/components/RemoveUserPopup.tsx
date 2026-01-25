'use client'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RemoveUser } from '../../../actions/remove-user'
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface User {
    id: string
    first_name?: string
    last_name?: string
    email?: string
    avatar_url?: string
}

export const RemoveUserPopup = ({
    open,
    setOpen,
    user,
    refetch
}: {
    open: boolean
    setOpen: (open: boolean) => void
    user: User | null
    refetch: () => void
}) => {
    const [isLoading, setIsLoading] = useState(false)

    if (!user?.id) {
        return (
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogTitle>Error</DialogTitle>
                    <DialogDescription>
                        Couldn't get the user information. Please try again or contact support.
                    </DialogDescription>
                </DialogContent>
            </Dialog>
        )
    }

    const handleRemoveUser = async () => {
        try {
            setIsLoading(true)
            const res = await RemoveUser(user.id)
            if (res && 'success' in res && res.success) {
                toast.success('User removed successfully')
                setOpen(false)
            } else {
                toast.error(res?.message || 'Failed to remove user')
            }
        } catch (error) {
            toast.error('Failed to remove user')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
                <DialogTitle>Remove User</DialogTitle>
                <DialogDescription>
                    Are you sure you want to remove this user from the organization? This action cannot be undone.
                </DialogDescription>
                <div className="flex items-center gap-4 mt-4 p-4 rounded-md border bg-muted">
                    <div className="h-12 w-12 flex items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary uppercase">
                        {user?.first_name?.[0] || user?.email?.[0] || 'U'}
                    </div>
                    <div>
                        <div className="font-semibold">
                            {user?.first_name && user?.last_name
                                ? `${user.first_name} ${user.last_name}`
                                : user?.email || 'Unknown User'
                            }
                        </div>
                        <div className="text-sm mt-1 text-muted-foreground">
                            {user?.email}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                            User ID: {user.id}
                        </div>
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
                        variant="destructive"
                        onClick={handleRemoveUser}
                        disabled={isLoading}
                    >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove User'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
