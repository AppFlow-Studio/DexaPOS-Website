'use client'

import { useState } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { useBulkUpdateMerchantFees } from '@/app/manage/hooks/usePlatformFees'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  merchantName: string
  locations: Array<{
    location_id: string
    location_name: string
    tip_surcharge_percentage: number
    dual_pricing_percentage: number
  }>
}

export function MerchantBulkFeeDialog({
  open,
  onOpenChange,
  merchantId,
  merchantName,
  locations,
}: Props) {
  const [tipPct, setTipPct] = useState('4')
  const [dualPct, setDualPct] = useState('4')
  const [applyTip, setApplyTip] = useState(true)
  const [applyDual, setApplyDual] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const mutation = useBulkUpdateMerchantFees()

  const tipNum = Number(tipPct)
  const dualNum = Number(dualPct)
  const validTip = !applyTip || (!Number.isNaN(tipNum) && tipNum >= 0 && tipNum <= 50)
  const validDual = !applyDual || (!Number.isNaN(dualNum) && dualNum >= 0 && dualNum <= 50)
  const canSubmit = (applyTip || applyDual) && validTip && validDual && confirmed

  const handleSubmit = async () => {
    if (!canSubmit) return
    const result = await mutation.mutateAsync({
      merchantId,
      tipSurchargePercentage: applyTip ? tipNum : undefined,
      dualPricingPercentage: applyDual ? dualNum : undefined,
    })
    if (result.success) {
      onOpenChange(false)
      setConfirmed(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply Fees to All Locations</DialogTitle>
          <DialogDescription>
            Sets the same rates on every location under <span className="font-medium">{merchantName}</span>. Existing payment snapshots are untouched.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="apply-tip"
                checked={applyTip}
                onCheckedChange={(v) => setApplyTip(!!v)}
              />
              <Label htmlFor="apply-tip">Tip Surcharge %</Label>
            </div>
            <Input
              type="number"
              min={0}
              max={50}
              step={0.01}
              value={tipPct}
              onChange={(e) => setTipPct(e.target.value)}
              disabled={!applyTip}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="apply-dual"
                checked={applyDual}
                onCheckedChange={(v) => setApplyDual(!!v)}
              />
              <Label htmlFor="apply-dual">Dual Pricing %</Label>
            </div>
            <Input
              type="number"
              min={0}
              max={50}
              step={0.01}
              value={dualPct}
              onChange={(e) => setDualPct(e.target.value)}
              disabled={!applyDual}
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-3 max-h-44 overflow-y-auto">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Locations that will be updated ({locations.length})
            </p>
            <ul className="space-y-1 text-xs">
              {locations.map((l) => (
                <li
                  key={l.location_id}
                  className="flex items-center justify-between"
                >
                  <span>{l.location_name}</span>
                  <span className="font-mono text-muted-foreground">
                    Tip {l.tip_surcharge_percentage}% · Dual {l.dual_pricing_percentage}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
            <Checkbox
              id="confirm-bulk"
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(!!v)}
            />
            <Label htmlFor="confirm-bulk" className="text-xs leading-snug">
              I understand this updates {locations.length} location
              {locations.length === 1 ? '' : 's'} and overwrites their current rates.
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending
              ? 'Applying...'
              : `Apply to ${locations.length} location${locations.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
