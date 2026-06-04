'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Landmark, Loader2, Lock, ShieldCheck, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  upsertLocationBankingProfile,
  type AccountType,
  type LocationBankingProfileSummary,
  type PayoutFrequency,
} from '@/app/dashboard/actions/location-banking-profiles'

interface LocationBankingProfileCardProps {
  clerkOrgId: string
  locationId: string
  initialProfile: LocationBankingProfileSummary | null
}

const accountTypeLabel: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
}

const payoutFrequencyLabel: Record<PayoutFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

const dayOfWeekOptions = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

function onlyDigits(value: string, max: number): string {
  return value.replace(/\D/g, '').slice(0, max)
}

function formatCurrencyInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length === 1) return parts[0]
  return `${parts[0]}.${(parts[1] ?? '').slice(0, 2)}`
}

function formatPayoutSchedule(profile: LocationBankingProfileSummary): string {
  if (profile.payout_frequency === 'weekly' && profile.payout_day_of_week !== null) {
    const day = dayOfWeekOptions.find((d) => d.value === profile.payout_day_of_week)?.label
    return `Weekly · ${day ?? '—'}`
  }
  if (profile.payout_frequency === 'monthly' && profile.payout_day_of_month !== null) {
    return `Monthly · Day ${profile.payout_day_of_month}`
  }
  return payoutFrequencyLabel[profile.payout_frequency]
}

export function LocationBankingProfileCard({
  clerkOrgId,
  locationId,
  initialProfile,
}: LocationBankingProfileCardProps) {
  const [profile, setProfile] = useState<LocationBankingProfileSummary | null>(initialProfile)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [bankName, setBankName] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('checking')
  const [routingNumber, setRoutingNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('')
  const [payoutFrequency, setPayoutFrequency] = useState<PayoutFrequency>('daily')
  const [payoutDayOfWeek, setPayoutDayOfWeek] = useState<string>('1')
  const [payoutDayOfMonth, setPayoutDayOfMonth] = useState<string>('1')
  const [minimumPayoutAmount, setMinimumPayoutAmount] = useState<string>('0.00')

  const hasProfile = !!profile

  useEffect(() => {
    if (!open) return
    setBankName(profile?.bank_name ?? '')
    setAccountHolderName(profile?.account_holder_name ?? '')
    setAccountType(profile?.account_type ?? 'checking')
    setRoutingNumber('')
    setAccountNumber('')
    setConfirmAccountNumber('')
    setPayoutFrequency(profile?.payout_frequency ?? 'daily')
    setPayoutDayOfWeek(
      profile?.payout_day_of_week !== null && profile?.payout_day_of_week !== undefined
        ? String(profile.payout_day_of_week)
        : '1',
    )
    setPayoutDayOfMonth(
      profile?.payout_day_of_month !== null && profile?.payout_day_of_month !== undefined
        ? String(profile.payout_day_of_month)
        : '1',
    )
    setMinimumPayoutAmount(
      profile?.minimum_payout_amount !== undefined && profile?.minimum_payout_amount !== null
        ? Number(profile.minimum_payout_amount).toFixed(2)
        : '0.00',
    )
  }, [open, profile])

  const accountMismatch =
    accountNumber.length > 0 &&
    confirmAccountNumber.length > 0 &&
    accountNumber !== confirmAccountNumber

  const accountFieldsTouched = accountNumber.length > 0 || routingNumber.length > 0

  const validationError = useMemo<string | null>(() => {
    if (!bankName.trim()) return 'Bank name is required.'
    if (!accountHolderName.trim()) return 'Account holder name is required.'
    if (!hasProfile) {
      if (routingNumber.length !== 9) return 'Routing number must be 9 digits.'
      if (accountNumber.length < 4) return 'Account number is required.'
      if (accountNumber !== confirmAccountNumber) return 'Account numbers do not match.'
    } else if (accountFieldsTouched) {
      if (routingNumber.length > 0 && routingNumber.length !== 9)
        return 'Routing number must be 9 digits.'
      if (accountNumber.length > 0 && accountNumber.length < 4)
        return 'Account number must be at least 4 digits.'
      if (accountNumber.length > 0 && accountNumber !== confirmAccountNumber)
        return 'Account numbers do not match.'
    }
    if (payoutFrequency === 'weekly' && !payoutDayOfWeek) return 'Select a weekly payout day.'
    if (payoutFrequency === 'monthly' && !payoutDayOfMonth) return 'Select a monthly payout day.'
    return null
  }, [
    bankName,
    accountHolderName,
    hasProfile,
    routingNumber,
    accountNumber,
    confirmAccountNumber,
    accountFieldsTouched,
    payoutFrequency,
    payoutDayOfWeek,
    payoutDayOfMonth,
  ])

  const canSave = !saving && !validationError

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const result = await upsertLocationBankingProfile({
        clerkOrgId,
        locationId,
        bank_name: bankName.trim(),
        account_holder_name: accountHolderName.trim(),
        account_type: accountType,
        routing_number_full: routingNumber || null,
        account_number_full: accountNumber || null,
        payout_frequency: payoutFrequency,
        payout_day_of_week:
          payoutFrequency === 'weekly' ? Number(payoutDayOfWeek) : null,
        payout_day_of_month:
          payoutFrequency === 'monthly' ? Number(payoutDayOfMonth) : null,
        minimum_payout_amount:
          minimumPayoutAmount.trim().length > 0 ? Number(minimumPayoutAmount) : 0,
      })

      if (!result.success || !result.data) {
        toast.error('Save failed', {
          description: result.error || 'Unable to save banking profile.',
        })
        return
      }

      setProfile(result.data)
      toast.success('Banking profile saved', {
        description: 'Account number is encrypted in transit; only the last 4 digits are stored.',
      })
      setOpen(false)
    } catch (_err) {
      toast.error('Save failed', { description: 'An unexpected error occurred.' })
    } finally {
      setSaving(false)
    }
  }

  const verificationBadge = profile ? (
    <Badge
      variant={profile.is_verified ? 'default' : 'secondary'}
      className={cn(
        'inline-flex items-center gap-1',
        profile.is_verified ? 'bg-green-600 hover:bg-green-600' : '',
      )}
    >
      {profile.is_verified ? (
        <ShieldCheck className="h-3 w-3" />
      ) : (
        <ShieldAlert className="h-3 w-3" />
      )}
      {profile.is_verified ? 'Verified' : 'Pending verification'}
    </Badge>
  ) : (
    <Badge variant="outline">Not configured</Badge>
  )

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="h-4 w-4" />
                Banking & Payouts
              </CardTitle>
              <CardDescription>
                Where this location receives payouts. Account numbers are tokenized — only the
                last 4 digits are kept.
              </CardDescription>
            </div>
            {verificationBadge}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {profile ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Bank</p>
                  <p className="font-medium">{profile.bank_name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Account Holder
                  </p>
                  <p className="font-medium">{profile.account_holder_name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Account</p>
                  <p className="font-medium font-mono">
                    {accountTypeLabel[profile.account_type]} ····
                    {profile.account_number_last_four}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Routing</p>
                  <p className="font-medium font-mono">····{profile.routing_number_last_four}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Payout</p>
                  <p className="font-medium">{formatPayoutSchedule(profile)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Minimum Payout
                  </p>
                  <p className="font-medium">
                    ${Number(profile.minimum_payout_amount).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Button variant="outline" onClick={() => setOpen(true)}>
                  Edit Banking Details
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Landmark className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-3 font-medium">No banking profile yet</p>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Add a bank account to receive payouts for this location. Required before enabling
                online ordering payouts.
              </p>
              <Button className="mt-4" onClick={() => setOpen(true)}>
                Add Banking Profile
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{hasProfile ? 'Edit Banking Profile' : 'Add Banking Profile'}</DialogTitle>
            <DialogDescription>
              {hasProfile
                ? 'Update payout details for this location. Leave routing and account fields blank to keep the existing values.'
                : 'Enter the bank account that will receive payouts for this location.'}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-start gap-2">
              <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Full account and routing numbers are encrypted in transit and never written to our
                database. We only persist the last 4 digits for display.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bp-bank-name">Bank Name</Label>
                <Input
                  id="bp-bank-name"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Chase Bank"
                  maxLength={120}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bp-account-holder">Account Holder Name</Label>
                <Input
                  id="bp-account-holder"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  placeholder="Joe's Coffee LLC"
                  maxLength={120}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Account Type</Label>
              <RadioGroup
                value={accountType}
                onValueChange={(value: AccountType) => setAccountType(value)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <label
                  className={cn(
                    'flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors',
                    accountType === 'checking' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                  )}
                >
                  <RadioGroupItem value="checking" />
                  <span className="text-sm font-medium">Checking</span>
                </label>
                <label
                  className={cn(
                    'flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors',
                    accountType === 'savings' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                  )}
                >
                  <RadioGroupItem value="savings" />
                  <span className="text-sm font-medium">Savings</span>
                </label>
              </RadioGroup>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bp-routing">Routing Number</Label>
                <Input
                  id="bp-routing"
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(onlyDigits(e.target.value, 9))}
                  placeholder={
                    hasProfile
                      ? `Keep ····${profile?.routing_number_last_four}`
                      : '9 digits'
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={9}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bp-account">Account Number</Label>
                <Input
                  id="bp-account"
                  type="password"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(onlyDigits(e.target.value, 17))}
                  placeholder={
                    hasProfile
                      ? `Keep ····${profile?.account_number_last_four}`
                      : '4 – 17 digits'
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={17}
                />
              </div>
            </div>

            {accountNumber.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="bp-account-confirm">Confirm Account Number</Label>
                <Input
                  id="bp-account-confirm"
                  type="password"
                  value={confirmAccountNumber}
                  onChange={(e) => setConfirmAccountNumber(onlyDigits(e.target.value, 17))}
                  placeholder="Re-enter account number"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={17}
                  className={accountMismatch ? 'border-destructive' : ''}
                />
                {accountMismatch && (
                  <p className="text-xs text-destructive">Account numbers do not match.</p>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Payout Frequency</Label>
                <Select
                  value={payoutFrequency}
                  onValueChange={(v: PayoutFrequency) => setPayoutFrequency(v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bp-min-payout">Minimum Payout</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="bp-min-payout"
                    value={minimumPayoutAmount}
                    onChange={(e) =>
                      setMinimumPayoutAmount(formatCurrencyInput(e.target.value))
                    }
                    placeholder="0.00"
                    className="pl-7"
                    inputMode="decimal"
                  />
                </div>
              </div>
            </div>

            {payoutFrequency === 'weekly' && (
              <div className="space-y-2">
                <Label>Weekly Payout Day</Label>
                <Select value={payoutDayOfWeek} onValueChange={setPayoutDayOfWeek}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {dayOfWeekOptions.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {payoutFrequency === 'monthly' && (
              <div className="space-y-2">
                <Label>Monthly Payout Day</Label>
                <Select value={payoutDayOfMonth} onValueChange={setPayoutDayOfMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => {
                      const day = String(i + 1)
                      return (
                        <SelectItem key={day} value={day}>
                          Day {day}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {validationError && (
              <p className="text-sm text-destructive">{validationError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : hasProfile ? (
                'Save Changes'
              ) : (
                'Save Banking Profile'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
