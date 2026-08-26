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
import { Textarea } from '@/components/ui/textarea'
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
  getPendingMerchantTierRequest,
  getPendingMerchantHardwareRequests,
  getMerchantTierStatus,
  getMerchantTierSubscription,
  approveMerchantHardwareRequest,
  denyMerchantHardwareRequest,
  denyMerchantTierPlanRequest,
  chargeSubscriptionInvoiceManually,
  calculateSubscriptionTotal,
  generateSubscriptionInvoiceManually,
  getBillableServices,
  getDeviceBillingServiceMappings,
  getSubscriptionPlans,
  getSubscriptionInvoiceDocument,
  getMerchantSubscriptions,
  getSubscriptionInvoices,
  getSubscriptionServiceAssignments,
  setMerchantSubscriptionGracePeriod,
  replaceSubscriptionServiceAssignments,
  type BillableServiceRecord,
  type DeviceBillingServiceMappingRecord,
  type SubscriptionPlanRecord,
  type SubscriptionQuoteResult,
  type MerchantTierPlanRecord,
  type MerchantTierPlanRequestRecord,
  type MerchantHardwareRequestRecord,
  type MerchantTierStatusRecord,
  type MerchantTierSubscriptionRecord,
  type MerchantSubscriptionRecord,
  type SubscriptionInvoiceRecord,
  type SubscriptionServiceAssignmentRecord,
  upsertBillableService,
  upsertDeviceBillingServiceMapping,
  upsertMerchantTierSubscription,
  upsertMerchantSubscription,
  upsertSubscriptionPlan,
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
import { getMerchantTierPresentation } from '@/lib/subscription-billing/merchant-tier-presentation'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'

type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'
type ServiceFormState = Record<string, { enabled: boolean; quantity: string }>
type BillingMethod = 'ach' | 'card'

const BILLABLE_DEVICE_CATEGORIES = [
  'pos_tablet',
  'cfd',
  'kds',
  'payment_terminal',
  'receipt_printer',
  'kitchen_printer',
  'cash_drawer',
] as const

type ServicePlanFormState = {
  planId: string | null
  planCode: string
  displayName: string
  basePriceMonthly: string
  includedStations: string
  perExtraStationPrice: string
  cardSurchargePct: string
  isActive: boolean
}

type BillableServiceFormState = {
  serviceId: string | null
  serviceCode: string
  displayName: string
  serviceCategory: BillableServiceRecord['service_category']
  pricingModel: BillableServiceRecord['pricing_model']
  basePriceMonthly: string
  additionalUnitPrice: string
  includedQuantity: string
  cardSurchargePct: string
  unitLabel: string
  isActive: boolean
}

type DeviceBillingMappingFormState = {
  deviceCategory: string
  serviceCode: string
  isActive: boolean
}

function planToFormState(plan?: SubscriptionPlanRecord | null): ServicePlanFormState {
  return {
    planId: plan?.id ?? null,
    planCode: plan?.plan_code ?? 'SERVICE_CATALOG',
    displayName: plan?.display_name ?? 'Dexa POS Base',
    basePriceMonthly: String(plan?.base_price_monthly ?? 99),
    includedStations: String(plan?.included_stations ?? 1),
    perExtraStationPrice: String(plan?.per_extra_station_price ?? 49),
    cardSurchargePct: String(plan?.card_surcharge_pct ?? 4),
    isActive: plan?.is_active ?? true,
  }
}

function serviceToFormState(service?: BillableServiceRecord | null): BillableServiceFormState {
  return {
    serviceId: service?.id ?? null,
    serviceCode: service?.service_code ?? '',
    displayName: service?.display_name ?? '',
    serviceCategory: service?.service_category ?? 'software',
    pricingModel: service?.pricing_model ?? 'flat',
    basePriceMonthly: String(service?.base_price_monthly ?? 0),
    additionalUnitPrice: service?.additional_unit_price === null || service?.additional_unit_price === undefined
      ? ''
      : String(service.additional_unit_price),
    includedQuantity: String(service?.included_quantity ?? 0),
    cardSurchargePct: String(service?.card_surcharge_pct ?? 4),
    unitLabel: service?.unit_label ?? 'unit',
    isActive: service?.is_active ?? true,
  }
}

function mappingToFormState(
  mapping?: DeviceBillingServiceMappingRecord | null,
  fallbackServiceCode = ''
): DeviceBillingMappingFormState {
  return {
    deviceCategory: mapping?.device_category ?? 'pos_tablet',
    serviceCode: mapping?.service_code ?? fallbackServiceCode,
    isActive: mapping?.is_active ?? true,
  }
}

function parseMoneyInput(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Number(parsed.toFixed(2))) : 0
}

function parsePercentInput(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(100, Math.max(0, Number(parsed.toFixed(4))))
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

function readQuoteLineString(item: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return fallback
}

function readQuoteLineNumber(item: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return fallback
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

function formatDateTimeLocalInput(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
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

function formatMerchantTierBillingUnit(plan: MerchantTierPlanRecord): string {
  const presentation = getMerchantTierPresentation(plan.plan_code)
  if (presentation) return presentation.billingUnit

  if (plan.max_locations === null) {
    return `${plan.min_locations ?? 0}+ locations`
  }

  if (plan.min_locations === plan.max_locations) {
    return `${plan.max_locations} location`
  }

  return `${plan.min_locations ?? 0}-${plan.max_locations} locations`
}

function merchantTierHighlights(plan: MerchantTierPlanRecord): string[] {
  return getMerchantTierPresentation(plan.plan_code)?.highlights ?? [
    'Merchant-wide plan',
    'Flat monthly tier',
    'Contact sales for setup',
  ]
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
  const [deviceBillingMappings, setDeviceBillingMappings] = useState<DeviceBillingServiceMappingRecord[]>([])
  const [servicePlans, setServicePlans] = useState<SubscriptionPlanRecord[]>([])
  const [subscriptions, setSubscriptions] = useState<MerchantSubscriptionRecord[]>([])
  const [invoices, setInvoices] = useState<SubscriptionInvoiceRecord[]>([])
  const [subscriptionServiceMap, setSubscriptionServiceMap] = useState<Record<string, SubscriptionServiceAssignmentRecord[]>>({})
  const [locationEligibilityMap, setLocationEligibilityMap] = useState<Record<string, MerchantNmiAccountRow>>({})
  const [billingProfilesByLocation, setBillingProfilesByLocation] = useState<Record<string, MerchantBillingProfileRecord>>({})
  const [serviceFormState, setServiceFormState] = useState<ServiceFormState>({})
  const [selectedServicePlanId, setSelectedServicePlanId] = useState('')
  const [servicePlanForm, setServicePlanForm] = useState<ServicePlanFormState>(() => planToFormState(null))
  const [selectedCatalogServiceId, setSelectedCatalogServiceId] = useState('')
  const [billableServiceForm, setBillableServiceForm] = useState<BillableServiceFormState>(() => serviceToFormState(null))
  const [selectedDeviceMappingCategory, setSelectedDeviceMappingCategory] = useState('pos_tablet')
  const [deviceMappingForm, setDeviceMappingForm] = useState<DeviceBillingMappingFormState>(() => mappingToFormState(null))
  const [quoteBillingMethod, setQuoteBillingMethod] = useState<BillingMethod>('card')
  const [quoteStationCount, setQuoteStationCount] = useState('1')
  const [quote, setQuote] = useState<SubscriptionQuoteResult | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [status, setStatus] = useState<SubscriptionStatus>('active')
  const [currentPeriodStart, setCurrentPeriodStart] = useState(startOfMonthIso())
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(endOfMonthIso())
  const [nextBillingDate, setNextBillingDate] = useState(firstDayNextMonthIso())
  const [trialEndsAt, setTrialEndsAt] = useState('')
  const [gracePeriodEndsAt, setGracePeriodEndsAt] = useState('')
  const [graceReason, setGraceReason] = useState('')
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
  const [pendingMerchantTierRequest, setPendingMerchantTierRequest] = useState<MerchantTierPlanRequestRecord | null>(null)
  const [merchantTierDecisionNote, setMerchantTierDecisionNote] = useState('')
  const [pendingHardwareRequests, setPendingHardwareRequests] = useState<MerchantHardwareRequestRecord[]>([])
  const [hardwareDecisionNotes, setHardwareDecisionNotes] = useState<Record<string, string>>({})
  const [selectedMerchantTierPlanId, setSelectedMerchantTierPlanId] = useState('')
  const [merchantTierSubscriptionStatus, setMerchantTierSubscriptionStatus] = useState<'active' | 'past_due' | 'suspended' | 'cancelled'>('active')
  const [merchantTierPeriodStart, setMerchantTierPeriodStart] = useState(startOfMonthIso())

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

  const selectedServicePlan = useMemo(
    () => servicePlans.find((plan) => plan.id === selectedServicePlanId) ?? servicePlans[0] ?? null,
    [selectedServicePlanId, servicePlans]
  )

  const saveGracePeriod = (clear = false) => {
    if (!selectedLocationSubscription) {
      toast.error('Create the location subscription first.')
      return
    }

    startTransition(async () => {
      const result = await setMerchantSubscriptionGracePeriod({
        subscriptionId: selectedLocationSubscription.id,
        gracePeriodEndsAt: clear || !gracePeriodEndsAt
          ? null
          : new Date(gracePeriodEndsAt).toISOString(),
        reason: graceReason,
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to update the grace period.')
        return
      }

      toast.success(clear ? 'Grace period cleared.' : 'Grace period extended.')
      refresh()
    })
  }

  const selectedCatalogService = useMemo(
    () => (selectedCatalogServiceId ? services.find((service) => service.id === selectedCatalogServiceId) ?? null : null),
    [selectedCatalogServiceId, services]
  )

  const selectedDeviceMapping = useMemo(
    () =>
      deviceBillingMappings.find((mapping) => mapping.device_category === selectedDeviceMappingCategory) ??
      null,
    [deviceBillingMappings, selectedDeviceMappingCategory]
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

  useEffect(() => {
    let cancelled = false
    const timeout = window.setTimeout(async () => {
      setIsQuoteLoading(true)
      setQuoteError(null)

      const result = await calculateSubscriptionTotal({
        planId: selectedServicePlan?.id ?? null,
        stationCount: Math.max(0, parsePositiveInteger(quoteStationCount)),
        billingMethod: quoteBillingMethod,
        services: selectedServiceRows
          .filter((row) => row.enabled && row.quantity > 0)
          .map((row) => ({
            serviceId: row.service.id,
            serviceCode: row.service.service_code,
            quantity: row.quantity,
          })),
      })

      if (cancelled) return

      if (!result.success || !result.data) {
        setQuote(null)
        setQuoteError(result.error || 'Unable to calculate quote.')
      } else {
        setQuote(result.data)
      }

      setIsQuoteLoading(false)
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [quoteBillingMethod, quoteStationCount, selectedServicePlan?.id, selectedServiceRows])

  const refresh = () => {
    startTransition(async () => {
      try {
        const [
          nextServices,
          nextDeviceBillingMappings,
          nextServicePlans,
          nextSubscriptions,
          nextInvoices,
          nmiSummary,
          billingProfiles,
          nextMerchantTierPlans,
          nextMerchantTierStatus,
          nextMerchantTierSubscription,
          nextPendingMerchantTierRequest,
          nextPendingHardwareRequests,
        ] = await Promise.all([
          getBillableServices(),
          getDeviceBillingServiceMappings(),
          getSubscriptionPlans(),
          getMerchantSubscriptions(merchant.id),
          getSubscriptionInvoices(merchant.id, null, 100),
          getMerchantNmiAccountsSummary(merchant.id),
          getMerchantBillingProfiles(merchant.id),
          getMerchantTierPlans(),
          getMerchantTierStatus(merchant.id),
          getMerchantTierSubscription(merchant.id),
          getPendingMerchantTierRequest(merchant.id),
          getPendingMerchantHardwareRequests(merchant.id),
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
        setDeviceBillingMappings(nextDeviceBillingMappings)
        setServicePlans(nextServicePlans)
        setSubscriptions(nextSubscriptions)
        setInvoices(nextInvoices)
        setSubscriptionServiceMap(nextAssignmentMap)
        setLocationEligibilityMap(nextEligibilityMap)
        setBillingProfilesByLocation(nextBillingProfilesByLocation)
        setMerchantTierPlans(nextMerchantTierPlans)
        setMerchantTierStatus(nextMerchantTierStatus)
        setMerchantTierSubscription(nextMerchantTierSubscription)
        setPendingMerchantTierRequest(nextPendingMerchantTierRequest)
        setPendingHardwareRequests(nextPendingHardwareRequests)

        const defaultServicePlan =
          nextServicePlans.find((plan) => plan.id === selectedServicePlanId) ??
          nextServicePlans.find((plan) => plan.plan_code === 'SERVICE_CATALOG') ??
          nextServicePlans[0] ??
          null
        setSelectedServicePlanId(defaultServicePlan?.id || '')
        setServicePlanForm(planToFormState(defaultServicePlan))

        const defaultCatalogService =
          nextServices.find((service) => service.id === selectedCatalogServiceId) ??
          nextServices[0] ??
          null
        setSelectedCatalogServiceId(defaultCatalogService?.id || '')
        setBillableServiceForm(serviceToFormState(defaultCatalogService))

        const defaultMappingCategory = selectedDeviceMappingCategory || 'pos_tablet'
        const defaultDeviceMapping =
          nextDeviceBillingMappings.find((mapping) => mapping.device_category === defaultMappingCategory) ??
          nextDeviceBillingMappings[0] ??
          null
        const fallbackServiceCode =
          nextServices.find((service) => service.service_code === defaultMappingCategory)?.service_code ??
          nextServices[0]?.service_code ??
          ''
        setSelectedDeviceMappingCategory(defaultDeviceMapping?.device_category ?? defaultMappingCategory)
        setDeviceMappingForm(mappingToFormState(defaultDeviceMapping, fallbackServiceCode))

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
            setGracePeriodEndsAt(
              formatDateTimeLocalInput(defaultSubscription.grace_period_ends_at),
            )
            setGraceReason(defaultSubscription.grace_reason ?? '')
            setServiceFormState(
              buildInitialServiceFormState(nextServices, nextAssignmentMap[defaultSubscription.id] ?? [])
            )
          } else {
            setStatus('active')
            setCurrentPeriodStart(startOfMonthIso())
            setCurrentPeriodEnd(endOfMonthIso())
            setNextBillingDate(firstDayNextMonthIso())
            setTrialEndsAt('')
            setGracePeriodEndsAt('')
            setGraceReason('')
            setServiceFormState(buildInitialServiceFormState(nextServices))
          }
        }

        if (nextMerchantTierSubscription) {
          setSelectedMerchantTierPlanId(nextMerchantTierSubscription.plan_id)
          setMerchantTierSubscriptionStatus(nextMerchantTierSubscription.status)
          setMerchantTierPeriodStart(nextMerchantTierSubscription.current_period_start.slice(0, 10))
        } else {
          const suggestedPlan =
            nextMerchantTierPlans.find((plan) => plan.plan_code === nextMerchantTierStatus.required_plan_code) ??
            nextMerchantTierPlans[0] ??
            null

          setSelectedMerchantTierPlanId(suggestedPlan?.id || '')
          setMerchantTierSubscriptionStatus('active')
          setMerchantTierPeriodStart(startOfMonthIso())
        }

        if (nextPendingMerchantTierRequest) {
          setSelectedMerchantTierPlanId(nextPendingMerchantTierRequest.requested_plan_id)
        }
        setMerchantTierDecisionNote('')
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
      setGracePeriodEndsAt(
        formatDateTimeLocalInput(
          selectedLocationSubscription.grace_period_ends_at,
        ),
      )
      setGraceReason(selectedLocationSubscription.grace_reason ?? '')
      setServiceFormState(buildInitialServiceFormState(services, selectedAssignments))
      return
    }

    setStatus('active')
    setCurrentPeriodStart(startOfMonthIso())
    setCurrentPeriodEnd(endOfMonthIso())
    setNextBillingDate(firstDayNextMonthIso())
    setTrialEndsAt('')
    setGracePeriodEndsAt('')
    setGraceReason('')
    setServiceFormState(buildInitialServiceFormState(services))
  }, [selectedLocation, selectedLocationSubscription, selectedAssignments, services])

  useEffect(() => {
    if (selectedServicePlan) {
      setServicePlanForm(planToFormState(selectedServicePlan))
    }
  }, [selectedServicePlan])

  useEffect(() => {
    if (selectedCatalogService) {
      setBillableServiceForm(serviceToFormState(selectedCatalogService))
    }
  }, [selectedCatalogService])

  useEffect(() => {
    const fallbackServiceCode =
      services.find((service) => service.service_code === selectedDeviceMappingCategory)?.service_code ??
      services[0]?.service_code ??
      ''
    setDeviceMappingForm(mappingToFormState(selectedDeviceMapping, fallbackServiceCode))
  }, [selectedDeviceMapping, selectedDeviceMappingCategory, services])

  useEffect(() => {
    setQuoteBillingMethod(selectedBillingProfile?.billing_method === 'ach' ? 'ach' : 'card')
  }, [selectedBillingProfile?.billing_method])

  useEffect(() => {
    setQuoteStationCount(String(Math.max(1, selectedLocationSubscription?.station_count ?? 1)))
  }, [selectedLocationSubscription?.id, selectedLocationSubscription?.station_count])

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
        planId: selectedServicePlan?.id ?? selectedLocationSubscription?.plan_id ?? null,
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

  const handleSaveMerchantTier = (
    planIdOverride?: string,
    statusOverride?: 'active' | 'past_due' | 'suspended' | 'cancelled',
    requestIdOverride?: string,
  ) => {
    const planId = planIdOverride || selectedMerchantTierPlanId
    const subscriptionStatus = statusOverride || merchantTierSubscriptionStatus
    if (!planId) {
      toast.error('Select a merchant tier first.')
      return
    }

    startTransition(async () => {
      const result = await upsertMerchantTierSubscription({
        merchantId: merchant.id,
        planId,
        requestId: requestIdOverride,
        status: subscriptionStatus,
        currentPeriodStart: merchantTierPeriodStart,
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
      if (result.notificationWarning) {
        toast.warning(result.notificationWarning)
      }
      refresh()
    })
  }

  const handleDenyMerchantTierRequest = () => {
    if (!pendingMerchantTierRequest) return

    startTransition(async () => {
      const result = await denyMerchantTierPlanRequest(
        pendingMerchantTierRequest.id,
        merchantTierDecisionNote,
      )

      if (!result.success) {
        toast.error(result.error || 'Failed to deny the subscription request.')
        return
      }

      toast.success(`Request ${pendingMerchantTierRequest.request_number} denied.`)
      if (result.notificationWarning) toast.warning(result.notificationWarning)
      refresh()
    })
  }

  const handleHardwareRequestDecision = (
    request: MerchantHardwareRequestRecord,
    decision: 'approved' | 'denied',
  ) => {
    startTransition(async () => {
      const decisionNote = hardwareDecisionNotes[request.id]?.trim()
      const result =
        decision === 'approved'
          ? await approveMerchantHardwareRequest(request.id, decisionNote)
          : await denyMerchantHardwareRequest(request.id, decisionNote)

      if (!result.success) {
        toast.error(result.error || 'Failed to review the hardware request.')
        return
      }

      toast.success(
        `Request ${request.request_number} ${decision === 'approved' ? 'approved' : 'denied'}.`,
      )
      if (result.notificationWarning) toast.warning(result.notificationWarning)
      setHardwareDecisionNotes((current) => {
        const next = { ...current }
        delete next[request.id]
        return next
      })
      refresh()
    })
  }

  const handleSaveServicePlan = () => {
    startTransition(async () => {
      const result = await upsertSubscriptionPlan({
        planId: servicePlanForm.planId,
        planCode: servicePlanForm.planCode.trim(),
        displayName: servicePlanForm.displayName.trim(),
        basePriceMonthly: parseMoneyInput(servicePlanForm.basePriceMonthly),
        includedStations: parsePositiveInteger(servicePlanForm.includedStations),
        perExtraStationPrice: parseMoneyInput(servicePlanForm.perExtraStationPrice),
        cardSurchargePct: parsePercentInput(servicePlanForm.cardSurchargePct),
        isActive: servicePlanForm.isActive,
        metadata: {
          source: 'hq_subscriptions_workspace',
          pricingModel: 'service_catalog',
        },
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to save subscription plan.')
        return
      }

      if (result.planId) {
        setSelectedServicePlanId(result.planId)
      }
      toast.success('Subscription plan pricing saved.')
      refresh()
    })
  }

  const handleSaveBillableService = () => {
    startTransition(async () => {
      const result = await upsertBillableService({
        serviceId: billableServiceForm.serviceId,
        serviceCode: billableServiceForm.serviceCode.trim(),
        displayName: billableServiceForm.displayName.trim(),
        serviceCategory: billableServiceForm.serviceCategory,
        pricingModel: billableServiceForm.pricingModel,
        basePriceMonthly: parseMoneyInput(billableServiceForm.basePriceMonthly),
        additionalUnitPrice:
          billableServiceForm.additionalUnitPrice.trim().length > 0
            ? parseMoneyInput(billableServiceForm.additionalUnitPrice)
            : null,
        includedQuantity: parsePositiveInteger(billableServiceForm.includedQuantity),
        cardSurchargePct: parsePercentInput(billableServiceForm.cardSurchargePct),
        unitLabel: billableServiceForm.unitLabel.trim() || 'unit',
        isActive: billableServiceForm.isActive,
        metadata: {
          source: 'hq_subscriptions_workspace',
        },
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to save billable service.')
        return
      }

      if (result.serviceId) {
        setSelectedCatalogServiceId(result.serviceId)
      }
      toast.success('Billable service pricing saved.')
      refresh()
    })
  }

  const handleSaveDeviceBillingMapping = () => {
    startTransition(async () => {
      const result = await upsertDeviceBillingServiceMapping({
        deviceCategory: deviceMappingForm.deviceCategory,
        serviceCode: deviceMappingForm.serviceCode,
        isActive: deviceMappingForm.isActive,
        metadata: {
          source: 'hq_subscriptions_workspace',
        },
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to save device billing mapping.')
        return
      }

      setSelectedDeviceMappingCategory(deviceMappingForm.deviceCategory)
      toast.success('Device billing mapping saved.')
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
          {pendingMerchantTierRequest ? (
            <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{pendingMerchantTierRequest.request_number}</Badge>
                    <Badge variant="outline">Pending review</Badge>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">
                      Merchant requested {pendingMerchantTierRequest.requested_plan_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatTierPrice(pendingMerchantTierRequest.requested_monthly_price_cents)}
                      {' · '}
                      Requested {formatDate(pendingMerchantTierRequest.requested_at)}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Current plan: {pendingMerchantTierRequest.current_plan_name || 'No active plan'}
                  </p>
                </div>

                <div className="w-full space-y-3 lg:max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="merchant-tier-decision-note">Decision note (optional)</Label>
                    <Textarea
                      id="merchant-tier-decision-note"
                      value={merchantTierDecisionNote}
                      onChange={(event) => setMerchantTierDecisionNote(event.target.value)}
                      placeholder="Add context for the merchant when denying the request."
                      rows={3}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      className="sm:flex-1"
                      disabled={isPending}
                      onClick={() => {
                        setSelectedMerchantTierPlanId(pendingMerchantTierRequest.requested_plan_id)
                        setMerchantTierSubscriptionStatus('active')
                        handleSaveMerchantTier(
                          pendingMerchantTierRequest.requested_plan_id,
                          'active',
                          pendingMerchantTierRequest.id,
                        )
                      }}
                    >
                      {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Approve & activate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="sm:flex-1"
                      disabled={isPending}
                      onClick={handleDenyMerchantTierRequest}
                    >
                      Deny request
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {pendingHardwareRequests.length > 0 ? (
            <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
              <div>
                <h3 className="font-semibold">Pending hardware requests</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review each location independently. Approval starts fulfillment and does not assign inventory automatically.
                </p>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {pendingHardwareRequests.map((request) => (
                  <div key={request.id} className="space-y-4 rounded-xl border bg-background p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{request.request_number}</Badge>
                          <Badge variant="secondary">{request.requested_quantity} device{request.requested_quantity === 1 ? '' : 's'}</Badge>
                        </div>
                        <p className="mt-2 font-medium">{request.location_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Requested {formatDate(request.requested_at)}
                        </p>
                      </div>
                    </div>
                    {request.request_note ? (
                      <p className="rounded-lg bg-muted/50 p-3 text-sm">{request.request_note}</p>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor={`hardware-decision-note-${request.id}`}>
                        Decision note (optional)
                      </Label>
                      <Textarea
                        id={`hardware-decision-note-${request.id}`}
                        value={hardwareDecisionNotes[request.id] ?? ''}
                        onChange={(event) =>
                          setHardwareDecisionNotes((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                        placeholder="Add fulfillment details or explain the decision."
                        rows={2}
                      />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        className="sm:flex-1"
                        disabled={isPending}
                        onClick={() => handleHardwareRequestDecision(request, 'approved')}
                      >
                        Approve request
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="sm:flex-1"
                        disabled={isPending}
                        onClick={() => handleHardwareRequestDecision(request, 'denied')}
                      >
                        Deny request
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
                          {plan.description || formatMerchantTierBillingUnit(plan)}
                        </div>
                        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                          {formatMerchantTierBillingUnit(plan)}
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

              <div className="grid gap-4 md:grid-cols-2 md:items-end">
                <div className="space-y-2">
                  <Label>Current Period Start</Label>
                  <Input
                    type="date"
                    value={merchantTierPeriodStart}
                    onChange={(event) => setMerchantTierPeriodStart(event.target.value)}
                  />
                </div>
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-foreground">Monthly auto-renewal</p>
                  <p className="text-muted-foreground">
                    The period end is calculated automatically. Active subscriptions renew monthly until their status is set to Cancelled.
                  </p>
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
                <Button onClick={() => handleSaveMerchantTier()} disabled={isPending || !selectedMerchantTierPlanId}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Merchant Tier
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing Catalog Controls</CardTitle>
          <CardDescription>
            HQ-owned pricing controls for the service-billing plan and billable add-ons. Saves go through audited RPCs
            and recalculate affected active subscriptions for future cycles.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">Service Billing Plan</div>
                <p className="text-xs text-muted-foreground">
                  Base station price, included stations, extra-station price, and card surcharge.
                </p>
              </div>
              <Badge variant={servicePlanForm.isActive ? 'default' : 'secondary'}>
                {servicePlanForm.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={selectedServicePlanId} onValueChange={setSelectedServicePlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {servicePlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.display_name} ({plan.plan_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Plan Code</Label>
                <Input
                  value={servicePlanForm.planCode}
                  onChange={(event) => setServicePlanForm((current) => ({ ...current, planCode: event.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Display Name</Label>
                <Input
                  value={servicePlanForm.displayName}
                  onChange={(event) => setServicePlanForm((current) => ({ ...current, displayName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>First Station Price</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={servicePlanForm.basePriceMonthly}
                  onChange={(event) =>
                    setServicePlanForm((current) => ({ ...current, basePriceMonthly: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Included Stations</Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={servicePlanForm.includedStations}
                  onChange={(event) =>
                    setServicePlanForm((current) => ({ ...current, includedStations: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Additional Station Price</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={servicePlanForm.perExtraStationPrice}
                  onChange={(event) =>
                    setServicePlanForm((current) => ({ ...current, perExtraStationPrice: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Card Surcharge %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={servicePlanForm.cardSurchargePct}
                  onChange={(event) =>
                    setServicePlanForm((current) => ({ ...current, cardSurchargePct: event.target.value }))
                  }
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={servicePlanForm.isActive}
                onCheckedChange={(checked) =>
                  setServicePlanForm((current) => ({ ...current, isActive: Boolean(checked) }))
                }
              />
              Active plan
            </label>

            <Button onClick={handleSaveServicePlan} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Plan Pricing
            </Button>
          </div>

          <div className="space-y-4 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">Billable Services & Add-ons</div>
                <p className="text-xs text-muted-foreground">
                  Edit POS tablet, KDS, online ordering, loyalty, delivery integration, franchise, and future services.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedCatalogServiceId('')
                  setBillableServiceForm(serviceToFormState(null))
                }}
              >
                New Service
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Service</Label>
                <Select value={selectedCatalogServiceId} onValueChange={setSelectedCatalogServiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.display_name} ({service.service_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Service Code</Label>
                <Input
                  value={billableServiceForm.serviceCode}
                  onChange={(event) =>
                    setBillableServiceForm((current) => ({ ...current, serviceCode: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Display Name</Label>
                <Input
                  value={billableServiceForm.displayName}
                  onChange={(event) =>
                    setBillableServiceForm((current) => ({ ...current, displayName: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={billableServiceForm.serviceCategory}
                  onValueChange={(value) =>
                    setBillableServiceForm((current) => ({
                      ...current,
                      serviceCategory: value as BillableServiceRecord['service_category'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hardware">Hardware</SelectItem>
                    <SelectItem value="software">Software</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pricing Model</Label>
                <Select
                  value={billableServiceForm.pricingModel}
                  onValueChange={(value) =>
                    setBillableServiceForm((current) => ({
                      ...current,
                      pricingModel: value as BillableServiceRecord['pricing_model'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat</SelectItem>
                    <SelectItem value="per_unit">Per unit</SelectItem>
                    <SelectItem value="tiered">Tiered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Base Monthly Price</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={billableServiceForm.basePriceMonthly}
                  onChange={(event) =>
                    setBillableServiceForm((current) => ({ ...current, basePriceMonthly: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Additional Unit Price</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={billableServiceForm.additionalUnitPrice}
                  onChange={(event) =>
                    setBillableServiceForm((current) => ({ ...current, additionalUnitPrice: event.target.value }))
                  }
                  placeholder="Only for tiered pricing"
                />
              </div>
              <div className="space-y-2">
                <Label>Included Quantity</Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={billableServiceForm.includedQuantity}
                  onChange={(event) =>
                    setBillableServiceForm((current) => ({ ...current, includedQuantity: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Label</Label>
                <Input
                  value={billableServiceForm.unitLabel}
                  onChange={(event) =>
                    setBillableServiceForm((current) => ({ ...current, unitLabel: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Card Surcharge %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={billableServiceForm.cardSurchargePct}
                  onChange={(event) =>
                    setBillableServiceForm((current) => ({ ...current, cardSurchargePct: event.target.value }))
                  }
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={billableServiceForm.isActive}
                onCheckedChange={(checked) =>
                  setBillableServiceForm((current) => ({ ...current, isActive: Boolean(checked) }))
                }
              />
              Active service
            </label>

            <Button onClick={handleSaveBillableService} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Service Pricing
            </Button>
          </div>

          <div className="space-y-4 rounded-xl border p-4 xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">Device Billing Mappings</div>
                <p className="text-xs text-muted-foreground">
                  Controls which deployed device categories automatically adjust billable service quantities.
                </p>
              </div>
              <Badge variant={deviceMappingForm.isActive ? 'default' : 'secondary'}>
                {deviceMappingForm.isActive ? 'Active mapping' : 'Inactive mapping'}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Device Category</Label>
                <Select
                  value={deviceMappingForm.deviceCategory}
                  onValueChange={(value) => {
                    setSelectedDeviceMappingCategory(value)
                    setDeviceMappingForm((current) => ({ ...current, deviceCategory: value }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLABLE_DEVICE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Billable Service</Label>
                <Select
                  value={deviceMappingForm.serviceCode}
                  onValueChange={(value) =>
                    setDeviceMappingForm((current) => ({ ...current, serviceCode: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select billable service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.service_code}>
                        {service.display_name} ({service.service_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={deviceMappingForm.isActive}
                  onCheckedChange={(checked) =>
                    setDeviceMappingForm((current) => ({ ...current, isActive: Boolean(checked) }))
                  }
                />
                Active mapping
              </label>
              <div className="text-xs text-muted-foreground">
                Device assignment sync recalculates subscription quantities after deployed device changes.
              </div>
            </div>

            <Button
              onClick={handleSaveDeviceBillingMapping}
              disabled={isPending || !deviceMappingForm.serviceCode}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Device Mapping
            </Button>
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

            <div className="grid gap-4 rounded-2xl bg-muted/30 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="billing-grace-until">Grace period until</Label>
                <Input
                  id="billing-grace-until"
                  type="datetime-local"
                  value={gracePeriodEndsAt}
                  onChange={(event) => setGracePeriodEndsAt(event.target.value)}
                  disabled={!selectedLocationSubscription}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billing-grace-reason">Reason</Label>
                <Input
                  id="billing-grace-reason"
                  value={graceReason}
                  onChange={(event) => setGraceReason(event.target.value)}
                  placeholder="Approved extension or temporary billing exception"
                  disabled={!selectedLocationSubscription}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => saveGracePeriod(false)}
                  disabled={isPending || !selectedLocationSubscription || !gracePeriodEndsAt}
                >
                  Extend grace
                </Button>
                {selectedLocationSubscription?.grace_period_ends_at ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => saveGracePeriod(true)}
                    disabled={isPending}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <CardDescription>
            The first available location is loaded automatically. Services below show both currently subscribed items
            and available additions for the selected location.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {selectedLocationSubscription?.status === 'suspended' ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <div className="space-y-1">
                <div className="font-medium text-destructive">Subscription access is suspended for this location.</div>
                <p className="text-muted-foreground">
                  The backend access gate disables stations and payment terminals while the subscription is suspended.
                  Change status back to Active or Trial after payment is restored.
                </p>
              </div>
            </div>
          ) : selectedLocationSubscription?.status === 'past_due' ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              <div className="space-y-1">
                <div className="font-medium">Subscription payment is past due.</div>
                <p className="text-amber-800">
                  Review billing before moving this subscription to Suspended. Suspension triggers station and terminal
                  deactivation through the backend access gate.
                </p>
              </div>
            </div>
          ) : null}

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

          <div className="grid gap-4 rounded-xl border bg-background p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">Live Calculator Quote</div>
                  <p className="text-xs text-muted-foreground">
                    Authoritative preview from `calculate_subscription_total`; invoice generation uses the same pricing path.
                  </p>
                </div>
                {isQuoteLoading ? (
                  <Badge variant="outline" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Calculating
                  </Badge>
                ) : quoteError ? (
                  <Badge variant="destructive">Quote error</Badge>
                ) : (
                  <Badge variant="default">Live</Badge>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Base Plan</Label>
                  <Select value={selectedServicePlanId} onValueChange={setSelectedServicePlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select base plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {servicePlans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Station Count</Label>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={quoteStationCount}
                    onChange={(event) => setQuoteStationCount(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Billing Method</Label>
                  <Select value={quoteBillingMethod} onValueChange={(value) => setQuoteBillingMethod(value as BillingMethod)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ach">ACH</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {quoteError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {quoteError}
                </div>
              ) : quote?.line_items?.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-muted/35 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Line</th>
                        <th className="px-3 py-2 font-medium">Qty</th>
                        <th className="px-3 py-2 font-medium">Unit</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.line_items.map((item, index) => {
                        const description = readQuoteLineString(item, ['description', 'display_name', 'code'], `Line ${index + 1}`)
                        const code = readQuoteLineString(item, ['code', 'service_code'])
                        const quantity = readQuoteLineNumber(item, ['quantity'], 1)
                        const unitPrice = readQuoteLineNumber(item, ['unit_price'], 0)
                        const amount = readQuoteLineNumber(item, ['amount', 'subtotal', 'total_amount'], 0)

                        return (
                          <tr key={`${code || description}-${index}`} className="border-t">
                            <td className="px-3 py-2">
                              <div className="font-medium">{description}</div>
                              {code ? <div className="text-xs text-muted-foreground">{code}</div> : null}
                            </td>
                            <td className="px-3 py-2">{quantity}</td>
                            <td className="px-3 py-2">{unitPrice ? formatMoney(unitPrice) : '-'}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatMoney(amount)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  Select a base plan or service to calculate a quote.
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border bg-muted/25 p-4">
              <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Quote Total</div>
              <div className="text-3xl font-semibold">{formatMoney(quote?.total_amount ?? 0)}</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMoney(quote?.subtotal ?? 0)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Card surcharge</span>
                  <span>{formatMoney(quote?.card_surcharge ?? 0)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Method</span>
                  <span className="uppercase">{quote?.billing_method ?? quoteBillingMethod}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Stations</span>
                  <span>{quote?.station_count ?? parsePositiveInteger(quoteStationCount)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Saving the subscription persists the selected base plan and services. Active station count is recalculated by the backend from deployed stations.
              </p>
            </div>
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
