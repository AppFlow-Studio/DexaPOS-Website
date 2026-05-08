'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  CalendarDays,
  CircleDollarSign,
  FileText,
  Loader2,
  RefreshCcw,
  Receipt,
  Store,
} from 'lucide-react'
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
import { Separator } from '@/components/ui/separator'
import {
  chargeSubscriptionInvoiceManually,
  generateSubscriptionInvoiceManually,
  getMerchantSubscriptions,
  getSubscriptionInvoices,
  getSubscriptionPlans,
  type MerchantSubscriptionRecord,
  type SubscriptionInvoiceRecord,
  type SubscriptionPlanRecord,
  upsertMerchantSubscription,
} from '@/app/manage/actions/subscription-billing'

interface BillingLocationOption {
  id: string
  name: string
}

interface SubscriptionBillingAdminCardProps {
  merchantId: string
  merchantName: string
  locations: BillingLocationOption[]
  canManageBilling: boolean
}

type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function startOfMonthIso(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10)
}

function endOfMonthIso(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function firstDayNextMonthIso(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString().slice(0, 10)
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'active':
    case 'paid':
      return 'default'
    case 'trial':
    case 'open':
    case 'processing':
      return 'outline'
    case 'past_due':
    case 'failed':
    case 'suspended':
      return 'destructive'
    default:
      return 'secondary'
  }
}

export function SubscriptionBillingAdminCard({
  merchantId,
  merchantName,
  locations,
  canManageBilling,
}: SubscriptionBillingAdminCardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [plans, setPlans] = useState<SubscriptionPlanRecord[]>([])
  const [subscriptions, setSubscriptions] = useState<MerchantSubscriptionRecord[]>([])
  const [invoices, setInvoices] = useState<SubscriptionInvoiceRecord[]>([])

  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [status, setStatus] = useState<SubscriptionStatus>('active')
  const [currentPeriodStart, setCurrentPeriodStart] = useState(startOfMonthIso())
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(endOfMonthIso())
  const [nextBillingDate, setNextBillingDate] = useState(firstDayNextMonthIso())
  const [trialEndsAt, setTrialEndsAt] = useState('')

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId]
  )

  const selectedLocationSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.location_id === selectedLocationId) ?? null,
    [subscriptions, selectedLocationId]
  )

  const refresh = () => {
    startTransition(async () => {
      try {
        const [nextPlans, nextSubscriptions, nextInvoices] = await Promise.all([
          getSubscriptionPlans(),
          getMerchantSubscriptions(merchantId),
          getSubscriptionInvoices(merchantId, null, 100),
        ])

        setPlans(nextPlans)
        setSubscriptions(nextSubscriptions)
        setInvoices(nextInvoices)

        if (!selectedLocationId && locations[0]) {
          setSelectedLocationId(locations[0].id)
        }
        if (!selectedPlanId && nextPlans[0]) {
          setSelectedPlanId(nextPlans[0].id)
        }
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load subscription billing data.')
      } finally {
        setIsLoading(false)
      }
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId])

  useEffect(() => {
    if (selectedLocationSubscription) {
      setSelectedLocationId(selectedLocationSubscription.location_id)
      setSelectedPlanId(selectedLocationSubscription.plan_id)
      setStatus(selectedLocationSubscription.status)
      setCurrentPeriodStart(selectedLocationSubscription.current_period_start)
      setCurrentPeriodEnd(selectedLocationSubscription.current_period_end)
      setNextBillingDate(selectedLocationSubscription.next_billing_date)
      setTrialEndsAt(selectedLocationSubscription.trial_ends_at?.slice(0, 10) ?? '')
    }
  }, [selectedLocationSubscription])

  const handleSave = () => {
    if (!selectedLocationId || !selectedPlanId) {
      toast.error('Select a location and a plan first.')
      return
    }

    startTransition(async () => {
      const result = await upsertMerchantSubscription({
        subscriptionId: selectedLocationSubscription?.id,
        merchantId,
        locationId: selectedLocationId,
        planId: selectedPlanId,
        currentPeriodStart,
        currentPeriodEnd,
        nextBillingDate,
        status,
        trialEndsAt: status === 'trial' && trialEndsAt ? `${trialEndsAt}T00:00:00.000Z` : null,
        metadata: {
          source: 'hq_manual_billing_ui',
          placeholderPricing: true,
        },
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to save subscription.')
        return
      }

      toast.success(selectedLocationSubscription ? 'Subscription updated.' : 'Subscription created.')
      refresh()
    })
  }

  const handleGenerateInvoice = (subscriptionId: string) => {
    startTransition(async () => {
      const result = await generateSubscriptionInvoiceManually(subscriptionId, null)
      if (!result.success) {
        toast.error(result.error || 'Failed to generate invoice.')
        return
      }
      toast.success(`Invoice generated: ${result.invoiceId}`)
      refresh()
    })
  }

  const handleChargeInvoice = (invoiceId: string) => {
    startTransition(async () => {
      const result = await chargeSubscriptionInvoiceManually(invoiceId)
      if (!result.success) {
        toast.error(result.error || 'Failed to charge invoice.')
        return
      }
      toast.success(result.transactionId ? `Invoice charged: ${result.transactionId}` : 'Invoice charged.')
      refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Subscription Billing</h2>
        <p className="text-sm text-muted-foreground">
          Manual Phase 1 admin controls for {merchantName}. Pricing is currently placeholder-driven from
          `subscription_plans`.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5" />
              Create or Update Subscription
            </CardTitle>
            <CardDescription>
              One subscription per location. Active station count and invoice totals are computed from the
              selected plan and the location’s live station count.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId} disabled={!canManageBilling}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId} disabled={!canManageBilling}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as SubscriptionStatus)} disabled={!canManageBilling}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Trial Ends At</Label>
                <Input
                  type="date"
                  value={trialEndsAt}
                  onChange={(event) => setTrialEndsAt(event.target.value)}
                  disabled={!canManageBilling || status !== 'trial'}
                />
              </div>

              <div className="space-y-2">
                <Label>Current Period Start</Label>
                <Input
                  type="date"
                  value={currentPeriodStart}
                  onChange={(event) => setCurrentPeriodStart(event.target.value)}
                  disabled={!canManageBilling}
                />
              </div>

              <div className="space-y-2">
                <Label>Current Period End</Label>
                <Input
                  type="date"
                  value={currentPeriodEnd}
                  onChange={(event) => setCurrentPeriodEnd(event.target.value)}
                  disabled={!canManageBilling}
                />
              </div>

              <div className="space-y-2">
                <Label>Next Billing Date</Label>
                <Input
                  type="date"
                  value={nextBillingDate}
                  onChange={(event) => setNextBillingDate(event.target.value)}
                  disabled={!canManageBilling}
                />
              </div>
            </div>

            {selectedPlan && (
              <>
                <Separator />
                <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                  <div className="mb-3 flex items-center gap-2 font-medium">
                    <Receipt className="h-4 w-4" />
                    Placeholder pricing preview
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>Base monthly: {formatMoney(Number(selectedPlan.base_price_monthly || 0))}</div>
                    <div>Included stations: {selectedPlan.included_stations}</div>
                    <div>Extra station: {formatMoney(Number(selectedPlan.per_extra_station_price || 0))}</div>
                    <div>Card surcharge: {Number(selectedPlan.card_surcharge_pct || 0).toFixed(2)}%</div>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={!canManageBilling || isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selectedLocationSubscription ? 'Update Subscription' : 'Create Subscription'}
              </Button>
              <Button variant="outline" onClick={refresh} disabled={isPending}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Current Subscriptions
            </CardTitle>
            <CardDescription>
              Existing subscriptions for this merchant. Generate invoices manually from here during Phase 1.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading subscriptions...</div>
            ) : subscriptions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No subscriptions yet.
              </div>
            ) : (
              subscriptions.map((subscription) => (
                <div key={subscription.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium">{subscription.location_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {subscription.display_name} · {subscription.plan_code}
                      </div>
                    </div>
                    <Badge variant={statusVariant(subscription.status)}>{subscription.status}</Badge>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                    <div>Monthly amount: {formatMoney(subscription.monthly_amount)}</div>
                    <div>Station count snapshot: {subscription.station_count}</div>
                    <div>Billing method: {subscription.billing_method || 'No primary profile'}</div>
                    <div>
                      Period: {subscription.current_period_start} → {subscription.current_period_end}
                    </div>
                    <div>Next billing date: {subscription.next_billing_date}</div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedLocationId(subscription.location_id)
                        setSelectedPlanId(subscription.plan_id)
                        setStatus(subscription.status)
                        setCurrentPeriodStart(subscription.current_period_start)
                        setCurrentPeriodEnd(subscription.current_period_end)
                        setNextBillingDate(subscription.next_billing_date)
                        setTrialEndsAt(subscription.trial_ends_at?.slice(0, 10) ?? '')
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleGenerateInvoice(subscription.id)}
                      disabled={!canManageBilling || isPending}
                    >
                      {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Generate Invoice
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recent Subscription Invoices
          </CardTitle>
          <CardDescription>
            Phase 1 visibility only. Charging, retries, and suspension automation are still backend-first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No subscription invoices have been generated yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Invoice</th>
                    <th className="py-2 pr-4 font-medium">Location</th>
                    <th className="py-2 pr-4 font-medium">Period</th>
                    <th className="py-2 pr-4 font-medium">Method</th>
                    <th className="py-2 pr-4 font-medium">Total</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Due</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{invoice.invoice_number}</td>
                      <td className="py-3 pr-4">{invoice.location_name}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>
                            {invoice.billing_period_start} → {invoice.billing_period_end}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 uppercase">{invoice.billing_method}</td>
                      <td className="py-3 pr-4">{formatMoney(invoice.total_amount)}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                      </td>
                      <td className="py-3 pr-4">{invoice.due_date}</td>
                      <td className="py-3 pr-4">
                        {invoice.billing_method === 'card' && ['open', 'failed'].includes(invoice.status) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleChargeInvoice(invoice.id)}
                            disabled={!canManageBilling || isPending}
                          >
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Charge
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {invoice.billing_method === 'ach' ? 'ACH pending' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
