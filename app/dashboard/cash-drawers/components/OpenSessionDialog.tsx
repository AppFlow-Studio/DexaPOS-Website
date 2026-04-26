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
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import {
  useOpenCashDrawerSession,
  type CashDrawerListItem,
} from '@/lib/queries/use-cash-drawers'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  clerkOrgId: string
  drawer: CashDrawerListItem | null
}

function todayLocalIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function OpenSessionDialog({ open, onOpenChange, clerkOrgId, drawer }: Props) {
  const openMutation = useOpenCashDrawerSession()

  const [openingAmount, setOpeningAmount] = useState('')
  const [businessDate, setBusinessDate] = useState(todayLocalIso())
  const [isBlindCount, setIsBlindCount] = useState(true)

  useEffect(() => {
    if (open) {
      setOpeningAmount('')
      setBusinessDate(todayLocalIso())
      setIsBlindCount(true)
    }
  }, [open])

  const parsedOpening = Number.parseFloat(openingAmount)
  const isValid = Number.isFinite(parsedOpening) && parsedOpening >= 0
  const isPending = openMutation.isPending

  const handleSubmit = async () => {
    if (!drawer || !isValid) return
    const result = await openMutation.mutateAsync({
      clerkOrgId,
      input: {
        cashDrawerId: drawer.id,
        openingAmount: parsedOpening,
        isBlindCount,
        businessDate,
      },
    })
    if (result.success) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open Cash Drawer Session</DialogTitle>
          <DialogDescription>
            {drawer ? `Start a session on "${drawer.name}".` : 'Start a session.'} Operations
            (sales, paid in/out, no-sale) are still recorded by the POS tablet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="open-amount">Opening Amount (USD)</Label>
            <Input
              id="open-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              placeholder="200.00"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="open-date">Business Date</Label>
            <Input
              id="open-date"
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="open-blind" className="font-medium">
                Blind count at close
              </Label>
              <p className="text-xs text-muted-foreground">
                When on, closer doesn&apos;t see expected cash before counting.
              </p>
            </div>
            <Switch
              id="open-blind"
              checked={isBlindCount}
              onCheckedChange={setIsBlindCount}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Open Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
