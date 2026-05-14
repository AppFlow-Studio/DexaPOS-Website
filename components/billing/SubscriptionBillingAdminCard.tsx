'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  CalendarDays,
  CircleDollarSign,
  Download,
  Eye,
  FileText,
  Loader2,
  RefreshCcw,
  Receipt,
  Store,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  getBillableServices,
  getSubscriptionInvoiceDocument,
  getMerchantSubscriptions,
  getSubscriptionInvoices,
  getSubscriptionServiceAssignments,
  replaceSubscriptionServiceAssignments,
  type BillableServiceRecord,
  type MerchantSubscriptionRecord,
  type SubscriptionInvoiceRecord,
  type SubscriptionServiceAssignmentRecord,
  upsertMerchantSubscription,
} from '@/app/manage/actions/subscription-billing'
import {
  getMerchantNmiAccountsSummary,
  type MerchantNmiAccountRow,
} from '@/app/manage/actions/admin-merchant/nmi'
import {
  renderSubscriptionInvoiceHtml,
  type SubscriptionInvoiceDocumentData,
} from '@/lib/subscription-billing/invoice-template'
import { downloadSubscriptionInvoicePdf } from '@/lib/subscription-billing/invoice-pdf'

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

type ServiceFormState = Record<string, { enabled: boolean; quantity: string }>

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

function buildInitialServiceFormState(
  services: BillableServiceRecord[],
  assignments: SubscriptionServiceAssignmentRecord[] = []
): ServiceFormState {
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.service_id, assignment]))

  return Object.fromEntries(
    services.map((service) => {
      const assignment = assignmentMap.get(service.id)
      return [
        service.id,
        {
          enabled: Boolean(assignment),
          quantity: String(assignment?.quantity ?? 1),
        },
      ]
    })
  )
}

function summarizePricing(service: BillableServiceRecord): string {
  if (service.pricing_model === 'flat') {
    return `${formatMoney(service.base_price_monthly)}/mo`
  }

  if (service.pricing_model === 'per_unit') {
    return `${formatMoney(service.base_price_monthly)}/mo per ${service.unit_label}`
  }

  return `${formatMoney(service.base_price_monthly)}/mo first, ${formatMoney(service.additional_unit_price ?? 0)}/mo each additional`
}

function serviceQuantityLabel(service: BillableServiceRecord): string {
  if (service.pricing_model === 'flat') return 'Enabled'
  return `Quantity (${service.unit_label})`
}

export function SubscriptionBillingAdminCard({
  merchantId,
  merchantName,
  locations,
  canManageBilling,
}: SubscriptionBillingAdminCardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [services, setServices] = useState<BillableServiceRecord[]>([])
  const [subscriptions, setSubscriptions] = useState<MerchantSubscriptionRecord[]>([])
  const [invoices, setInvoices] = useState<SubscriptionInvoiceRecord[]>([])
  const [subscriptionServiceMap, setSubscriptionServiceMap] = useState<Record<string, SubscriptionServiceAssignmentRecord[]>>({})
  const [locationEligibilityMap, setLocationEligibilityMap] = useState<Record<string, MerchantNmiAccountRow>>({})
  const [serviceFormState, setServiceFormState] = useState<ServiceFormState>({})
  const [invoicePreviewDocument, setInvoicePreviewDocument] = useState<SubscriptionInvoiceDocumentData | null>(null)
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false)
  const [isInvoicePreviewLoading, setIsInvoicePreviewLoading] = useState(false)
  const [invoiceActionId, setInvoiceActionId] = useState<string | null>(null)

  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [status, setStatus] = useState<SubscriptionStatus>('active')
  const [currentPeriodStart, setCurrentPeriodStart] = useState(startOfMonthIso())
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(endOfMonthIso())
  const [nextBillingDate, setNextBillingDate] = useState(firstDayNextMonthIso())
  const [trialEndsAt, setTrialEndsAt] = useState('')

  const selectedLocationSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.location_id === selectedLocationId) ?? null,
    [subscriptions, selectedLocationId]
  )

  const selectedAssignments = useMemo(
    () => (selectedLocationSubscription ? subscriptionServiceMap[selectedLocationSubscription.id] ?? [] : []),
    [selectedLocationSubscription, subscriptionServiceMap]
  )

  const selectedLocationEligibility = useMemo(
    () => (selectedLocationId ? locationEligibilityMap[selectedLocationId] ?? null : null),
    [locationEligibilityMap, selectedLocationId]
  )

  const invoicePreviewHtml = useMemo(
    () => (invoicePreviewDocument ? renderSubscriptionInvoiceHtml(invoicePreviewDocument) : ''),
    [invoicePreviewDocument]
  )

  const refresh = () => {
    startTransition(async () => {
      try {
        const [nextServices, nextSubscriptions, nextInvoices, nmiSummary] = await Promise.all([
          getBillableServices(),
          getMerchantSubscriptions(merchantId),
          getSubscriptionInvoices(merchantId, null, 100),
          getMerchantNmiAccountsSummary(merchantId),
        ])

        const assignmentEntries = await Promise.all(
          nextSubscriptions.map(async (subscription) => [
            subscription.id,
            await getSubscriptionServiceAssignments(subscription.id),
          ] as const)
        )

        const nextAssignmentMap = Object.fromEntries(assignmentEntries)

        setServices(nextServices)
        setSubscriptions(nextSubscriptions)
        setInvoices(nextInvoices)
        setSubscriptionServiceMap(nextAssignmentMap)
        setLocationEligibilityMap(
          Object.fromEntries(nmiSummary.locations.map((location) => [location.locationId, location]))
        )

        const defaultLocationId = selectedLocationId || locations[0]?.id || ''
        if (defaultLocationId) {
          setSelectedLocationId(defaultLocationId)
          const defaultSubscription = nextSubscriptions.find((subscription) => subscription.location_id === defaultLocationId) ?? null

          if (defaultSubscription) {
            setStatus(defaultSubscription.status)
            setCurrentPeriodStart(defaultSubscription.current_period_start)
            setCurrentPeriodEnd(defaultSubscription.current_period_end)
            setNextBillingDate(defaultSubscription.next_billing_date)
            setTrialEndsAt(defaultSubscription.trial_ends_at?.slice(0, 10) ?? '')
            setServiceFormState(
              buildInitialServiceFormState(
                nextServices,
                nextAssignmentMap[defaultSubscription.id] ?? []
              )
            )
          } else {
            setStatus('active')
            setCurrentPeriodStart(startOfMonthIso())
            setCurrentPeriodEnd(endOfMonthIso())
            setNextBillingDate(firstDayNextMonthIso())
            setTrialEndsAt('')
            setServiceFormState(buildInitialServiceFormState(nextServices))
          }
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
    if (!services.length || !selectedLocationId) return

    if (selectedLocationSubscription) {
      setStatus(selectedLocationSubscription.status)
      setCurrentPeriodStart(selectedLocationSubscription.current_period_start)
      setCurrentPeriodEnd(selectedLocationSubscription.current_period_end)
      setNextBillingDate(selectedLocationSubscription.next_billing_date)
      setTrialEndsAt(selectedLocationSubscription.trial_ends_at?.slice(0, 10) ?? '')
      setServiceFormState(buildInitialServiceFormState(services, selectedAssignments))
      return
    }

    setStatus('active')
    setCurrentPeriodStart(startOfMonthIso())
    setCurrentPeriodEnd(endOfMonthIso())
    setNextBillingDate(firstDayNextMonthIso())
    setTrialEndsAt('')
    setServiceFormState(buildInitialServiceFormState(services))
  }, [selectedLocationId, selectedLocationSubscription, selectedAssignments, services])

  const handleSave = () => {
    if (!selectedLocationId) {
      toast.error('Select a location first.')
      return
    }

    const enabledServices = services
      .map((service) => ({
        serviceId: service.id,
        serviceCode: service.service_code,
        enabled: serviceFormState[service.id]?.enabled ?? false,
        quantity: Number(serviceFormState[service.id]?.quantity ?? 0),
      }))
      .filter((service) => service.enabled && service.quantity > 0)

    const fallbackActiveStatus =
      selectedLocationSubscription?.status && selectedLocationSubscription.status !== 'canceled'
        ? selectedLocationSubscription.status
        : 'active'

    const effectiveStatus: SubscriptionStatus =
      status === 'canceled' && enabledServices.length > 0
        ? fallbackActiveStatus
        : status

    if (effectiveStatus !== 'canceled' && enabledServices.length === 0) {
      toast.error('Enable at least one billable service for this location.')
      return
    }

    startTransition(async () => {
      const subscriptionResult = await upsertMerchantSubscription({
        subscriptionId: selectedLocationSubscription?.id,
        merchantId,
        locationId: selectedLocationId,
        planId: null,
        currentPeriodStart,
        currentPeriodEnd,
        nextBillingDate,
        status: effectiveStatus,
        trialEndsAt: effectiveStatus === 'trial' && trialEndsAt ? `${trialEndsAt}T00:00:00.000Z` : null,
        metadata: {
          source: 'hq_service_catalog_billing_ui',
          pricingModel: 'service_catalog',
        },
      })

      if (!subscriptionResult.success || !subscriptionResult.subscriptionId) {
        toast.error(subscriptionResult.error || 'Failed to save subscription.')
        return
      }

      const serviceResult = await replaceSubscriptionServiceAssignments(
        subscriptionResult.subscriptionId,
        (effectiveStatus === 'canceled' ? [] : enabledServices).map((service) => ({
          serviceId: service.serviceId,
          quantity: service.quantity,
          enabled: true,
          metadata: {
            source: 'hq_service_catalog_billing_ui',
            serviceCode: service.serviceCode,
          },
        }))
      )

      if (!serviceResult.success) {
        toast.error(serviceResult.error || 'Failed to save service assignments.')
        return
      }

      toast.success(
        effectiveStatus === 'canceled'
          ? 'Subscription canceled.'
          : status === 'canceled'
            ? 'Selected services removed. Subscription remains active.'
          : selectedLocationSubscription
            ? 'Subscription services updated.'
            : 'Subscription created.'
      )
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

  const loadInvoiceDocument = async (invoiceId: string): Promise<SubscriptionInvoiceDocumentData | null> => {
    setInvoiceActionId(invoiceId)
    const result = await getSubscriptionInvoiceDocument(invoiceId)
    setInvoiceActionId(null)

    if (!result.success || !result.document) {
      toast.error(result.error || 'Failed to load invoice document.')
      return null
    }

    return result.document
  }

  const handlePreviewInvoice = async (invoiceId: string) => {
    setIsInvoicePreviewLoading(true)
    const document = await loadInvoiceDocument(invoiceId)
    if (document) {
      setInvoicePreviewDocument(document)
      setIsInvoicePreviewOpen(true)
    }
    setIsInvoicePreviewLoading(false)
  }

  const handleDownloadInvoice = async (invoiceId: string) => {
    const document = await loadInvoiceDocument(invoiceId)
    if (!document) return

    try {
      await downloadSubscriptionInvoicePdf(document)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to download invoice.')
    }
  }

  const updateServiceState = (serviceId: string, patch: Partial<{ enabled: boolean; quantity: string }>) => {
    setServiceFormState((current) => ({
      ...current,
      [serviceId]: {
        enabled: patch.enabled ?? current[serviceId]?.enabled ?? false,
        quantity: patch.quantity ?? current[serviceId]?.quantity ?? '1',
      },
    }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Subscription Billing</h2>
        <p className="text-sm text-muted-foreground">
          Manual HQ service-catalog billing for {merchantName}. One billing subscription exists per location,
          and each location can have multiple billable services assigned to it.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5" />
              Assign Services to a Location
            </CardTitle>
            <CardDescription>
              Location dropdown controls which per-location subscription you are editing. Service prices are
              computed from the service catalog, not from a single plan row.
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
                {selectedLocationEligibility ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={selectedLocationEligibility.vaultReady ? 'default' : 'secondary'}>
                      {selectedLocationEligibility.vaultReady ? 'Eligible' : 'Not eligible'}
                    </Badge>
                    <span>
                      {selectedLocationEligibility.vaultReady
                        ? 'Location has a saved billing card and can be subscribed.'
                        : 'Location needs a primary vaulted billing card before subscription charging.'}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as SubscriptionStatus)}
                  disabled={!canManageBilling}
                >
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

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                <Receipt className="h-4 w-4" />
                Service catalog
              </div>

              {services.map((service) => {
                const current = serviceFormState[service.id] ?? { enabled: false, quantity: '1' }
                const quantityDisabled = !current.enabled || service.pricing_model === 'flat'

                return (
                  <div key={service.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={current.enabled}
                            onCheckedChange={(checked) => updateServiceState(service.id, { enabled: Boolean(checked) })}
                            disabled={!canManageBilling}
                          />
                          <div className="font-medium">{service.display_name}</div>
                          <Badge variant="outline">{service.service_code}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {summarizePricing(service)} | {service.service_category} | {service.pricing_model}
                        </div>
                      </div>
                      <div className="w-28 space-y-2">
                        <Label className="text-xs">{serviceQuantityLabel(service)}</Label>
                        <Input
                          type="number"
                          min={service.pricing_model === 'flat' ? 1 : 0}
                          step={1}
                          value={service.pricing_model === 'flat' ? '1' : current.quantity}
                          disabled={!canManageBilling || quantityDisabled}
                          onChange={(event) => updateServiceState(service.id, { quantity: event.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={!canManageBilling || isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selectedLocationSubscription ? 'Update Location Services' : 'Create Location Subscription'}
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
              Current Location Subscriptions
            </CardTitle>
            <CardDescription>
              One lifecycle record per location, with assigned services and quantities underneath it.
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
              subscriptions.map((subscription) => {
                const assignmentSummary = subscriptionServiceMap[subscription.id] ?? []

                return (
                  <div key={subscription.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-medium">{subscription.location_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {assignmentSummary.length} assigned service{assignmentSummary.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <Badge variant={statusVariant(subscription.status)}>{subscription.status}</Badge>
                    </div>
                    <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                      <div>Monthly amount: {formatMoney(subscription.monthly_amount)}</div>
                      <div>Billing method: {subscription.billing_method || 'No primary profile'}</div>
                      <div>
                        Period: {subscription.current_period_start} to {subscription.current_period_end}
                      </div>
                      <div>Next billing date: {subscription.next_billing_date}</div>
                    </div>
                    {assignmentSummary.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {assignmentSummary.map((assignment) => (
                          <Badge key={assignment.id} variant="secondary">
                            {assignment.display_name} x {assignment.quantity}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedLocationId(subscription.location_id)}
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
                )
              })
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
            Invoices are generated from the assigned services and quantities for each location.
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
                            {invoice.billing_period_start} to {invoice.billing_period_end}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePreviewInvoice(invoice.id)}
                            disabled={isPending || isInvoicePreviewLoading}
                          >
                            {isInvoicePreviewLoading && invoiceActionId === invoice.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="mr-2 h-4 w-4" />
                            )}
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadInvoice(invoice.id)}
                            disabled={isPending}
                          >
                            {invoiceActionId === invoice.id && !isInvoicePreviewLoading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="mr-2 h-4 w-4" />
                            )}
                            Download
                          </Button>
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
                              {invoice.billing_method === 'ach' ? 'ACH pending' : '-'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isInvoicePreviewOpen} onOpenChange={setIsInvoicePreviewOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Invoice Preview</DialogTitle>
            <DialogDescription>
              Preview the customer-facing subscription invoice layout before downloading it.
            </DialogDescription>
          </DialogHeader>
          {invoicePreviewDocument ? (
            <div className="overflow-hidden rounded-md border">
              <iframe
                title="Subscription invoice preview"
                srcDoc={invoicePreviewHtml}
                className="h-[720px] w-full bg-white"
              />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No invoice selected.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
