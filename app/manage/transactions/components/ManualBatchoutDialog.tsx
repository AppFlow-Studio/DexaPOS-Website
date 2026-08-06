'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useReverification } from '@clerk/nextjs'
import { isReverificationCancelledError } from '@clerk/nextjs/errors'
import type { PlatformSettlementBatch } from '@/app/manage/actions/hq-platform/transactions'
import { manualBatchout } from '@/app/manage/actions/hq-platform/transactions'

const MIN_REASON_LENGTH = 10

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function batchLabel(batch: Pick<PlatformSettlementBatch, 'batch_number' | 'acquirer' | 'batch_id'>): string {
  if (batch.batch_number) {
    return batch.acquirer ? `${batch.acquirer}-${batch.batch_number}` : batch.batch_number
  }
  return batch.batch_id
}

/**
 * Super-admin-only confirmation flow for manually reconciling a stuck settlement
 * batch. Requires the admin's account password (re-auth) plus a reason before it
 * calls `manualBatchout`, which marks the batch settled and cascades its payments.
 *
 * This is RECONCILIATION ONLY — it does not command the terminal to batch out.
 */
export function ManualBatchoutDialog({
  batch,
  open,
  onOpenChange,
  onSuccess,
}: {
  batch: PlatformSettlementBatch | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void | Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Wrap the server action so Clerk can transparently step-up (reverify) the
  // admin's identity when it's stale, show its verification modal, then retry.
  const runManualBatchout = useReverification(manualBatchout)

  // Close the dialog and clear the reason. Every close path (cancel, escape,
  // overlay click, and post-success) routes through here.
  const closeAndReset = () => {
    setReason('')
    onOpenChange(false)
  }

  const reasonValid = reason.trim().length >= MIN_REASON_LENGTH
  const canSubmit = !!batch && reasonValid && !submitting

  const handleConfirm = async () => {
    if (!batch || !canSubmit) return
    const targetBatch = batch
    const cleanReason = reason.trim()
    setSubmitting(true)

    // Close THIS dialog before triggering reverification. A Radix modal Dialog
    // locks `pointer-events` on the body and traps focus; Clerk's verification
    // modal renders in a separate portal, so leaving ours open makes Clerk's modal
    // impossible to click. Closing first hands interaction cleanly to Clerk. The
    // async call below keeps running — this component stays mounted while hidden.
    closeAndReset()

    try {
      // Clerk shows its verification modal if the admin's identity is stale, then
      // runs the reconciliation. `result` is the action's own return value.
      const result = await runManualBatchout(targetBatch.id, targetBatch.merchant_id, cleanReason)
      if (!result?.success) {
        toast.error(result?.error || 'Manual batchout failed.')
        return
      }

      toast.success(
        `Batch ${batchLabel(targetBatch)} marked settled` +
          (result.payments_settled ? ` — ${result.payments_settled.toLocaleString()} payment(s) settled.` : '.')
      )
      await onSuccess?.()
    } catch (error) {
      // The admin dismissed the verification modal — not an error, abort quietly.
      if (isReverificationCancelledError(error)) return
      console.error('[ManualBatchoutDialog] confirm error:', error)
      toast.error(error instanceof Error ? error.message : 'Manual batchout failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && (next ? onOpenChange(true) : closeAndReset())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            Manual Batchout
          </DialogTitle>
          <DialogDescription>
            Mark this batch <strong>settled</strong> in Dexa and settle its linked payments. Use this
            only when the terminal already closed the batch processor-side but Dexa is still showing it open.
          </DialogDescription>
        </DialogHeader>

        {batch && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Batch</span>
                <span className="font-mono font-medium">{batchLabel(batch)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Merchant</span>
                <span className="font-medium">{batch.merchant_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Linked amount</span>
                <span className="font-mono font-medium">{formatCurrency(batch.linked_payment_amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Linked payments</span>
                <span className="font-mono font-medium">{batch.linked_payment_count.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This is a bookkeeping reconciliation — it does <strong>not</strong> command the pinpad to
                batch out. Confirm the batch already settled at the processor before proceeding.
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-batchout-reason">
                Reason <span className="text-muted-foreground">(min {MIN_REASON_LENGTH} characters)</span>
              </Label>
              <Textarea
                id="manual-batchout-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Terminal wedged during batchout; pinpad advanced; confirmed settled at TSYS."
                rows={3}
                disabled={submitting}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              For your security, you&apos;ll be asked to verify your identity before this completes.
            </p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={closeAndReset}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={!canSubmit}
            className="w-full sm:w-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Settling…
              </>
            ) : (
              'Confirm Manual Batchout'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
