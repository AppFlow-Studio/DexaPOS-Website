'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { Landmark, Loader2, Lock, Pencil, Plus, ShieldCheck, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  upsertLocationBankingProfile,
  type AccountType,
  type LocationBankingProfileSummary,
  type PayoutFrequency,
} from '@/app/dashboard/actions/location-banking-profiles'
import { roundedFields, roundedSelectContent } from './LocationPanelSection'

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
        'shrink-0 inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-0.5',
        profile.is_verified ? 'bg-emerald-600 hover:bg-emerald-600' : '',
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
    <Badge
      variant="secondary"
      className="shrink-0 rounded-full border-transparent bg-muted text-muted-foreground text-xs font-medium px-2.5 py-0.5"
    >
      Not configured
    </Badge>
  )

  return (
    <>
      <div className="overflow-hidden rounded-2xl bg-card px-6 py-8 ring-1 ring-border/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
              <Landmark className="h-[1.125rem] w-[1.125rem] shrink-0" />
              <span>Banking &amp; Payouts</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Where this location receives payouts. Account numbers are tokenized — only the
              last 4 digits are kept.
            </p>
          </div>
          {verificationBadge}
        </div>

        {profile ? (
          <>
            <div className="mt-5">
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-[0.9375rem] text-muted-foreground">Bank</span>
                <span className="text-sm truncate">{profile.bank_name}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-[0.9375rem] text-muted-foreground">Account holder</span>
                <span className="text-sm truncate">{profile.account_holder_name}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-[0.9375rem] text-muted-foreground">Account</span>
                <span className="text-sm font-mono tabular-nums">
                  {accountTypeLabel[profile.account_type]} ····
                  {profile.account_number_last_four}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-[0.9375rem] text-muted-foreground">Routing</span>
                <span className="text-sm font-mono tabular-nums">
                  ····{profile.routing_number_last_four}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-[0.9375rem] text-muted-foreground">Payout</span>
                <span className="text-sm">{formatPayoutSchedule(profile)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-[0.9375rem] text-muted-foreground">Minimum payout</span>
                <span className="text-sm tabular-nums">
                  ${Number(profile.minimum_payout_amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button size="sm" className="gap-2 rounded-full px-4" onClick={() => setOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit banking details
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-5 flex flex-col items-center justify-center rounded-xl bg-muted/40 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
              <Landmark className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-3 text-[1.0625rem] font-medium leading-tight tracking-[-0.01em]">
              No banking profile yet
            </p>
            <p className="text-sm text-muted-foreground max-w-sm mt-1.5">
              Add a bank account to receive payouts for this location. Required before enabling
              online ordering payouts.
            </p>
            <Button size="sm" className="mt-5 gap-2 rounded-full px-4" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add banking profile
            </Button>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        {/* Softer corners to match the rounded-2xl cards on the page; the
            field overrides ride on the dialog so the shared Input/Select
            primitives stay untouched elsewhere. */}
        <DialogContent
          className={cn('sm:max-w-lg sm:rounded-2xl border-0 shadow-xl', roundedFields)}
        >
          <DialogHeader>
            <DialogTitle>{hasProfile ? 'Edit Banking Profile' : 'Add Banking Profile'}</DialogTitle>
            <DialogDescription>
              {hasProfile
                ? 'Update payout details for this location. Leave routing and account fields blank to keep the existing values.'
                : 'Enter the bank account that will receive payouts for this location.'}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl bg-muted/50 p-3">
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
                    'flex items-center gap-2 rounded-xl border p-3 cursor-pointer transition-colors',
                    accountType === 'checking'
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent bg-muted/50 hover:bg-muted',
                  )}
                >
                  <RadioGroupItem value="checking" />
                  <span className="text-sm font-medium">Checking</span>
                </label>
                <label
                  className={cn(
                    'flex items-center gap-2 rounded-xl border p-3 cursor-pointer transition-colors',
                    accountType === 'savings'
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent bg-muted/50 hover:bg-muted',
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
                  <SelectContent className={roundedSelectContent}>
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
                  <SelectContent className={roundedSelectContent}>
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
                  <SelectContent className={roundedSelectContent}>
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
            <Button
              variant="outline"
              className="rounded-full px-4"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button className="rounded-full px-4" onClick={handleSave} disabled={!canSave}>
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
