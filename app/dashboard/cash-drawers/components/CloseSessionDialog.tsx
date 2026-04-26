'use client'

import { useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import {
  useCloseCashDrawerSession,
  type CashDrawerListItem,
} from '@/lib/queries/use-cash-drawers'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  clerkOrgId: string
  drawer: CashDrawerListItem | null
}

function formatUSD(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  })
}

export function CloseSessionDialog({ open, onOpenChange, clerkOrgId, drawer }: Props) {
  const closeMutation = useCloseCashDrawerSession()
  const [closingAmount, setClosingAmount] = useState('')
  const [varianceNotes, setVarianceNotes] = useState('')

  useEffect(() => {
    if (open) {
      setClosingAmount('')
      setVarianceNotes('')
    }
  }, [open])

  const session = drawer?.current_session ?? null
  const parsedClosing = Number.parseFloat(closingAmount)
  const isValid = Number.isFinite(parsedClosing) && parsedClosing >= 0
  const isPending = closeMutation.isPending

  const handleSubmit = async () => {
    if (!session || !isValid) return
    const result = await closeMutation.mutateAsync({
      clerkOrgId,
      input: {
        sessionId: session.id,
        closingAmount: parsedClosing,
        varianceNotes: varianceNotes.trim() || null,
      },
    })
    if (result.success) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close Cash Drawer Session</DialogTitle>
          <DialogDescription>
            Enter the counted closing amount. Variance is computed from operations recorded
            by the POS tablet during the session.
          </DialogDescription>
        </DialogHeader>

        {session && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Drawer</span>
              <span className="font-medium">{drawer?.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Opened</span>
              <span>{format(new Date(session.opened_at), 'MMM d, p')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Opening amount</span>
              <span className="font-mono">{formatUSD(session.opening_amount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Business date</span>
              <span className="font-mono">{session.business_date}</span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="close-amount">Closing Amount (USD)</Label>
            <Input
              id="close-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={closingAmount}
              onChange={(e) => setClosingAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="close-notes">Variance Notes (optional)</Label>
            <Textarea
              id="close-notes"
              value={varianceNotes}
              onChange={(e) => setVarianceNotes(e.target.value)}
              placeholder="Explain any variance (counted twice, missing receipt, etc.)"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Close Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
