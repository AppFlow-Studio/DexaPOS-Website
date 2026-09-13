'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Lock, CreditCard, ExternalLink, Loader2, RefreshCcw, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PassageCheckout } from '@/lib/payments/valor/passageClient'
import { PurchaseMerchantServiceAddOn } from '@/app/dashboard/actions/subscription-billing'
import { useMerchantServiceEntitlement } from '@/lib/queries/use-dashboard-subscription-billing'

function formatUsd(amount: number): string {
  return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`
}

interface FeaturePaywallProps {
  serviceCode: string
  locationId: string | null | undefined
  clerkOrgId?: string | null
  title: string
  description: string
  /** Runtime grandfather: locations already using the feature bypass the paywall. */
  grandfathered?: boolean
  children: ReactNode
}

/**
 * Reusable paid-feature gate. When the location lacks the add-on, it shows a
 * paywall: pay one full month today (Valor Direct Sale) to unlock instantly,
 * then it's added to the recurring bill. When entitled or grandfathered, it
 * renders the real feature (`children`). Drives everything off `serviceCode`.
 */
export function FeaturePaywall({
  serviceCode,
  locationId,
  clerkOrgId,
  title,
  description,
  grandfathered = false,
  children,
}: FeaturePaywallProps) {
  const queryClient = useQueryClient()
  const { data: entitlement, isLoading } = useMerchantServiceEntitlement(serviceCode, locationId, clerkOrgId)

  const [cardholderName, setCardholderName] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already using the feature (grandfathered) or entitled → show the feature.
  if (grandfathered || entitlement?.entitled) {
    return <>{children}</>
  }

  // No specific location selected — let the underlying screen handle its own
  // location-picker / empty state instead of showing a paywall.
  if (!locationId || locationId === 'all') {
    return <>{children}</>
  }

  if (isLoading || !entitlement) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Checking access…
      </div>
    )
  }

  const monthly = formatUsd(entitlement.priceMonthly)
  const today = formatUsd(entitlement.activationTotal || entitlement.priceMonthly)
  const billingHref = `/dashboard/settings/billing?billingScope=${locationId}`
  const canSubmit = accepted && cardholderName.trim().length > 0 && !isSubmitting

  const handleToken = async ({ token }: { token: string; method?: string }) => {
    if (!entitlement.serviceId) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await PurchaseMerchantServiceAddOn(
        {
          locationId,
          serviceId: entitlement.serviceId,
          paymentToken: token,
          cardholderName: cardholderName.trim(),
          billingEmail: billingEmail.trim() || undefined,
        },
        { accepted },
      )
      if (!result.success) {
        setError(result.error || 'Payment could not be completed.')
        toast.error(result.error || 'Payment could not be completed.')
        return
      }
      if (result.recurringCardWarning) toast.warning(result.recurringCardWarning)
      toast.success(`${entitlement.displayName ?? title} unlocked!`)
      queryClient.invalidateQueries({ queryKey: ['service-entitlement'] })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment could not be completed.'
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl py-8">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="mt-3 flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            Unlock {entitlement.displayName ?? title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-muted/40 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Pay today</span>
              <span className="text-2xl font-semibold">{today}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Activates instantly, then <span className="font-medium text-foreground">{monthly}/mo</span> added to
              your subscription. Includes card surcharge.
            </p>
          </div>

          {!entitlement.billingConfigured || !entitlement.clientToken || !entitlement.epi ? (
            <div className="space-y-3">
              <Alert>
                <CreditCard className="h-4 w-4" />
                <AlertDescription>
                  Add a payment card for this location to unlock paid features.
                </AlertDescription>
              </Alert>
              <div className="flex items-center gap-2">
                <Button asChild size="sm">
                  <Link href={billingHref} target="_blank" rel="noopener noreferrer">
                    <CreditCard className="mr-1.5 h-4 w-4" />
                    Add a card
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['service-entitlement'] })}
                >
                  <RefreshCcw className="mr-1.5 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="paywall-cardholder">Cardholder name</Label>
                  <Input
                    id="paywall-cardholder"
                    value={cardholderName}
                    onChange={(event) => setCardholderName(event.target.value)}
                    placeholder="Jane Doe"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="paywall-email">Billing email</Label>
                  <Input
                    id="paywall-email"
                    type="email"
                    value={billingEmail}
                    onChange={(event) => setBillingEmail(event.target.value)}
                    placeholder="billing@example.com"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={accepted}
                  onCheckedChange={(checked) => setAccepted(Boolean(checked))}
                  className="mt-0.5"
                />
                <span>
                  I authorize DEXA POS to charge {today} today to activate {entitlement.displayName ?? title}, and{' '}
                  {monthly} per month thereafter until I cancel.
                </span>
              </label>

              {canSubmit ? (
                <PassageCheckout
                  clientToken={entitlement.clientToken}
                  epi={entitlement.epi}
                  isDemo={entitlement.isDemo}
                  formAction="/api/valor/passage-callback"
                  submitText={isSubmitting ? 'Processing…' : `Pay ${today} & unlock`}
                  onTokenReceived={handleToken}
                  onError={(err) => setError(err.message || 'Card entry failed.')}
                  unavailableFallback={
                    <Alert>
                      <AlertDescription>
                        Card fields are temporarily unavailable. Refresh and try again.
                      </AlertDescription>
                    </Alert>
                  }
                />
              ) : (
                <Button className="w-full" disabled>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Accept the authorization and enter a name to continue
                </Button>
              )}

              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
