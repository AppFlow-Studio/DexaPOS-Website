'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Loader2, Lock, LifeBuoy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { RequestLocationUpgrade } from '@/app/dashboard/actions/subscription-billing'
import type {
  MerchantLocationGateTier,
  MerchantLocationGateUpgradeTarget,
} from '@/app/dashboard/actions/subscription-billing'

interface AddLocationUpsellGateProps {
  resolvedTier: MerchantLocationGateTier | null
  upgradeTarget: MerchantLocationGateUpgradeTarget | null
}

// Prices come from subscription_plans.base_price_monthly (NUMERIC dollars) —
// never hardcoded — so an HQ price edit reflects here with zero deploy.
function formatMonthly(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`
}

export function AddLocationUpsellGate({ resolvedTier, upgradeTarget }: AddLocationUpsellGateProps) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [requested, setRequested] = useState(false)

  const priceLabel = upgradeTarget ? formatMonthly(upgradeTarget.basePriceMonthly) : null

  const handleRequest = async () => {
    setSubmitting(true)
    try {
      const result = await RequestLocationUpgrade()
      if (!result.success) {
        toast.error('Request failed', { description: result.error })
        return
      }
      setRequested(true)
      toast.success('Request sent', {
        description: 'Dexa has received your request to unlock additional locations.',
      })
    } catch {
      toast.error('Request failed', { description: 'Please try again in a moment.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit gap-2 text-muted-foreground"
        onClick={() => router.push('/dashboard/locations')}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to locations
      </Button>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center gap-5 px-6 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">
              Add more locations{upgradeTarget ? ` with ${upgradeTarget.name}` : ''}
            </h1>
            {priceLabel ? (
              <p className="text-sm text-muted-foreground">
                This feature is an additional{' '}
                <span className="font-semibold text-foreground">{priceLabel}/month</span>.
                {resolvedTier ? ` Your current plan is ${resolvedTier.name}.` : ''}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your current plan doesn&apos;t include additional locations. Submit a request and
                Dexa will follow up.
              </p>
            )}
          </div>

          {requested ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Request submitted — Dexa will reach out.
            </div>
          ) : (
            <Button className="w-full gap-2 sm:w-auto" onClick={handleRequest} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit a request to unlock'
              )}
            </Button>
          )}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LifeBuoy className="h-3.5 w-3.5" />
            Questions? Reach us any time from Support.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
