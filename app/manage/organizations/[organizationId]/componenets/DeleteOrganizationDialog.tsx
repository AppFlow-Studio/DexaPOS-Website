'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DeleteOrganization } from '../../../actions/delete-organization'
import { useRouter } from 'next/navigation'

interface DeleteOrganizationDialogProps {
    organizationId: string
    organizationName: string
    open: boolean
    setOpen: (open: boolean) => void
    onSuccess?: () => void
}

export function DeleteOrganizationDialog({
    organizationId,
    organizationName,
    open,
    setOpen,
    onSuccess
}: DeleteOrganizationDialogProps) {
    const [confirmText, setConfirmText] = useState('')
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()

    const expectedText = organizationName
    const isConfirmed = confirmText === expectedText

    const handleDelete = async () => {
        if (!isConfirmed) return

        setIsDeleting(true)
        try {
            const result = await DeleteOrganization(organizationId)

            if (result?.success !== false) {
                toast.success('Organization Deleted', {
                    description: `"${organizationName}" has been permanently deleted.`
                })
                setOpen(false)
                setConfirmText('')

                // Redirect to organizations list
                router.push('/manage/organizations')

                if (onSuccess) {
                    onSuccess()
                }
            } else {
                toast.error('Delete Failed', {
                    description: result?.message || 'Unable to delete the organization.'
                })
            }
        } catch (error) {
            console.error('Error deleting organization:', error)
            toast.error('Delete Failed', {
                description: 'Unable to delete the organization. Please try again.'
            })
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Delete Organization
                    </DialogTitle>
                    <DialogDescription className="space-y-2">
                        <p>
                            This action <strong>cannot be undone</strong>. This will permanently delete the organization
                            <strong> "{organizationName}"</strong> and remove all associated data.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            This includes:
                        </p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-4">
                            <li>All organization members and their access</li>
                            <li>All associated merchants and stores</li>
                            <li>All transaction history and data</li>
                            <li>All pending invitations</li>
                            <li>Organization settings and configurations</li>
                        </ul>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="confirm-text">
                            Type <strong>{organizationName}</strong> to confirm deletion:
                        </Label>
                        <Input
                            id="confirm-text"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder={organizationName}
                            className="border-destructive focus:border-destructive"
                        />
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        onClick={() => {
                            setOpen(false)
                            setConfirmText('')
                        }}
                        disabled={isDeleting}
                        className="w-full sm:w-auto"
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={!isConfirmed || isDeleting}
                        className="w-full sm:w-auto"
                    >
                        {isDeleting ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                Deleting...
                            </>
                        ) : (
                            <>
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Organization
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
