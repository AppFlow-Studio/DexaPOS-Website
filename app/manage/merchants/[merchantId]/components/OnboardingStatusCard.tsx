'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAdminUpdateMerchantStatus } from '@/lib/queries/use-admin-merchant'
import type { MerchantDetails, MerchantOnboardingChecklist, MerchantOnboardingStatus } from '@/types/merchant'

interface OnboardingStatusCardProps {
  merchant: MerchantDetails
  canManageStatus: boolean
}

const STATUS_META: Record<
  MerchantOnboardingStatus,
  { label: string; badgeClass: string; description: string }
> = {
  created: {
    label: 'Created',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    description: 'Merchant created but setup has not started.',
  },
  onboarding: {
    label: 'Onboarding',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-300',
    description: 'Merchant setup is in progress.',
  },
  active: {
    label: 'Active',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    description: 'Merchant is live and processing payments.',
  },
  suspended: {
    label: 'Suspended',
    badgeClass: 'bg-red-100 text-red-700 border-red-300',
    description: 'Merchant access is temporarily suspended.',
  },
  cancelled: {
    label: 'Cancelled',
    badgeClass: 'bg-zinc-200 text-zinc-700 border-zinc-300',
    description: 'Merchant account has been cancelled.',
  },
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
  )
}

export function OnboardingStatusCard({ merchant, canManageStatus }: OnboardingStatusCardProps) {
  const [isPending, startTransition] = useTransition()
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const statusMutation = useAdminUpdateMerchantStatus()

  const status = (merchant.onboarding_status || 'onboarding') as MerchantOnboardingStatus
  const statusMeta = STATUS_META[status]

  const checklist: MerchantOnboardingChecklist = useMemo(
    () =>
      merchant.onboarding_checklist || {
        businessInfo: Boolean(merchant.business_legal_name && merchant.owner_email),
        ownerInvited: Boolean(merchant.clerk_org_id),
        billingAdded: false,
        firstLocation: (merchant.locations || []).length > 0,
        firstPayment: status === 'active',
      },
    [merchant, status]
  )

  const runStatusUpdate = (newStatus: 'active' | 'suspended' | 'cancelled', reason?: string) => {
    startTransition(async () => {
      const result = await statusMutation.mutateAsync({
        merchantId: merchant.id,
        newStatus,
        reason,
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to update merchant status.')
        return
      }

      const message =
        newStatus === 'active'
          ? 'Merchant activated.'
          : newStatus === 'suspended'
            ? 'Merchant suspended.'
            : 'Merchant cancelled.'
      toast.success(message)
    })
  }

  const handleSuspend = () => {
    const reason = suspendReason.trim()
    if (!reason) {
      toast.error('Suspend reason is required.')
      return
    }

    setSuspendDialogOpen(false)
    runStatusUpdate('suspended', reason)
  }

  const statusActionDisabled = isPending || statusMutation.isPending

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="text-lg">Merchant Status</CardTitle>
              <div className="mt-2 flex items-center gap-2">
                <Badge className={statusMeta.badgeClass}>{statusMeta.label}</Badge>
                <span className="text-sm text-muted-foreground">{statusMeta.description}</span>
              </div>
            </div>

            {canManageStatus && (
              <div className="flex flex-wrap gap-2">
                {status !== 'active' && status !== 'cancelled' && (
                  <Button
                    variant="default"
                    size="sm"
                    disabled={statusActionDisabled}
                    onClick={() => runStatusUpdate('active')}
                  >
                    Manually Activate
                  </Button>
                )}

                {status !== 'suspended' && status !== 'cancelled' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={statusActionDisabled}
                    onClick={() => setSuspendDialogOpen(true)}
                  >
                    Suspend
                  </Button>
                )}

                {status !== 'cancelled' && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={statusActionDisabled}
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    Cancel Account
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <ChecklistRow label="Business info completed" done={checklist.businessInfo} />
          <ChecklistRow label="Owner invited" done={checklist.ownerInvited} />
          <ChecklistRow label="Billing method added" done={checklist.billingAdded} />
          <ChecklistRow label="First location created" done={checklist.firstLocation} />
          <ChecklistRow label="First payment processed" done={checklist.firstPayment} />

          {merchant.activated_at && (
            <div className="pt-1 text-xs text-muted-foreground">
              Activated: {new Date(merchant.activated_at).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend Merchant</DialogTitle>
            <DialogDescription>
              Provide a reason. This is included in the audit log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="suspend-reason">Reason</Label>
            <Textarea
              id="suspend-reason"
              placeholder="Non-payment, compliance hold, or other reason"
              value={suspendReason}
              onChange={(event) => setSuspendReason(event.target.value)}
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSuspend} disabled={statusActionDisabled}>
              Suspend Merchant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Cancel Merchant Account
            </AlertDialogTitle>
            <AlertDialogDescription>
              This marks the merchant as cancelled and logs the action. Continue only if this is final.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusActionDisabled}>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => runStatusUpdate('cancelled')}
              disabled={statusActionDisabled}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm Cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
