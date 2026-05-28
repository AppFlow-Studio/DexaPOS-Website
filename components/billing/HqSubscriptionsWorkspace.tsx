'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Download,
  Eye,
  FileText,
  Loader2,
  RefreshCcw,
  Wallet,
} from 'lucide-react'
import type { MerchantDetails } from '@/types/merchant'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  getMerchantTierPlans,
  getMerchantTierStatus,
  getMerchantTierSubscription,
  chargeSubscriptionInvoiceManually,
  generateSubscriptionInvoiceManually,
  getBillableServices,
  getSubscriptionInvoiceDocument,
  getMerchantSubscriptions,
  getSubscriptionInvoices,
  getSubscriptionServiceAssignments,
  replaceSubscriptionServiceAssignments,
  type BillableServiceRecord,
  type MerchantTierPlanRecord,
  type MerchantTierStatusRecord,
  type MerchantTierSubscriptionRecord,
  type MerchantSubscriptionRecord,
  type SubscriptionInvoiceRecord,
  type SubscriptionServiceAssignmentRecord,
  upsertMerchantTierSubscription,
  upsertMerchantSubscription,
} from '@/app/manage/actions/subscription-billing'
import {
  getMerchantNmiAccountsSummary,
  type MerchantNmiAccountRow,
} from '@/app/manage/actions/admin-merchant/nmi'
import {
  getMerchantBillingProfiles,
  type MerchantBillingProfileRecord,
} from '@/app/manage/actions/merchant-billing'
import {
  renderSubscriptionInvoiceHtml,
  type SubscriptionInvoiceDocumentData,
} from '@/lib/subscription-billing/invoice-template'
import { downloadSubscriptionInvoicePdf } from '@/lib/subscription-billing/invoice-pdf'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'

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

function formatDate(date: string | null | undefined): string {
  if (!date) return '-'

  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return date

  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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

function merchantTierStatusVariant(
  status: MerchantTierStatusRecord['subscription_status'],
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'active':
      return 'default'
    case 'past_due':
      return 'outline'
    case 'suspended':
      return 'destructive'
    case 'cancelled':
      return 'secondary'
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

  return `${formatMoney(service.base_price_monthly)} first, ${formatMoney(service.additional_unit_price ?? 0)} each additional`
}

function parsePositiveInteger(value: string | undefined): number {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed))
}

function calculateServiceSubtotal(
  service: BillableServiceRecord,
  quantity: number
): number {
  if (service.pricing_model === 'flat') {
    return quantity > 0 ? Number(service.base_price_monthly) : 0
  }

  if (service.pricing_model === 'per_unit') {
    return Number(service.base_price_monthly) * quantity
  }

  const includedQuantity = Number(service.included_quantity || 0)
  const additionalQuantity = Math.max(0, quantity - includedQuantity)

  return Number(service.base_price_monthly) + additionalQuantity * Number(service.additional_unit_price || 0)
}

function buildPaymentMethodLabel(profile: MerchantBillingProfileRecord | null): string {
  if (!profile) return 'No billing profile'

  if (profile.billing_method === 'card') {
    const brand = profile.card_brand || 'Card'
    const suffix = profile.card_last_four ? `•••• ${profile.card_last_four}` : ''
    return [brand, suffix].filter(Boolean).join(' ')
  }

  if (profile.billing_method === 'ach') {
    const bank = profile.bank_name || 'Bank account'
    const suffix = profile.account_number_last_four ? `•••• ${profile.account_number_last_four}` : ''
    return [bank, suffix].filter(Boolean).join(' ')
  }

  return 'No billing profile'
}

function formatTierPrice(monthlyPriceCents: number | null | undefined): string {
  const cents = Number(monthlyPriceCents || 0)
  if (!cents) return 'Contact for pricing'
  return formatMoney(cents / 100)
}

function formatMerchantTierCapacity(plan: MerchantTierPlanRecord): string {
  if (plan.max_locations === null) {
    return `${plan.min_locations ?? 0}+ locations`
  }

  if (plan.min_locations === plan.max_locations) {
    return `${plan.max_locations} location`
  }

  return `${plan.min_locations ?? 0}-${plan.max_locations} locations`
}

function merchantTierHighlights(plan: MerchantTierPlanRecord): string[] {
  switch (plan.plan_code) {
    case 'basic':
      return ['Single-location coverage', 'Flat monthly tier', 'Good starting point']
    case 'multi_location':
      return ['Covers 2 to 5 locations', 'Flat monthly tier', 'For growing operators']
    case 'franchise':
      return ['Supports 6+ locations', 'Unlimited cap in V1', 'For large merchant groups']
    default:
      return ['Merchant-wide plan', 'Flat monthly tier', 'Contact sales for setup']
  }
}

const transactionTrendChartConfig = {
  paid: {
    label: 'Collected',
    color: 'hsl(var(--chart-1))',
  },
  failed: {
    label: 'Failed',
    color: 'hsl(var(--chart-3))',
  },
} satisfies ChartConfig

const transactionStatusChartConfig = {
  count: {
    label: 'Invoices',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig

const transactionStatusVisuals: Record<string, { label: string; color: string }> = {
  open: {
    label: 'Open',
    color: '#F59E0B',
  },
  processing: {
    label: 'Processing',
    color: '#3B82F6',
  },
  paid: {
    label: 'Paid',
    color: '#10B981',
  },
  failed: {
    label: 'Failed',
    color: '#EF4444',
  },
}

interface HqSubscriptionsWorkspaceProps {
  merchant: MerchantDetails
  canManageBilling: boolean
}

export function HqSubscriptionsWorkspace({
  merchant,
  canManageBilling,
}: HqSubscriptionsWorkspaceProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [services, setServices] = useState<BillableServiceRecord[]>([])
  const [subscriptions, setSubscriptions] = useState<MerchantSubscriptionRecord[]>([])
  const [invoices, setInvoices] = useState<SubscriptionInvoiceRecord[]>([])
  const [subscriptionServiceMap, setSubscriptionServiceMap] = useState<Record<string, SubscriptionServiceAssignmentRecord[]>>({})
  const [locationEligibilityMap, setLocationEligibilityMap] = useState<Record<string, MerchantNmiAccountRow>>({})
  const [billingProfilesByLocation, setBillingProfilesByLocation] = useState<Record<string, MerchantBillingProfileRecord>>({})
  const [serviceFormState, setServiceFormState] = useState<ServiceFormState>({})
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [status, setStatus] = useState<SubscriptionStatus>('active')
  const [currentPeriodStart, setCurrentPeriodStart] = useState(startOfMonthIso())
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(endOfMonthIso())
  const [nextBillingDate, setNextBillingDate] = useState(firstDayNextMonthIso())
  const [trialEndsAt, setTrialEndsAt] = useState('')
  const [invoicePreviewDocument, setInvoicePreviewDocument] = useState<SubscriptionInvoiceDocumentData | null>(null)
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false)
  const [isInvoicePreviewLoading, setIsInvoicePreviewLoading] = useState(false)
  const [invoiceActionId, setInvoiceActionId] = useState<string | null>(null)
  const [merchantTierPlans, setMerchantTierPlans] = useState<MerchantTierPlanRecord[]>([])
  const [merchantTierStatus, setMerchantTierStatus] = useState<MerchantTierStatusRecord>({
    plan: null,
    active_location_count: 0,
    is_over_limit: false,
    required_plan_code: null,
    subscription_status: null,
    current_period_end: null,
  })
  const [merchantTierSubscription, setMerchantTierSubscription] = useState<MerchantTierSubscriptionRecord | null>(null)
  const [selectedMerchantTierPlanId, setSelectedMerchantTierPlanId] = useState('')
  const [merchantTierSubscriptionStatus, setMerchantTierSubscriptionStatus] = useState<'active' | 'past_due' | 'suspended' | 'cancelled'>('active')
  const [merchantTierPeriodStart, setMerchantTierPeriodStart] = useState(startOfMonthIso())
  const [merchantTierPeriodEnd, setMerchantTierPeriodEnd] = useState(endOfMonthIso())

  const sortedLocations = useMemo(
    () => [...merchant.locations].sort((a, b) => a.name.localeCompare(b.name)),
    [merchant.locations]
  )

  const selectedLocation = useMemo(
    () => sortedLocations.find((location) => location.id === selectedLocationId) ?? sortedLocations[0] ?? null,
    [selectedLocationId, sortedLocations]
  )

  const selectedLocationSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.location_id === selectedLocation?.id) ?? null,
    [selectedLocation, subscriptions]
  )

  const selectedAssignments = useMemo(
    () => (selectedLocationSubscription ? subscriptionServiceMap[selectedLocationSubscription.id] ?? [] : []),
    [selectedLocationSubscription, subscriptionServiceMap]
  )

  const selectedLocationEligibility = useMemo(
    () => (selectedLocation?.id ? locationEligibilityMap[selectedLocation.id] ?? null : null),
    [locationEligibilityMap, selectedLocation]
  )

  const selectedBillingProfile = useMemo(
    () => (selectedLocation?.id ? billingProfilesByLocation[selectedLocation.id] ?? null : null),
    [billingProfilesByLocation, selectedLocation]
  )

  const invoicePreviewHtml = useMemo(
    () => (invoicePreviewDocument ? renderSubscriptionInvoiceHtml(invoicePreviewDocument) : ''),
    [invoicePreviewDocument]
  )

  const workspaceStats = useMemo(() => {
    const billableSubscriptions = subscriptions.filter((subscription) => subscription.status !== 'canceled')
    const mrr = billableSubscriptions.reduce((sum, subscription) => sum + Number(subscription.monthly_amount || 0), 0)
    const activeCount = subscriptions.filter((subscription) => ['active', 'trial'].includes(subscription.status)).length
    const issueCount = subscriptions.filter((subscription) => ['past_due', 'suspended'].includes(subscription.status)).length

    return {
      mrr,
      locations: sortedLocations.length,
      activeCount,
      issueCount,
    }
  }, [sortedLocations.length, subscriptions])

  const filteredInvoices = useMemo(
    () => invoices.filter((invoice) => !selectedLocation || invoice.location_id === selectedLocation.id),
    [invoices, selectedLocation]
  )

  const recommendedMerchantTier = useMemo(
    () =>
      merchantTierStatus.required_plan_code
        ? merchantTierPlans.find((plan) => plan.plan_code === merchantTierStatus.required_plan_code) ?? null
        : null,
    [merchantTierPlans, merchantTierStatus.required_plan_code],
  )

  const transactionSummary = useMemo(() => {
    const paid = filteredInvoices
      .filter((invoice) => invoice.status === 'paid')
      .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)

    const pending = filteredInvoices
      .filter((invoice) => ['open', 'processing'].includes(invoice.status))
      .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)

    const pendingSubtotal = filteredInvoices
      .filter((invoice) => ['open', 'processing'].includes(invoice.status))
      .reduce((sum, invoice) => sum + Number(invoice.subtotal || 0), 0)

    const pendingSurcharge = filteredInvoices
      .filter((invoice) => ['open', 'processing'].includes(invoice.status))
      .reduce((sum, invoice) => sum + Number(invoice.card_surcharge || 0), 0)

    const failedCount = filteredInvoices.filter((invoice) => invoice.status === 'failed').length

    return {
      paid,
      pending,
      pendingSubtotal,
      pendingSurcharge,
      failedCount,
    }
  }, [filteredInvoices])

  const transactionTrendData = useMemo(() => {
    const byDay = new Map<string, { label: string; paid: number; failed: number }>()

    for (const invoice of filteredInvoices) {
      const dateKey = (invoice.paid_at || invoice.created_at || invoice.due_date || '').slice(0, 10)
      if (!dateKey) continue

      const current = byDay.get(dateKey) ?? {
        label: formatDate(dateKey),
        paid: 0,
        failed: 0,
      }

      if (invoice.status === 'paid') {
        current.paid += Number(invoice.total_amount || 0)
      }

      if (invoice.status === 'failed') {
        current.failed += Number(invoice.total_amount || 0)
      }

      byDay.set(dateKey, current)
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
  }, [filteredInvoices])

  const transactionStatusData = useMemo(() => {
    const bucketOrder = ['open', 'processing', 'paid', 'failed']
    const buckets = new Map<string, { count: number; total: number }>()

    for (const invoice of filteredInvoices) {
      const current = buckets.get(invoice.status) ?? { count: 0, total: 0 }
      current.count += 1
      current.total += Number(invoice.total_amount || 0)
      buckets.set(invoice.status, current)
    }

    return bucketOrder
      .filter((statusKey) => buckets.has(statusKey))
      .map((statusKey) => {
        const bucket = buckets.get(statusKey)!
        const visuals = transactionStatusVisuals[statusKey] ?? {
          label: statusKey.replace('_', ' '),
          color: 'hsl(var(--chart-2))',
        }

        return {
          status: statusKey,
          label: visuals.label,
          color: visuals.color,
          count: bucket.count,
          total: bucket.total,
        }
      })
  }, [filteredInvoices])

  const selectedServiceRows = useMemo(
    () =>
      services.map((service) => {
        const current = serviceFormState[service.id] ?? { enabled: false, quantity: '1' }
        const quantity = service.pricing_model === 'flat' ? 1 : parsePositiveInteger(current.quantity)
        const effectiveQuantity = current.enabled ? Math.max(service.pricing_model === 'flat' ? 1 : 0, quantity) : 0
        const subtotal = current.enabled ? calculateServiceSubtotal(service, effectiveQuantity) : 0

        return {
          service,
          enabled: current.enabled,
          quantity: effectiveQuantity,
          subtotal,
        }
      }),
    [serviceFormState, services]
  )

  const refresh = () => {
    startTransition(async () => {
      try {
        const [
          nextServices,
          nextSubscriptions,
          nextInvoices,
          nmiSummary,
          billingProfiles,
          nextMerchantTierPlans,
          nextMerchantTierStatus,
          nextMerchantTierSubscription,
        ] = await Promise.all([
          getBillableServices(),
          getMerchantSubscriptions(merchant.id),
          getSubscriptionInvoices(merchant.id, null, 100),
          getMerchantNmiAccountsSummary(merchant.id),
          getMerchantBillingProfiles(merchant.id),
          getMerchantTierPlans(),
          getMerchantTierStatus(merchant.id),
          getMerchantTierSubscription(merchant.id),
        ])

        const assignmentEntries = await Promise.all(
          nextSubscriptions.map(async (subscription) => [
            subscription.id,
            await getSubscriptionServiceAssignments(subscription.id),
          ] as const)
        )

        const nextAssignmentMap = Object.fromEntries(assignmentEntries)
        const nextEligibilityMap = Object.fromEntries(
          nmiSummary.locations.map((location) => [location.locationId, location])
        )

        const nextBillingProfilesByLocation = Object.fromEntries(
          billingProfiles
            .filter((profile) => profile.location_id)
            .map((profile) => [profile.location_id as string, profile])
        )

        setServices(nextServices)
        setSubscriptions(nextSubscriptions)
        setInvoices(nextInvoices)
        setSubscriptionServiceMap(nextAssignmentMap)
        setLocationEligibilityMap(nextEligibilityMap)
        setBillingProfilesByLocation(nextBillingProfilesByLocation)
        setMerchantTierPlans(nextMerchantTierPlans)
        setMerchantTierStatus(nextMerchantTierStatus)
        setMerchantTierSubscription(nextMerchantTierSubscription)

        const defaultLocationId =
          selectedLocationId && sortedLocations.some((location) => location.id === selectedLocationId)
            ? selectedLocationId
            : sortedLocations[0]?.id || ''

        if (defaultLocationId) {
          setSelectedLocationId(defaultLocationId)
          const defaultSubscription =
            nextSubscriptions.find((subscription) => subscription.location_id === defaultLocationId) ?? null

          if (defaultSubscription) {
            setStatus(defaultSubscription.status)
            setCurrentPeriodStart(defaultSubscription.current_period_start)
            setCurrentPeriodEnd(defaultSubscription.current_period_end)
            setNextBillingDate(defaultSubscription.next_billing_date)
            setTrialEndsAt(defaultSubscription.trial_ends_at?.slice(0, 10) ?? '')
            setServiceFormState(
              buildInitialServiceFormState(nextServices, nextAssignmentMap[defaultSubscription.id] ?? [])
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

        if (nextMerchantTierSubscription) {
          setSelectedMerchantTierPlanId(nextMerchantTierSubscription.plan_id)
          setMerchantTierSubscriptionStatus(nextMerchantTierSubscription.status)
          setMerchantTierPeriodStart(nextMerchantTierSubscription.current_period_start.slice(0, 10))
          setMerchantTierPeriodEnd(nextMerchantTierSubscription.current_period_end.slice(0, 10))
        } else {
          const suggestedPlan =
            nextMerchantTierPlans.find((plan) => plan.plan_code === nextMerchantTierStatus.required_plan_code) ??
            nextMerchantTierPlans[0] ??
            null

          setSelectedMerchantTierPlanId(suggestedPlan?.id || '')
          setMerchantTierSubscriptionStatus('active')
          setMerchantTierPeriodStart(startOfMonthIso())
          setMerchantTierPeriodEnd(endOfMonthIso())
        }
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load subscription workspace.')
      } finally {
        setIsLoading(false)
      }
    })
  }

  useEffect(() => {
    if (sortedLocations[0]?.id && !selectedLocationId) {
      setSelectedLocationId(sortedLocations[0].id)
    }
  }, [selectedLocationId, sortedLocations])

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant.id])

  useEffect(() => {
    if (!services.length || !selectedLocation) return

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
  }, [selectedLocation, selectedLocationSubscription, selectedAssignments, services])

  const updateServiceState = (serviceId: string, patch: Partial<{ enabled: boolean; quantity: string }>) => {
    setServiceFormState((current) => ({
      ...current,
      [serviceId]: {
        enabled: patch.enabled ?? current[serviceId]?.enabled ?? false,
        quantity: patch.quantity ?? current[serviceId]?.quantity ?? '1',
      },
    }))
  }

  const handleSave = () => {
    if (!selectedLocation) {
      toast.error('Select a location first.')
      return
    }

    const enabledServices = services
      .map((service) => ({
        serviceId: service.id,
        serviceCode: service.service_code,
        enabled: serviceFormState[service.id]?.enabled ?? false,
        quantity:
          service.pricing_model === 'flat'
            ? 1
            : Number(serviceFormState[service.id]?.quantity ?? 0),
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
        merchantId: merchant.id,
        locationId: selectedLocation.id,
        planId: null,
        currentPeriodStart,
        currentPeriodEnd,
        nextBillingDate,
        status: effectiveStatus,
        trialEndsAt: effectiveStatus === 'trial' && trialEndsAt ? `${trialEndsAt}T00:00:00.000Z` : null,
        metadata: {
          source: 'hq_subscriptions_workspace',
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
            source: 'hq_subscriptions_workspace',
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
              ? 'Subscription updated.'
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

  const handleSaveMerchantTier = () => {
    if (!selectedMerchantTierPlanId) {
      toast.error('Select a merchant tier first.')
      return
    }

    startTransition(async () => {
      const result = await upsertMerchantTierSubscription({
        merchantId: merchant.id,
        planId: selectedMerchantTierPlanId,
        status: merchantTierSubscriptionStatus,
        currentPeriodStart: merchantTierPeriodStart,
        currentPeriodEnd: merchantTierPeriodEnd,
        trialEndsAt: null,
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to save merchant tier.')
        return
      }

      if (result.anchorLocationId) {
        setSelectedLocationId(result.anchorLocationId)
      }

      toast.success(
        result.invoiceId
          ? 'Merchant tier updated and invoice generated.'
          : 'Merchant tier updated.',
      )
      refresh()
    })
  }

  if (!canManageBilling) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex items-start gap-3 pt-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
          <div className="space-y-1">
            <div className="font-medium">Billing Management Restricted</div>
            <p className="text-sm text-muted-foreground">
              Subscription billing management requires the `system.billing.manage` HQ permission.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{merchant.name}</h1>
          <Badge variant="outline">{merchant.clerk_org_id || merchant.id}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Location-scoped SaaS subscriptions. Storefront NMI setup stays separate. This workspace manages subscription
          services, invoices, and charges through the centralized Dexa billing rail.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">MRR</div>
            <div className="mt-2 text-2xl font-semibold">{formatMoney(workspaceStats.mrr)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Locations</div>
            <div className="mt-2 text-2xl font-semibold">{workspaceStats.locations}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Active Subscriptions</div>
            <div className="mt-2 text-2xl font-semibold">{workspaceStats.activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Billing Issues</div>
            <div className="mt-2 text-2xl font-semibold">{workspaceStats.issueCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Merchant Tier</CardTitle>
          <CardDescription>
            Merchant-wide plan visibility sits here. Location-level service billing below stays separate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-lg font-semibold">
                  {merchantTierStatus.plan?.name || 'No active plan'}
                </div>
                <Badge variant={merchantTierStatusVariant(merchantTierStatus.subscription_status)}>
                  {merchantTierStatus.subscription_status || 'unassigned'}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{merchantTierStatus.active_location_count} active locations</Badge>
                {merchantTierStatus.plan?.max_locations !== null && merchantTierStatus.plan ? (
                  <Badge
                    variant="outline"
                    className={
                      merchantTierStatus.is_over_limit
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : merchantTierStatus.active_location_count === merchantTierStatus.plan.max_locations
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }
                  >
                    {merchantTierStatus.active_location_count} of {merchantTierStatus.plan.max_locations} used
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                    Unlimited location cap
                  </Badge>
                )}
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Price</div>
                  <div className="mt-1 font-medium">
                    {merchantTierStatus.plan
                      ? formatTierPrice(merchantTierStatus.plan.monthly_price_cents)
                      : 'Contact for pricing'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Current Period End</div>
                  <div className="mt-1 font-medium">{formatDate(merchantTierStatus.current_period_end)}</div>
                </div>
              </div>
              {merchantTierStatus.is_over_limit ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  Over plan limit. Merchant has {merchantTierStatus.active_location_count} active locations.
                  {recommendedMerchantTier ? ` Move them to ${recommendedMerchantTier.display_name}.` : ''}
                </div>
              ) : null}
              {!merchantTierStatus.plan ? (
                <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  No merchant-wide tier is assigned yet. Pick one on the right so merchant-side plan visibility has real data.
                </div>
              ) : null}
            </div>

            <div className="space-y-4 rounded-xl border p-4">
              <div className="space-y-3">
                <Label>Assign Tier</Label>
                <div className="grid gap-4 xl:grid-cols-3">
                  {merchantTierPlans.map((plan) => {
                    const isSelected = selectedMerchantTierPlanId === plan.id

                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedMerchantTierPlanId(plan.id)}
                        className={`flex min-h-[250px] flex-col rounded-2xl border p-5 text-left transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                            : 'border-slate-200 bg-white hover:border-primary/40'
                        }`}
                      >
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <div className="text-lg font-semibold">{plan.display_name}</div>
                          {isSelected ? <Badge>Selected</Badge> : null}
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-tight">
                          {formatTierPrice(plan.monthly_price_cents)}
                        </div>
                        <div className="mt-3 text-sm text-muted-foreground">
                          {plan.description || formatMerchantTierCapacity(plan)}
                        </div>
                        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                          {formatMerchantTierCapacity(plan)}
                        </div>
                        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                          {merchantTierHighlights(plan).map((line) => (
                            <div key={`${plan.id}-${line}`} className="flex items-start gap-2">
                              <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                              <span>{line}</span>
                            </div>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={merchantTierSubscriptionStatus}
                    onValueChange={(value) =>
                      setMerchantTierSubscriptionStatus(
                        value as 'active' | 'past_due' | 'suspended' | 'cancelled',
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="past_due">Past Due</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Current Period Start</Label>
                  <Input
                    type="date"
                    value={merchantTierPeriodStart}
                    onChange={(event) => setMerchantTierPeriodStart(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Current Period End</Label>
                  <Input
                    type="date"
                    value={merchantTierPeriodEnd}
                    onChange={(event) => setMerchantTierPeriodEnd(event.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {merchantTierSubscription ? (
                  <span>Last updated {formatDate(merchantTierSubscription.updated_at)}</span>
                ) : null}
                {recommendedMerchantTier ? (
                  <span>Recommended tier by active location count: {recommendedMerchantTier.display_name}</span>
                ) : (
                  <span>Recommended tier will appear once locations exist.</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleSaveMerchantTier} disabled={isPending || !selectedMerchantTierPlanId}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Merchant Tier
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
              <div className="space-y-2 2xl:col-span-2">
                <Label>Location</Label>
                <Select value={selectedLocation?.id || ''} onValueChange={setSelectedLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedLocations.map((location) => (
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
                        ? 'Location has a vaulted billing card.'
                        : 'Save a billing card for this location before subscription charging.'}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as SubscriptionStatus)}>
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
                <Label>Current Period Start</Label>
                <Input type="date" value={currentPeriodStart} onChange={(event) => setCurrentPeriodStart(event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Next Billing Date</Label>
                <Input type="date" value={nextBillingDate} onChange={(event) => setNextBillingDate(event.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={refresh} disabled={isPending}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={handleSave} disabled={isPending || !selectedLocation}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selectedLocationSubscription ? 'Save Changes' : 'Create Subscription'}
              </Button>
            </div>
          </div>
          <CardDescription>
            The first available location is loaded automatically. Services below show both currently subscribed items
            and available additions for the selected location.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/35 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Quantity</th>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-4 py-3 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {selectedServiceRows.map(({ service, enabled, quantity, subtotal }) => {
                  const quantityDisabled = !enabled || service.pricing_model === 'flat'
                  const currentQuantity = serviceFormState[service.id]?.quantity ?? '1'

                  return (
                    <tr key={service.id} className="border-t align-top">
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={enabled}
                            onCheckedChange={(checked) => updateServiceState(service.id, { enabled: Boolean(checked) })}
                            className="mt-0.5"
                          />
                          <div className="space-y-1">
                            <div className="font-medium">{service.display_name}</div>
                            <div className="text-xs text-muted-foreground">{service.service_code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="outline">{service.service_category}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        {service.pricing_model === 'flat' ? (
                          <span className="text-sm">{enabled ? 'Included' : '-'}</span>
                        ) : (
                          <div className="flex w-[122px] items-center gap-2 rounded-md border px-2 py-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={quantityDisabled}
                              onClick={() =>
                                updateServiceState(service.id, {
                                  quantity: String(Math.max(0, parsePositiveInteger(currentQuantity) - 1)),
                                })
                              }
                            >
                              -
                            </Button>
                            <Input
                              type="number"
                              min={0}
                              value={currentQuantity}
                              disabled={quantityDisabled}
                              onChange={(event) =>
                                updateServiceState(service.id, {
                                  quantity: event.target.value,
                                })
                              }
                              className="h-8 border-0 px-0 text-center shadow-none focus-visible:ring-0"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={!enabled}
                              onClick={() =>
                                updateServiceState(service.id, {
                                  quantity: String(parsePositiveInteger(currentQuantity) + 1),
                                })
                              }
                            >
                              +
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">{summarizePricing(service)}</td>
                      <td className="px-4 py-4 font-medium">{enabled ? formatMoney(subtotal) : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Payment Method</div>
              <div className="font-medium">{buildPaymentMethodLabel(selectedBillingProfile)}</div>
              <div className="text-xs text-muted-foreground">
                {selectedBillingProfile?.billing_email || 'No billing email on file'}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Billing Cycle</div>
              <div className="font-medium">Monthly</div>
              <div className="text-xs text-muted-foreground">
                {formatDate(currentPeriodStart)} to {formatDate(currentPeriodEnd)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Next Charge</div>
              <div className="font-medium">
                {selectedLocationSubscription ? formatMoney(selectedLocationSubscription.monthly_amount) : formatMoney(0)}
              </div>
              <div className="text-xs text-muted-foreground">{formatDate(nextBillingDate)}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Trial Ends At</Label>
              <Input
                type="date"
                value={trialEndsAt}
                onChange={(event) => setTrialEndsAt(event.target.value)}
                disabled={status !== 'trial'}
              />
            </div>
            <div className="space-y-2">
              <Label>Current Period End</Label>
              <Input
                type="date"
                value={currentPeriodEnd}
                onChange={(event) => setCurrentPeriodEnd(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Quick Actions</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={!selectedLocationSubscription || isPending}
                  onClick={() => selectedLocationSubscription && handleGenerateInvoice(selectedLocationSubscription.id)}
                >
                  Generate Invoice
                </Button>
                {selectedLocation ? (
                  <Button variant="ghost" asChild>
                    <Link href={`/manage/merchants/${merchant.clerk_org_id || merchant.id}?tab=billing&billingScope=${selectedLocation.id}`}>
                      Open Billing
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Transactions
          </CardTitle>
          <CardDescription>
            Subscription payment activity for {selectedLocation?.name || 'the selected location'}. This section reflects charge events from subscription invoices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1.25fr)_minmax(0,0.9fr)]">
            <Card className="border-muted">
              <CardContent className="space-y-5 pt-6">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Net collected</div>
                  <div className="text-3xl font-semibold">{formatMoney(transactionSummary.paid)}</div>
                  <div className="text-xs text-muted-foreground">
                    For {selectedLocation?.name || 'this location'}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                      Money in
                    </div>
                    <span className="font-medium">{formatMoney(transactionSummary.paid)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Wallet className="h-4 w-4 text-amber-500" />
                      Pending
                    </div>
                    <span className="font-medium">{formatMoney(transactionSummary.pending)}</span>
                  </div>
                  {transactionSummary.pending > 0 ? (
                    <div className="pl-6 text-xs text-muted-foreground">
                      Base {formatMoney(transactionSummary.pendingSubtotal)} + surcharge {formatMoney(transactionSummary.pendingSurcharge)}
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ArrowDownRight className="h-4 w-4 text-rose-500" />
                      Failed charges
                    </div>
                    <span className="font-medium">{transactionSummary.failedCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-muted">
              <CardContent className="pt-6">
                {transactionTrendData.length === 0 ? (
                  <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                    No charge activity yet.
                  </div>
                ) : (
                  <ChartContainer config={transactionTrendChartConfig} className="h-[220px] w-full">
                    <AreaChart data={transactionTrendData}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${Number(value).toFixed(0)}`} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value, name) => [
                              formatMoney(Number(value) || 0),
                              name,
                            ]}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="paid"
                        stroke="var(--color-paid)"
                        fill="var(--color-paid)"
                        fillOpacity={0.18}
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="failed"
                        stroke="var(--color-failed)"
                        fill="var(--color-failed)"
                        fillOpacity={0.1}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-muted">
              <CardContent className="pt-6">
                {transactionStatusData.length === 0 ? (
                  <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                    No status distribution yet.
                  </div>
                ) : (
                  <ChartContainer config={transactionStatusChartConfig} className="h-[220px] w-full">
                    <BarChart data={transactionStatusData} margin={{ left: 12, right: 12 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(_, __, item) => {
                              const payload = item?.payload as { count?: number; total?: number } | undefined
                              return [
                                `${payload?.count ?? 0} invoice${(payload?.count ?? 0) === 1 ? '' : 's'} • ${formatMoney(Number(payload?.total) || 0)}`,
                                'Status',
                              ]
                            }}
                          />
                        }
                      />
                      <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                        {transactionStatusData.map((entry) => (
                          <Cell key={`status-cell-${entry.status}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Transaction Table</div>
                <div className="text-xs text-muted-foreground">
                  Charge-side view of subscription invoice activity.
                </div>
              </div>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No transactions yet for this location.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => {
                    const activityDate = invoice.paid_at || invoice.last_payment_attempt_at || invoice.created_at
                    const reference = invoice.nmi_transaction_id || invoice.last_payment_error || '-'

                    return (
                      <TableRow key={`txn-${invoice.id}`}>
                        <TableCell>{formatDate(activityDate)}</TableCell>
                        <TableCell className="max-w-[280px] truncate text-muted-foreground">{reference}</TableCell>
                        <TableCell className="uppercase">{invoice.billing_method}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell className="text-right">
                          <div className="font-medium">{formatMoney(invoice.total_amount)}</div>
                          {Number(invoice.card_surcharge || 0) > 0 ? (
                            <div className="text-xs text-muted-foreground">
                              {formatMoney(invoice.subtotal)} + {formatMoney(invoice.card_surcharge)}
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Subscription Invoices
          </CardTitle>
          <CardDescription>
            Existing invoice workflow stays unchanged here. View, download, and charge location invoices from the same workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading invoices...</div>
          ) : filteredInvoices.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No subscription invoices have been generated for this location yet.
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
                  {filteredInvoices.map((invoice) => (
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
                      <td className="py-3 pr-4">
                        <div>{formatMoney(invoice.total_amount)}</div>
                        {Number(invoice.card_surcharge || 0) > 0 ? (
                          <div className="text-xs text-muted-foreground">
                            {formatMoney(invoice.subtotal)} + {formatMoney(invoice.card_surcharge)}
                          </div>
                        ) : null}
                      </td>
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
                              disabled={isPending}
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
