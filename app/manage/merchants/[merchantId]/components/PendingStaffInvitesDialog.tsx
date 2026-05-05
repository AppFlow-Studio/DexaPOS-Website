'use client'

import * as React from 'react'
import { Loader2, Mail, RefreshCw, Send } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
    useAdminResendStaffInvite,
    useMerchantPendingStaffInvites,
} from '@/lib/queries/use-admin-staff'

interface PendingStaffInvitesDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    merchantId: string
}

function formatDate(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PendingStaffInvitesDialog({
    open,
    onOpenChange,
    merchantId,
}: PendingStaffInvitesDialogProps) {
    const { data: invites = [], isLoading, refetch, isFetching } =
        useMerchantPendingStaffInvites(merchantId, open)
    const resendMutation = useAdminResendStaffInvite()

    const [resendingId, setResendingId] = React.useState<string | null>(null)

    const handleResend = (inviteId: string, email: string) => {
        setResendingId(inviteId)
        resendMutation.mutate(
            { merchantId, inviteId },
            {
                onSuccess: (result) => {
                    if (!result.success) {
                        toast.error(result.error || 'Failed to resend invite.')
                        return
                    }
                    toast.success(`Invitation resent to ${email}`)
                    void refetch()
                },
                onError: (err) => {
                    toast.error(`Failed: ${(err as Error).message || 'Unknown error'}`)
                },
                onSettled: () => setResendingId(null),
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-150 gap-0 p-0 overflow-hidden" elevation="high">
                <div className="px-6 pt-6 pb-4 border-b">
                    <DialogHeader>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                                    <Mail className="h-4 w-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <DialogTitle className="text-base">Pending staff invites</DialogTitle>
                                    <DialogDescription className="text-xs mt-0.5">
                                        Resend any pending invitation that hasn&apos;t been accepted yet.
                                    </DialogDescription>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => void refetch()}
                                disabled={isFetching}
                            >
                                <RefreshCw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                            </Button>
                        </div>
                    </DialogHeader>
                </div>

                <div className="px-3 py-2 max-h-96 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : invites.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <Mail className="h-8 w-8 text-muted-foreground/40 mb-2" />
                            <p className="text-sm text-muted-foreground">
                                No pending invites for this merchant.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {invites.map((invite) => {
                                const isResending = resendingId === invite.id && resendMutation.isPending
                                const fullName =
                                    `${invite.first_name || ''} ${invite.last_name || ''}`.trim() ||
                                    invite.email
                                const isExpired = new Date(invite.expires_at).getTime() < Date.now()

                                return (
                                    <div
                                        key={invite.id}
                                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium truncate">
                                                    {fullName}
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        isExpired
                                                            ? 'text-[10px] bg-red-50 text-red-700 border-red-200 px-1.5 py-0 h-4'
                                                            : 'text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200 px-1.5 py-0 h-4'
                                                    }
                                                >
                                                    {isExpired ? 'Expired' : 'Pending'}
                                                </Badge>
                                                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0 rounded">
                                                    {invite.role_code}
                                                </span>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                                {invite.email} · sent {formatDate(invite.created_at)}
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleResend(invite.id, invite.email)}
                                            disabled={isResending || resendMutation.isPending}
                                        >
                                            {isResending ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <>
                                                    <Send className="h-3.5 w-3.5 mr-1.5" />
                                                    Resend
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t bg-muted/20">
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
