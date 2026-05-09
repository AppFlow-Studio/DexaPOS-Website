'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Building2, CreditCard, Shield } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
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

interface MerchantBillingSetupCardProps {
  merchantId: string
  merchantName?: string
  context: 'merchant' | 'admin'
  canEdit?: boolean
}

function maskLastFour(lastFour?: string | null): string {
  if (!lastFour) return 'Not available'
  return `****${lastFour}`
}

function formatCardExpiry(month?: number | null, year?: number | null): string {
  if (!month || !year) return 'Unknown'
  return `${String(month).padStart(2, '0')}/${year}`
}

export function MerchantBillingSetupCard({
  merchantId,
  merchantName,
  context,
  canEdit = true,
}: MerchantBillingSetupCardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [profiles, setProfiles] = useState<MerchantBillingProfileRecord[]>([])
  const [cardSetup, setCardSetup] = useState<MerchantBillingCardSetupRecord>({
    configured: false,
    label: null,
    tokenizationKey: null,
  })
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

  const primaryProfile = useMemo(
    () => profiles.find((profile) => profile.is_primary) || profiles[0] || null,
    [profiles]
  )

  const refreshProfiles = () => {
    startTransition(async () => {
      try {
        const [nextProfiles, nextCardSetup] = await Promise.all([
          getMerchantBillingProfiles(merchantId),
          getMerchantBillingCardSetup(merchantId),
        ])
        setProfiles(nextProfiles)
        setCardSetup(nextCardSetup)

        const primary = nextProfiles.find((profile) => profile.is_primary) || nextProfiles[0] || null
        if (primary) {
          setMethod(primary.billing_method)
          if (primary.billing_method === 'ach') {
            setBankName(primary.bank_name || '')
            setAccountHolderName(primary.account_holder_name || '')
            setAccountType((primary.account_type as MerchantBankAccountType | null) || 'checking')
            setRoutingNumber('')
            setAccountNumber('')
          } else {
            setCardholderName(primary.account_holder_name || '')
          }
        }
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

  const handleSave = () => {
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

        toast.success('Billing card saved to NMI vault.')
        setCardFormError('')
        refreshProfiles()
        return
      }

      const result = await saveMerchantBilling({
        merchantId,
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing & Payment Method</h1>
        <p className="text-muted-foreground">
          {context === 'admin'
            ? `Manage subscription billing details for ${merchantName || 'this merchant'}.`
            : 'Manage your subscription billing payment method.'}
        </p>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>Security Notice</AlertTitle>
        <AlertDescription>
          Bank account and card details should be tokenized through your payment processor. Only last-4
          values and token references are stored in DexaPOS.
        </AlertDescription>
      </Alert>

      {primaryProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Primary Billing Method</CardTitle>
            <CardDescription>
              Verification status:{' '}
              <Badge variant={primaryProfile.is_verified ? 'default' : 'secondary'}>
                {primaryProfile.is_verified ? 'Verified' : 'Pending Verification'}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {primaryProfile.billing_method === 'ach' ? (
              <>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{primaryProfile.bank_name || 'Bank not set'}</span>
                </div>
                <div>Account: {maskLastFour(primaryProfile.account_number_last_four)}</div>
                <div>Routing: {maskLastFour(primaryProfile.routing_number_last_four)}</div>
                <div>Type: {primaryProfile.account_type || 'Unknown'}</div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span className="capitalize">{primaryProfile.card_brand || 'Card'}</span>
                </div>
                <div>Card: {maskLastFour(primaryProfile.card_last_four)}</div>
                <div>Expires: {formatCardExpiry(primaryProfile.card_exp_month, primaryProfile.card_exp_year)}</div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Update Billing Method</CardTitle>
          <CardDescription>Choose ACH or card and save a new primary billing profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Billing Method</Label>
            <RadioGroup
              className="grid gap-3 md:grid-cols-2"
              value={method}
              onValueChange={(value) => setMethod(value as MerchantBillingMethod)}
            >
              <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3">
                <RadioGroupItem value="ach" id="billing-ach" />
                <div>
                  <div className="font-medium">ACH / Bank Account</div>
                  <div className="text-xs text-muted-foreground">Recommended for recurring billing</div>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3">
                <RadioGroupItem value="card" id="billing-card" />
                <div>
                  <div className="font-medium">Credit / Debit Card</div>
                  <div className="text-xs text-muted-foreground">Stored in the Dexa Billing NMI vault</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          <Separator />

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
                    Dexa Billing NMI is not configured yet. Ask HQ to add the platform billing keys in
                    Settings before saving a billing card.
                  </AlertDescription>
                </Alert>
              ) : null}

              {cardSetup.label ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Billing card will be stored in: <span className="font-medium text-foreground">{cardSetup.label}</span>
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
