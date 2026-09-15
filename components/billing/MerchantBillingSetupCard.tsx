'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Building2, CheckCircle2, CreditCard, Loader2, MapPin, Plus, Shield } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getMerchantBillingCardSetup,
  getMerchantBillingProfiles,
  provisionSubscriptionBillingRail,
  saveMerchantBillingCardWithVault,
  type MerchantBillingCardSetupRecord,
  type MerchantBillingProfileRecord,
} from '@/app/manage/actions/merchant-billing'
import { PageHeader } from '@/components/dashboard/shell'
import { PassageCheckout } from '@/lib/payments/valor/passageClient'

interface BillingLocationOption {
  id: string
  name: string
}

interface MerchantBillingSetupCardProps {
  merchantId: string
  merchantName?: string
  context: 'merchant' | 'admin'
  canEdit?: boolean
  locations: BillingLocationOption[]
  /** Renders a ghost "Back to X" pill above the title (e.g. back to the merchant). */
  backHref?: string
  backLabel?: string
}

const MERCHANT_WIDE_VALUE = '__merchant_wide__'

function maskLastFour(lastFour?: string | null): string {
  if (!lastFour) return '•••• ••••'
  return `•••• ${lastFour}`
}

function formatCardExpiry(month?: number | null, year?: number | null): string | null {
  if (!month || !year) return null
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
}

export function MerchantBillingSetupCard({
  merchantId,
  merchantName,
  context,
  canEdit = true,
  locations,
  backHref,
  backLabel,
}: MerchantBillingSetupCardProps) {
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)
  const [profiles, setProfiles] = useState<MerchantBillingProfileRecord[]>([])
  const [cardSetup, setCardSetup] = useState<MerchantBillingCardSetupRecord>({
    configured: false,
    provider: 'valor',
    label: null,
    clientToken: null,
    epi: null,
    isDemo: false,
  })
  const [selectedScope, setSelectedScope] = useState<string>(locations[0]?.id || MERCHANT_WIDE_VALUE)

  const [cardholderName, setCardholderName] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [cardFormError, setCardFormError] = useState('')

  const scopedPrimaryProfile = useMemo(() => {
    return (
      profiles.find((profile) =>
        selectedScope === MERCHANT_WIDE_VALUE
          ? profile.location_id === null && profile.is_primary
          : profile.location_id === selectedScope && profile.is_primary
      ) ||
      profiles.find((profile) =>
        selectedScope === MERCHANT_WIDE_VALUE
          ? profile.location_id === null
          : profile.location_id === selectedScope
      ) ||
      null
    )
  }, [profiles, selectedScope])

  // Every saved billing method for the selected scope — primary first, then most
  // recent. Drives the payment-methods list.
  const scopedProfiles = useMemo(() => {
    return profiles
      .filter((profile) =>
        selectedScope === MERCHANT_WIDE_VALUE
          ? profile.location_id === null
          : profile.location_id === selectedScope,
      )
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  }, [profiles, selectedScope])

  const currentScopeLabel =
    selectedScope === MERCHANT_WIDE_VALUE
      ? 'the merchant tier'
      : locations.find((location) => location.id === selectedScope)?.name || 'this location'

  const refreshProfiles = () => {
    startTransition(async () => {
      try {
        const [nextProfiles, nextCardSetup] = await Promise.all([
          getMerchantBillingProfiles(merchantId),
          getMerchantBillingCardSetup(
            merchantId,
            selectedScope === MERCHANT_WIDE_VALUE ? null : selectedScope,
          ),
        ])
        setProfiles(nextProfiles)
        setCardSetup(nextCardSetup)
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load billing profiles.')
      }
    })
  }

  useEffect(() => {
    // Switching scope returns to the saved-methods list for that scope.
    setFormOpen(false)
    setCardFormError('')
    refreshProfiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId, selectedScope])

  useEffect(() => {
    const requestedScope = searchParams.get('billingScope')
    if (!requestedScope) return

    if (requestedScope === MERCHANT_WIDE_VALUE) {
      setSelectedScope(MERCHANT_WIDE_VALUE)
      return
    }

    if (locations.some((location) => location.id === requestedScope)) {
      setSelectedScope(requestedScope)
    }
  }, [locations, searchParams])

  useEffect(() => {
    if (scopedPrimaryProfile && scopedPrimaryProfile.billing_method === 'card') {
      setCardholderName(scopedPrimaryProfile.account_holder_name || '')
      setBillingEmail(scopedPrimaryProfile.billing_email || '')
      return
    }

    setCardholderName('')
    setBillingEmail('')
  }, [scopedPrimaryProfile])

  const saveValorCard = (paymentToken: string, paymentMethod?: string) => {
    const scopedLocationId = selectedScope === MERCHANT_WIDE_VALUE ? null : selectedScope

    startTransition(async () => {
      if (!cardholderName.trim() || !billingEmail.trim()) {
        const message = 'Enter the cardholder name and billing email before saving the card.'
        setCardFormError(message)
        toast.error(message)
        return
      }

      const result = await saveMerchantBillingCardWithVault({
        merchantId,
        locationId: scopedLocationId,
        paymentToken,
        cardholderName,
        billingEmail,
        cardBrand: paymentMethod ?? null,
        cardLastFour: null,
      })

      if (!result.success) {
        setCardFormError(result.error || 'Failed to save the Valor billing profile.')
        toast.error(result.error || 'Failed to save billing profile.')
        return
      }

      toast.success(
        scopedLocationId
          ? 'Location billing card saved securely with Valor.'
          : 'Merchant-wide billing card saved securely with Valor.',
      )
      setCardFormError('')
      setCardholderName('')
      setBillingEmail('')
      setFormOpen(false)
      refreshProfiles()
    })
  }

  const handleProvisionSubscriptionRail = () => {
    const scopedLocationId = selectedScope === MERCHANT_WIDE_VALUE ? null : selectedScope

    startTransition(async () => {
      const result = await provisionSubscriptionBillingRail(merchantId, scopedLocationId)

      if (!result.success) {
        toast.error(result.error || 'Failed to set up subscription billing.')
        return
      }

      toast.success('Subscription billing is ready — you can add a card now.')
      setCardFormError('')
      refreshProfiles()
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & payment method"
        backHref={backHref}
        backLabel={backLabel}
        subtitle={
          context === 'admin'
            ? `Manage subscription billing details for ${merchantName || 'this merchant'}.`
            : 'Manage your subscription billing payment method.'
        }
      />

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Security Notice</AlertTitle>
        <AlertDescription>
          The merchant card pays the merchant tier. Each location needs its own card for its devices, integrations, and add-ons. Updating one location&apos;s card does not change other locations.
        </AlertDescription>
      </Alert>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Billing Profile Scope</CardTitle>
          <CardDescription>
            Choose Merchant-wide for the tier card, or a location for that location&apos;s subscription card. Before a merchant-wide card is configured, the tier uses the first location&apos;s card.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="billing-scope">Profile Scope</Label>
            <Select value={selectedScope} onValueChange={setSelectedScope}>
              <SelectTrigger id="billing-scope" className="w-full rounded-2xl border-border/70 bg-muted/40">
                <SelectValue placeholder="Select profile scope" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-border/70 p-1">
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id} className="rounded-xl">
                    {location.name}
                  </SelectItem>
                ))}
                <SelectItem value={MERCHANT_WIDE_VALUE} className="rounded-xl">
                  Merchant-wide (legacy / shared)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Payment methods</CardTitle>
            <CardDescription>
              Cards used for subscription billing on{' '}
              <span className="font-medium text-foreground">{currentScopeLabel}</span>.
            </CardDescription>
          </div>
          {!formOpen && canEdit ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setCardFormError('')
                setFormOpen(true)
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {scopedProfiles.length ? 'Add card' : 'Add a card'}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {!formOpen ? (
            scopedProfiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No payment method on file for this scope yet.
                {canEdit ? ' Add a card to start subscription billing.' : ''}
              </div>
            ) : (
              <div className="space-y-2.5">
                {scopedProfiles.map((profile) => {
                  const expiry = formatCardExpiry(profile.card_exp_month, profile.card_exp_year)
                  return (
                    <div
                      key={profile.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border p-3.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          {profile.billing_method === 'ach' ? (
                            <Building2 className="h-4 w-4" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          {profile.billing_method === 'ach' ? (
                            <>
                              <div className="truncate text-sm font-medium">
                                {profile.bank_name || 'Bank account'}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {maskLastFour(profile.account_number_last_four)} ·{' '}
                                {profile.account_type || 'account'}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="truncate text-sm font-medium capitalize">
                                {profile.card_brand || 'Card'} {maskLastFour(profile.card_last_four)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {expiry ? `Expires ${expiry}` : 'Card on file'}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {profile.is_primary ? <Badge>Primary</Badge> : null}
                        <Badge variant={profile.is_verified ? 'secondary' : 'outline'} className="gap-1">
                          {profile.is_verified ? <CheckCircle2 className="h-3 w-3" /> : null}
                          {profile.is_verified ? 'Verified' : 'Pending'}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            <div className="relative space-y-4">
              {isPending ? (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-background/70 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm font-medium">Saving your card…</p>
                </div>
              ) : null}

              {!cardSetup.configured ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Subscription billing isn’t set up for this scope</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>
                      Set up the Valor SaaS rail to reuse this{' '}
                      {selectedScope === MERCHANT_WIDE_VALUE ? 'merchant' : 'location'}’s boarded
                      Valor credentials, then you can store a subscription card.
                    </p>
                    {canEdit && context === 'admin' ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleProvisionSubscriptionRail}
                        disabled={isPending}
                      >
                        {isPending ? 'Setting up…' : 'Set up subscription billing'}
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Ask an HQ admin to set up subscription billing for this scope.
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              ) : null}

              {cardSetup.label ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Card will be stored in <span className="font-medium text-foreground">{cardSetup.label}</span> for the selected scope.
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cardholder-name">Cardholder Name</Label>
                  <Input
                    id="cardholder-name"
                    value={cardholderName}
                    onChange={(event) => setCardholderName(event.target.value)}
                    placeholder="Jane Doe"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="billing-email">Billing Email</Label>
                  <Input
                    id="billing-email"
                    value={billingEmail}
                    onChange={(event) => setBillingEmail(event.target.value)}
                    placeholder="billing@example.com"
                    type="email"
                    disabled={!canEdit}
                  />
                </div>
              </div>

              {cardSetup.clientToken && cardSetup.epi && canEdit ? (
                <PassageCheckout
                  clientToken={cardSetup.clientToken}
                  epi={cardSetup.epi}
                  isDemo={cardSetup.isDemo}
                  formAction="/api/valor/passage-callback"
                  submitText={isPending ? 'Saving...' : 'Save Card'}
                  onTokenReceived={({ token, method: paymentMethod }) =>
                    saveValorCard(token, paymentMethod)
                  }
                  onError={(error) =>
                    setCardFormError(error.message || 'Valor card tokenization failed.')
                  }
                  unavailableFallback={
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Valor payment fields are temporarily unavailable. Refresh and try again.
                      </AlertDescription>
                    </Alert>
                  }
                />
              ) : null}

              {cardFormError ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{cardFormError}</AlertDescription>
                </Alert>
              ) : null}

              {scopedProfiles.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFormOpen(false)
                    setCardFormError('')
                  }}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          )}

          {!canEdit && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You currently have read-only access for this merchant billing profile.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
