'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'

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
  terminalLookupFailed,
  open,
  onOpenChange,
  onSuccess,
}: {
  batch: PlatformSettlementBatch | null
  terminalLookupFailed?: boolean
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
        return
      }

      await onSuccess?.()
    } catch (error) {
      // The admin dismissed the verification modal — not an error, abort quietly.
      if (isReverificationCancelledError(error)) return
      console.error('[ManualBatchoutDialog] confirm error:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && (next ? onOpenChange(true) : closeAndReset())}>
      {/* A confirmation with a reason: a centred card at every width, never
          full-screen on phones (UI-DESIGN-SYSTEM §13.1, §12). */}
      <DialogContent className="sm:max-w-md max-sm:top-1/2 max-sm:right-auto max-sm:bottom-auto max-sm:left-1/2 max-sm:h-auto max-sm:max-h-[calc(100dvh-2rem)] max-sm:max-w-[calc(100%-2rem)] max-sm:-translate-x-1/2 max-sm:-translate-y-1/2 max-sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden />
            Mark settled in Dexa
          </DialogTitle>
          <DialogDescription>
            Mark this batch <strong>settled</strong> in Dexa and settle its linked payments. Use this
            only when the terminal already closed the batch processor-side but Dexa is still showing it open.
          </DialogDescription>
        </DialogHeader>

        {batch && (
          <div className="space-y-3">
            <div className="space-y-1 rounded-2xl bg-muted/60 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Batch</span>
                <span className="font-mono font-medium">{batchLabel(batch)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Merchant</span>
                <span className="font-medium">{batch.merchant_name}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Linked terminal</span>
                <span className="text-right font-medium">
                  {terminalLookupFailed
                    ? 'Terminal details unavailable'
                    : batch.terminal_name || batch.terminal_serial ||
                      (batch.payment_terminal_id ? 'Terminal record unavailable' : 'Not recorded')}
                  {batch.terminal_serial && <span className="block text-xs text-muted-foreground">Serial {batch.terminal_serial}</span>}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Linked amount</span>
                <span className="font-medium tabular-nums">{formatCurrency(batch.linked_payment_amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Linked payments</span>
                <span className="font-medium tabular-nums">{batch.linked_payment_count.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
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
              'Mark settled in Dexa'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
