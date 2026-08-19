'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Building2, CreditCard, MapPin, Shield } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
  saveMerchantBilling,
  saveMerchantBillingCardWithVault,
  type MerchantBankAccountType,
  type MerchantBillingCardSetupRecord,
  type MerchantBillingMethod,
  type MerchantBillingProfileRecord,
} from '@/app/manage/actions/merchant-billing'
import {
  PaymentCardForm,
  type PaymentCardFormHandle,
} from '@/app/sites/components/checkout/PaymentCardForm'
import { PageHeader } from '@/components/dashboard/shell'

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
}

const MERCHANT_WIDE_VALUE = '__merchant_wide__'

function maskLastFour(lastFour?: string | null): string {
  if (!lastFour) return 'Not available'
  return `****${lastFour}`
}

function formatCardExpiry(month?: number | null, year?: number | null): string {
  if (!month || !year) return 'Unknown'
  return `${String(month).padStart(2, '0')}/${year}`
}

function scopeLabel(profile: MerchantBillingProfileRecord | null, locations: BillingLocationOption[]): string {
  if (!profile?.location_id) return 'Merchant-wide'
  return locations.find((location) => location.id === profile.location_id)?.name || profile.location_name || 'Location'
}

export function MerchantBillingSetupCard({
  merchantId,
  merchantName,
  context,
  canEdit = true,
  locations,
}: MerchantBillingSetupCardProps) {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [profiles, setProfiles] = useState<MerchantBillingProfileRecord[]>([])
  const [cardSetup, setCardSetup] = useState<MerchantBillingCardSetupRecord>({
    configured: false,
    label: null,
    tokenizationKey: null,
  })
  const [selectedScope, setSelectedScope] = useState<string>(locations[0]?.id || MERCHANT_WIDE_VALUE)
  const [method, setMethod] = useState<MerchantBillingMethod>('ach')

  const [bankName, setBankName] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [routingNumber, setRoutingNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountType, setAccountType] = useState<MerchantBankAccountType>('checking')

  const [cardholderName, setCardholderName] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [cardFormError, setCardFormError] = useState('')
  const cardFormRef = useRef<PaymentCardFormHandle | null>(null)

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

  const refreshProfiles = () => {
    startTransition(async () => {
      try {
        const [nextProfiles, nextCardSetup] = await Promise.all([
          getMerchantBillingProfiles(merchantId),
          getMerchantBillingCardSetup(merchantId),
        ])
        setProfiles(nextProfiles)
        setCardSetup(nextCardSetup)
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load billing profiles.')
      } finally {
        setIsLoading(false)
      }
    })
  }

  useEffect(() => {
    refreshProfiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId])

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
    if (scopedPrimaryProfile) {
      setMethod(scopedPrimaryProfile.billing_method)
      if (scopedPrimaryProfile.billing_method === 'ach') {
        setBankName(scopedPrimaryProfile.bank_name || '')
        setAccountHolderName(scopedPrimaryProfile.account_holder_name || '')
        setAccountType((scopedPrimaryProfile.account_type as MerchantBankAccountType | null) || 'checking')
        setRoutingNumber('')
        setAccountNumber('')
      } else {
        setCardholderName(scopedPrimaryProfile.account_holder_name || '')
        setBillingEmail(scopedPrimaryProfile.billing_email || '')
      }
      return
    }

    setMethod('ach')
    setBankName('')
    setAccountHolderName('')
    setRoutingNumber('')
    setAccountNumber('')
    setAccountType('checking')
    setCardholderName('')
    setBillingEmail('')
  }, [scopedPrimaryProfile])

  const handleSave = () => {
    const scopedLocationId = selectedScope === MERCHANT_WIDE_VALUE ? null : selectedScope

    startTransition(async () => {
      if (method === 'card') {
        const validation = cardFormRef.current?.validateCardInput()
        if (!validation?.valid) {
          toast.error(validation?.error || 'Please complete your card details.')
          return
        }

        let tokenizedCard: { tokenId: string; cardType: string | null; cardLastFour: string | null }
        try {
          tokenizedCard = await cardFormRef.current!.tokenize()
        } catch (error: any) {
          toast.error(error?.message || 'Failed to tokenize card.')
          return
        }

        const result = await saveMerchantBillingCardWithVault({
          merchantId,
          locationId: scopedLocationId,
          paymentToken: tokenizedCard.tokenId,
          cardholderName,
          billingEmail,
          cardBrand: tokenizedCard.cardType,
          cardLastFour: tokenizedCard.cardLastFour,
        })

        if (!result.success) {
          toast.error(result.error || 'Failed to save billing profile.')
          return
        }

        toast.success(scopedLocationId ? 'Location billing card saved to NMI vault.' : 'Merchant-wide billing card saved to NMI vault.')
        setCardFormError('')
        refreshProfiles()
        return
      }

      const result = await saveMerchantBilling({
        merchantId,
        locationId: scopedLocationId,
        billingMethod: method,
        bankName,
        accountHolderName,
        routingNumber,
        accountNumber,
        accountType,
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to save billing profile.')
        return
      }

      toast.success('Billing profile saved.')
      setRoutingNumber('')
      setAccountNumber('')
      refreshProfiles()
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & payment method"
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
          Billing profiles can be saved merchant-wide or per location. Subscription billing should use the location-specific profile, while legacy or non-subscription flows can still rely on merchant-wide ACH/card records.
        </AlertDescription>
      </Alert>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Billing Profile Scope</CardTitle>
          <CardDescription>
            Choose which location owns the billing method. Per-location billing profiles are recommended for subscriptions.
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

      {scopedPrimaryProfile && (
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base">Current Primary Billing Method</CardTitle>
            <CardDescription>
              Scope: <span className="font-medium text-foreground">{scopeLabel(scopedPrimaryProfile, locations)}</span>{' '}
              - Verification status:{' '}
              <Badge variant={scopedPrimaryProfile.is_verified ? 'default' : 'secondary'}>
                {scopedPrimaryProfile.is_verified ? 'Verified' : 'Pending Verification'}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {scopedPrimaryProfile.billing_method === 'ach' ? (
              <>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{scopedPrimaryProfile.bank_name || 'Bank not set'}</span>
                </div>
                <div>Account: {maskLastFour(scopedPrimaryProfile.account_number_last_four)}</div>
                <div>Routing: {maskLastFour(scopedPrimaryProfile.routing_number_last_four)}</div>
                <div>Type: {scopedPrimaryProfile.account_type || 'Unknown'}</div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span className="capitalize">{scopedPrimaryProfile.card_brand || 'Card'}</span>
                </div>
                <div>Card: {maskLastFour(scopedPrimaryProfile.card_last_four)}</div>
                <div>Expires: {formatCardExpiry(scopedPrimaryProfile.card_exp_month, scopedPrimaryProfile.card_exp_year)}</div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Update Billing Method</CardTitle>
          <CardDescription>Save a primary billing profile for the selected scope.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Billing Method</Label>
            <RadioGroup
              className="grid gap-3 md:grid-cols-2"
              value={method}
              onValueChange={(value) => setMethod(value as MerchantBillingMethod)}
            >
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
                <RadioGroupItem value="ach" id="billing-ach" />
                <div>
                  <div className="font-medium">ACH / Bank Account</div>
                  <div className="text-xs text-muted-foreground">Can be location-specific or merchant-wide</div>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
                <RadioGroupItem value="card" id="billing-card" />
                <div>
                  <div className="font-medium">Credit / Debit Card</div>
                  <div className="text-xs text-muted-foreground">Stored in the Dexa Billing NMI vault</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          {method === 'ach' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bank-name">Bank Name</Label>
                <Input
                  id="bank-name"
                  value={bankName}
                  onChange={(event) => setBankName(event.target.value)}
                  placeholder="Chase Bank"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-holder-name">Account Holder Name</Label>
                <Input
                  id="account-holder-name"
                  value={accountHolderName}
                  onChange={(event) => setAccountHolderName(event.target.value)}
                  placeholder="Joe's Coffee LLC"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="routing-number">Routing Number</Label>
                <Input
                  id="routing-number"
                  value={routingNumber}
                  onChange={(event) => setRoutingNumber(event.target.value)}
                  placeholder="9 digits"
                  inputMode="numeric"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-number">Account Number</Label>
                <Input
                  id="account-number"
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value)}
                  placeholder="Account number"
                  inputMode="numeric"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Account Type</Label>
                <RadioGroup
                  className="flex gap-4"
                  value={accountType}
                  onValueChange={(value) => setAccountType(value as MerchantBankAccountType)}
                >
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="checking" id="acct-checking" />
                    Checking
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="savings" id="acct-savings" />
                    Savings
                  </label>
                </RadioGroup>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!cardSetup.configured ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Dexa Billing NMI is not configured yet. Ask HQ to add the platform billing keys first.
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

              {cardSetup.tokenizationKey ? (
                <PaymentCardForm
                  ref={cardFormRef}
                  tokenizationKey={cardSetup.tokenizationKey}
                  onError={setCardFormError}
                  disabled={!canEdit || !cardSetup.configured}
                  country="US"
                  currency="USD"
                  price="0.00"
                />
              ) : null}

              {cardFormError ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{cardFormError}</AlertDescription>
                </Alert>
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

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={
                isLoading ||
                isPending ||
                !canEdit ||
                (method === 'card' && !cardSetup.configured)
              }
            >
              {isPending ? 'Saving...' : 'Save Payment Method'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
