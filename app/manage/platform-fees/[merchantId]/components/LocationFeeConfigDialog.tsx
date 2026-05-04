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
import { useUpdateLocationFeeConfig } from '@/app/manage/hooks/usePlatformFees'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  location: {
    location_id: string
    location_name: string
    tip_surcharge_percentage: number
    dual_pricing_percentage: number
  } | null
}

export function LocationFeeConfigDialog({ open, onOpenChange, location }: Props) {
  const [tipPct, setTipPct] = useState('')
  const [dualPct, setDualPct] = useState('')
  const mutation = useUpdateLocationFeeConfig()

  useEffect(() => {
    if (location) {
      setTipPct(String(location.tip_surcharge_percentage ?? 0))
      setDualPct(String(location.dual_pricing_percentage ?? 0))
    }
  }, [location])

  if (!location) return null

  const tipNum = Number(tipPct)
  const dualNum = Number(dualPct)
  const validTip = !Number.isNaN(tipNum) && tipNum >= 0 && tipNum <= 50
  const validDual = !Number.isNaN(dualNum) && dualNum >= 0 && dualNum <= 50

  const handleSubmit = async () => {
    if (!validTip || !validDual) return
    const result = await mutation.mutateAsync({
      locationId: location.location_id,
      tipSurchargePercentage: tipNum !== location.tip_surcharge_percentage ? tipNum : undefined,
      dualPricingPercentage: dualNum !== location.dual_pricing_percentage ? dualNum : undefined,
    })
    if (result.success) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Fees: {location.location_name}</DialogTitle>
          <DialogDescription>
            Both rates are bounded 0–50%. Snapshots on existing payments are not
            altered — only future captures use the new rate.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tip-pct">Tip Surcharge %</Label>
            <Input
              id="tip-pct"
              type="number"
              min={0}
              max={50}
              step={0.01}
              value={tipPct}
              onChange={(e) => setTipPct(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Currently {location.tip_surcharge_percentage}% → New {validTip ? `${tipNum}%` : '—'}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dual-pct">Dual Pricing % (card surcharge)</Label>
            <Input
              id="dual-pct"
              type="number"
              min={0}
              max={50}
              step={0.01}
              value={dualPct}
              onChange={(e) => setDualPct(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Currently {location.dual_pricing_percentage}% → New {validDual ? `${dualNum}%` : '—'}
            </p>
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
            disabled={!validTip || !validDual || mutation.isPending}
          >
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
