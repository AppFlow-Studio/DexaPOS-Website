'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { SubscriptionCutoverReview } from './SubscriptionCutoverReview'
import { subscriptionBillingScope } from '@/supabase/functions/_shared/subscription-billing-scope'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  RefreshCcw,
  ShieldCheck,
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
import { Switch } from '@/components/ui/switch'
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
  getPendingMerchantServiceRequests,
  getMerchantTierStatus,
  getMerchantTierSubscription,
  approveMerchantHardwareRequest,
  denyMerchantHardwareRequest,
  denyMerchantTierPlanRequest,
  reviewMerchantServiceRequest,
  chargeSubscriptionInvoiceManually,
  calculateSubscriptionTotal,
  getActiveStationCount,
  generateSubscriptionInvoiceManually,
  getBillableServices,
  getDeviceBillingServiceMappings,
  getSubscriptionPlans,
  getSubscriptionInvoiceDocument,
  getMerchantSubscriptions,
  getSubscriptionInvoices,
  getSubscriptionServiceAssignments,
  setMerchantSubscriptionGracePeriod,
  setMerchantBillingExemption,
  saveAndChargeMerchantSubscription,
  type BillableServiceRecord,
  type DeviceBillingServiceMappingRecord,
  type SubscriptionPlanRecord,
  type SubscriptionQuoteResult,
  type MerchantTierPlanRecord,
  type MerchantTierPlanRequestRecord,
  type MerchantHardwareRequestRecord,
  type MerchantServiceRequestRecord,
  type MerchantTierStatusRecord,
  type MerchantTierSubscriptionRecord,
  type MerchantSubscriptionRecord,
  type SubscriptionInvoiceRecord,
  type SubscriptionServiceAssignmentRecord,
  upsertBillableService,
  upsertDeviceBillingServiceMapping,
  upsertMerchantTierSubscription,
  upsertSubscriptionPlan,
} from '@/app/manage/actions/subscription-billing'
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
import { MerchantBillingSection } from '@/app/manage/merchants/[merchantId]/components/subscription/MerchantBillingSection'
import { LocationBillingList } from '@/app/manage/merchants/[merchantId]/components/subscription/LocationBillingList'
import { LocationsWithoutSubscription } from '@/app/manage/merchants/[merchantId]/components/subscription/LocationsWithoutSubscription'
import { ReviewChangesSection } from '@/app/manage/merchants/[merchantId]/components/subscription/ReviewChangesSection'
import { BillingHistorySection } from '@/app/manage/merchants/[merchantId]/components/subscription/BillingHistorySection'
import { BillingInsightsSection } from '@/app/manage/merchants/[merchantId]/components/subscription/BillingInsightsSection'
import { SubscriptionEditSummary } from '@/app/manage/merchants/[merchantId]/components/subscription/SubscriptionEditSummary'
import { InfoHint } from '@/app/manage/merchants/[merchantId]/components/subscription/InfoHint'
import { Pencil } from 'lucide-react'

type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'
type ServiceFormState = Record<string, { enabled: boolean; quantity: string; comped?: boolean }>
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

/** Local YYYY-MM-DD (avoids the UTC day-shift `toISOString` can introduce). */
function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayIso(): string {
  return isoDate(new Date())
}

/** Add whole months to a YYYY-MM-DD date, clamping to the last valid day (Jan 31 + 1mo → Feb 28/29). */
function addMonthsIso(baseIso: string, months: number): string {
  const [y, m, d] = baseIso.split('-').map(Number)
  const anchor = new Date(y, m - 1 + months, 1)
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  anchor.setDate(Math.min(d, lastDay))
  return isoDate(anchor)
}

function addDaysIso(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split('-').map(Number)
  return isoDate(new Date(y, m - 1, d + days))
}

/**
 * A monthly billing cycle anchored to the charge date rather than the calendar
 * month: the period runs from `from` to the day before the same date next month,
 * and the next bill lands exactly one month out. Buy on the 12th → next bill the
 * 12th, not a hardcoded month-end.
 */
function freshBillingCycle(from = todayIso()): { start: string; end: string; nextBilling: string } {
  const nextBilling = addMonthsIso(from, 1)
  return { start: from, end: addDaysIso(nextBilling, -1), nextBilling }
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

function exportAuthorizationEvidence(
  filename: string,
  evidence: Record<string, unknown>,
) {
  const rows = Object.entries(evidence).map(([key, value]) =>
    `"${String(key).replace(/"/g, '""')}","${String(value ?? '').replace(/"/g, '""')}"`,
  )
  const blob = new Blob([`Field,Value\n${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function AuthorizationEvidence({
  reference,
  acceptedAt,
  termsVersion,
  text,
  price,
  cadence,
  requestedBy,
  ipAddress,
  userAgent,
  merchantName,
  locationName,
  featureName,
}: {
  reference: string | null
  acceptedAt: string | null
  termsVersion: string | null
  text: string | null
  price: string
  cadence: string | null
  requestedBy: string
  ipAddress: string | null
  userAgent: string | null
  merchantName?: string | null
  locationName?: string | null
  featureName?: string | null
}) {
  const evidence = {
    authorization_reference: reference,
    merchant_name: merchantName,
    location_name: locationName,
    feature_name: featureName,
    accepted_at: acceptedAt,
    terms_version: termsVersion,
    authorized_price: price,
    billing_cadence: cadence,
    requested_by: requestedBy,
    ip_address: ipAddress,
    user_agent: userAgent,
    authorization_text: text,
  }

  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Authorization evidence</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {Object.entries(evidence).map(([key, value]) => (
          <div key={key} className={key === 'authorization_text' || key === 'user_agent' ? 'sm:col-span-2' : ''}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, ' ')}</p>
            <p className="mt-1 break-words">{String(value || 'Not captured')}</p>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => exportAuthorizationEvidence(`${reference || 'authorization'}.csv`, evidence)}
      >
        <Download className="mr-2 h-4 w-4" />
        Export evidence
      </Button>
    </details>
  )
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
          comped: String((assignment?.metadata as any)?.comped ?? '') === 'true' || (assignment?.metadata as any)?.comped === true,
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

const SUBSCRIPTION_STEPS = [
  { id: 'tier', title: 'Confirm the plan', description: 'The merchant-wide tier is set automatically by active locations.' },
  { id: 'locations', title: 'Set up the location', description: 'Choose a location, then set its stations, devices, and features.' },
  { id: 'review', title: 'Review & charge', description: 'Confirm the amount and the card, then charge.' },
] as const

function SubscriptionStepNavigation({
  step,
  disabled,
  onChange,
}: {
  step: number
  disabled: boolean
  onChange: (step: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button type="button" variant="outline" disabled={disabled || step === 0} onClick={() => onChange(step - 1)}>
        <ChevronLeft className="h-4 w-4" />
        Back
      </Button>
      <span className="text-xs text-muted-foreground">Step {step + 1} of {SUBSCRIPTION_STEPS.length}</span>
      {step < SUBSCRIPTION_STEPS.length - 1 ? (
        <Button type="button" disabled={disabled} onClick={() => onChange(step + 1)}>
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      ) : (
        <span className="text-sm font-medium text-muted-foreground">Final step</span>
      )}
    </div>
  )
}

export function HqSubscriptionsWorkspace({
  merchant,
  canManageBilling,
}: HqSubscriptionsWorkspaceProps) {
  const [mode, setMode] = useState<'overview' | 'edit'>('overview')
  const [currentStep, setCurrentStep] = useState(0)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const activeStep = SUBSCRIPTION_STEPS[currentStep]
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [billingExemption, setBillingExemption] = useState(() => ({
    enabled: Boolean(merchant.billing_exempt),
    active: Boolean(merchant.billing_exempt) && (
      !merchant.billing_exempt_expires_at ||
      new Date(merchant.billing_exempt_expires_at).getTime() > Date.now()
    ),
    reason: merchant.billing_exempt_reason ?? null,
    expiresAt: merchant.billing_exempt_expires_at ?? null,
    grantedAt: merchant.billing_exempt_granted_at ?? null,
    grantedBy: merchant.billing_exempt_granted_by ?? null,
  }))
  const [billingExemptionRequested, setBillingExemptionRequested] = useState(
    billingExemption.active,
  )
  const [billingExemptionReason, setBillingExemptionReason] = useState('')
  const [billingExemptionExpiresAt, setBillingExemptionExpiresAt] = useState(
    billingExemption.expiresAt?.slice(0, 16) ?? '',
  )
  const [services, setServices] = useState<BillableServiceRecord[]>([])
  const [deviceBillingMappings, setDeviceBillingMappings] = useState<DeviceBillingServiceMappingRecord[]>([])
  const [servicePlans, setServicePlans] = useState<SubscriptionPlanRecord[]>([])
  const [subscriptions, setSubscriptions] = useState<MerchantSubscriptionRecord[]>([])
  const [invoices, setInvoices] = useState<SubscriptionInvoiceRecord[]>([])
  const [subscriptionServiceMap, setSubscriptionServiceMap] = useState<Record<string, SubscriptionServiceAssignmentRecord[]>>({})
  const [billingProfilesByLocation, setBillingProfilesByLocation] = useState<Record<string, MerchantBillingProfileRecord>>({})
  const [allBillingProfiles, setAllBillingProfiles] = useState<MerchantBillingProfileRecord[]>([])
  const [serviceFormState, setServiceFormState] = useState<ServiceFormState>({})
  const [selectedServicePlanId, setSelectedServicePlanId] = useState('')
  const [servicePlanForm, setServicePlanForm] = useState<ServicePlanFormState>(() => planToFormState(null))
  const [selectedCatalogServiceId, setSelectedCatalogServiceId] = useState('')
  const [billableServiceForm, setBillableServiceForm] = useState<BillableServiceFormState>(() => serviceToFormState(null))
  const [selectedDeviceMappingCategory, setSelectedDeviceMappingCategory] = useState('pos_tablet')
  const [deviceMappingForm, setDeviceMappingForm] = useState<DeviceBillingMappingFormState>(() => mappingToFormState(null))
  const [quoteBillingMethod, setQuoteBillingMethod] = useState<BillingMethod>('card')
  // Station count is auto-derived from deployed POS tablet devices, never set by hand:
  // `quoteStationCount` mirrors `activeStationCount` so the preview matches what the
  // server actually bills. `null` means "still counting".
  const [quoteStationCount, setQuoteStationCount] = useState('1')
  const [activeStationCount, setActiveStationCount] = useState<number | null>(null)
  const [quote, setQuote] = useState<SubscriptionQuoteResult | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [status, setStatus] = useState<SubscriptionStatus>('active')
  const [currentPeriodStart, setCurrentPeriodStart] = useState(() => freshBillingCycle().start)
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(() => freshBillingCycle().end)
  const [nextBillingDate, setNextBillingDate] = useState(() => freshBillingCycle().nextBilling)
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
  const [pendingServiceRequests, setPendingServiceRequests] = useState<MerchantServiceRequestRecord[]>([])
  const [serviceRequestHistory, setServiceRequestHistory] = useState<MerchantServiceRequestRecord[]>([])
  const [hardwareDecisionNotes, setHardwareDecisionNotes] = useState<Record<string, string>>({})
  const [serviceDecisionNotes, setServiceDecisionNotes] = useState<Record<string, string>>({})
  const [selectedMerchantTierPlanId, setSelectedMerchantTierPlanId] = useState('')
  const [merchantTierSubscriptionStatus, setMerchantTierSubscriptionStatus] = useState<'active' | 'past_due' | 'suspended' | 'cancelled'>('active')
  const [merchantTierPeriodStart, setMerchantTierPeriodStart] = useState(startOfMonthIso())

  const saveBillingExemption = () => {
    startTransition(async () => {
      const result = await setMerchantBillingExemption({
        merchantId: merchant.id,
        enabled: billingExemptionRequested,
        reason: billingExemptionReason,
        expiresAt:
          billingExemptionRequested && billingExemptionExpiresAt
            ? new Date(billingExemptionExpiresAt).toISOString()
            : null,
      })
      if (!result.success || !result.exemption) {
        toast.error(result.error || 'Failed to update the billing exemption.')
        return
      }
      setBillingExemption(result.exemption)
      setBillingExemptionRequested(result.exemption.active)
      setBillingExemptionReason('')
      setBillingExemptionExpiresAt(result.exemption.expiresAt?.slice(0, 16) ?? '')
      toast.success(
        result.exemption.active
          ? 'Billing exemption enabled. Valor charging is paused.'
          : 'Billing exemption disabled. Normal billing will resume.',
      )
      refresh()
    })
  }

  const changeStep = (step: number) => {
    if (isPending || step < 0 || step >= SUBSCRIPTION_STEPS.length) return
    setCurrentStep(step)
    requestAnimationFrame(() => {
      stepHeadingRef.current?.focus({ preventScroll: true })
      stepHeadingRef.current?.scrollIntoView({ block: 'start' })
    })
  }

  const sortedLocations = useMemo(
    () => [...merchant.locations].sort((a, b) => a.name.localeCompare(b.name)),
    [merchant.locations]
  )

  const selectedLocation = useMemo(
    () => sortedLocations.find((location) => location.id === selectedLocationId) ?? sortedLocations[0] ?? null,
    [selectedLocationId, sortedLocations]
  )

  const selectedLocationSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.location_id === selectedLocation?.id && subscriptionBillingScope(subscription.metadata) === 'location') ?? null,
    [selectedLocation, subscriptions]
  )

  const selectedAssignments = useMemo(
    () => (selectedLocationSubscription ? subscriptionServiceMap[selectedLocationSubscription.id] ?? [] : []),
    [selectedLocationSubscription, subscriptionServiceMap]
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

  // Overview-mode derivations (read-only): location-scoped subscriptions, the
  // locations that still need one, and the merchant-level billing card.
  const locationSubscriptions = useMemo(
    () =>
      subscriptions
        .filter(
          (subscription) =>
            subscriptionBillingScope(subscription.metadata) === 'location' &&
            subscription.status !== 'canceled',
        )
        .sort((a, b) => (a.location_name || '').localeCompare(b.location_name || '')),
    [subscriptions],
  )

  const locationsWithoutSub = useMemo(() => {
    const withSub = new Set(locationSubscriptions.map((subscription) => subscription.location_id))
    return sortedLocations
      .filter((location) => !withSub.has(location.id))
      .map((location) => ({ id: location.id, name: location.name }))
  }, [locationSubscriptions, sortedLocations])

  const merchantCardProfile = useMemo(() => {
    const cards = allBillingProfiles.filter(
      (profile) => profile.billing_method === 'card' && profile.is_active,
    )
    return (
      cards.find((profile) => profile.location_id === null && profile.is_primary) ??
      cards.find((profile) => profile.is_primary) ??
      cards[0] ??
      null
    )
  }, [allBillingProfiles])

  const startEdit = (locationId?: string) => {
    if (locationId) {
      setSelectedLocationId(locationId)
      const locationsStep = SUBSCRIPTION_STEPS.findIndex((step) => step.id === 'locations')
      if (locationsStep >= 0) setCurrentStep(locationsStep)
    }
    setMode('edit')
  }

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
        const comped = Boolean(current.comped)
        const quantity = service.pricing_model === 'flat' ? 1 : parsePositiveInteger(current.quantity)
        const effectiveQuantity = current.enabled ? Math.max(service.pricing_model === 'flat' ? 1 : 0, quantity) : 0
        // Comped (HQ-granted free) services stay enabled but never bill.
        const subtotal = current.enabled && !comped ? calculateServiceSubtotal(service, effectiveQuantity) : 0

        return {
          service,
          enabled: current.enabled,
          comped,
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
        // Location subscriptions bill devices only (explicit per-device services) —
        // no base/per-station plan. Keep planId null so the preview matches the invoice.
        planId: null,
        stationCount: Math.max(0, parsePositiveInteger(quoteStationCount)),
        billingMethod: quoteBillingMethod,
        services: selectedServiceRows
          .filter((row) => row.enabled && row.quantity > 0 && !row.comped)
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
          billingProfiles,
          nextMerchantTierPlans,
          nextMerchantTierStatus,
          nextMerchantTierSubscription,
          nextPendingMerchantTierRequest,
          nextPendingHardwareRequests,
          nextPendingServiceRequests,
          nextServiceRequestHistory,
        ] = await Promise.all([
          getBillableServices(),
          getDeviceBillingServiceMappings(),
          getSubscriptionPlans(),
          getMerchantSubscriptions(merchant.id),
          getSubscriptionInvoices(merchant.id, null, 100),
          getMerchantBillingProfiles(merchant.id),
          getMerchantTierPlans(),
          getMerchantTierStatus(merchant.id),
          getMerchantTierSubscription(merchant.id),
          getPendingMerchantTierRequest(merchant.id),
          getPendingMerchantHardwareRequests(merchant.id),
          getPendingMerchantServiceRequests(merchant.id),
          getPendingMerchantServiceRequests(merchant.id, true),
        ])

        const assignmentEntries = await Promise.all(
          nextSubscriptions.map(async (subscription) => [
            subscription.id,
            await getSubscriptionServiceAssignments(subscription.id),
          ] as const)
        )

        const nextAssignmentMap = Object.fromEntries(assignmentEntries)
        const nextBillingProfilesByLocation = Object.fromEntries(
          sortedLocations.flatMap((location) => {
            const locationProfile = billingProfiles.find(
              (profile) =>
                profile.location_id === location.id &&
                profile.processor === 'valor' &&
                profile.billing_method === 'card' &&
                profile.is_primary &&
                profile.is_active,
            )
            const effectiveProfile = locationProfile
            return effectiveProfile ? [[location.id, effectiveProfile]] : []
          }),
        )

        setServices(nextServices)
        setDeviceBillingMappings(nextDeviceBillingMappings)
        setServicePlans(nextServicePlans)
        setSubscriptions(nextSubscriptions)
        setInvoices(nextInvoices)
        setSubscriptionServiceMap(nextAssignmentMap)
        setBillingProfilesByLocation(nextBillingProfilesByLocation)
        setAllBillingProfiles(billingProfiles)
        setMerchantTierPlans(nextMerchantTierPlans)
        setMerchantTierStatus(nextMerchantTierStatus)
        setMerchantTierSubscription(nextMerchantTierSubscription)
        setPendingMerchantTierRequest(nextPendingMerchantTierRequest)
        setPendingHardwareRequests(nextPendingHardwareRequests)
        setPendingServiceRequests(nextPendingServiceRequests)
        setServiceRequestHistory(nextServiceRequestHistory)

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
            const cycle = freshBillingCycle()
            setStatus('active')
            setCurrentPeriodStart(cycle.start)
            setCurrentPeriodEnd(cycle.end)
            setNextBillingDate(cycle.nextBilling)
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

    const cycle = freshBillingCycle()
    setStatus('active')
    setCurrentPeriodStart(cycle.start)
    setCurrentPeriodEnd(cycle.end)
    setNextBillingDate(cycle.nextBilling)
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

  // Stations = deployed POS tablets. Pull the live count for the selected location so
  // the preview reflects exactly what the server will bill (it recomputes station_count
  // from deployed devices on every save and invoice, ignoring any client value).
  useEffect(() => {
    const locationId = selectedLocation?.id
    if (!locationId) {
      setActiveStationCount(null)
      return
    }

    let cancelled = false
    setActiveStationCount(null)

    getActiveStationCount(locationId).then((result) => {
      if (cancelled) return
      const count = result.success
        ? result.count ?? 0
        : selectedLocationSubscription?.station_count ?? 0
      setActiveStationCount(count)
      setQuoteStationCount(String(count))
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation?.id])

  const updateServiceState = (serviceId: string, patch: Partial<{ enabled: boolean; quantity: string; comped: boolean }>) => {
    setServiceFormState((current) => ({
      ...current,
      [serviceId]: {
        enabled: patch.enabled ?? current[serviceId]?.enabled ?? false,
        quantity: patch.quantity ?? current[serviceId]?.quantity ?? '1',
        comped: patch.comped ?? current[serviceId]?.comped ?? false,
      },
    }))
  }

  const handleSave = (onSaved?: () => void) => {
    if (!selectedLocation) {
      toast.error('Select a location first.')
      return
    }

    const enabledServices = services
      .map((service) => ({
        serviceId: service.id,
        serviceCode: service.service_code,
        enabled: serviceFormState[service.id]?.enabled ?? false,
        comped: Boolean(serviceFormState[service.id]?.comped),
        quantity:
          service.pricing_model === 'flat'
            ? 1
            : Number(serviceFormState[service.id]?.quantity ?? 0),
      }))
      .filter((service) => service.enabled && service.quantity > 0)

    // "Save & Charge" on a lapsed subscription (past_due/suspended/canceled) is a
    // reactivation: target 'active' so the server actually generates + charges an
    // invoice. Passing the stale lapsed status through makes the server take its
    // non-active branch, which saves the config WITHOUT charging — yet the UI used
    // to still report "automatic payment approved". Only 'active'/'trial' pass
    // through unchanged (trials are intentionally not charged).
    const lapsedStatuses: SubscriptionStatus[] = ['past_due', 'suspended', 'canceled']
    const effectiveStatus: SubscriptionStatus =
      enabledServices.length > 0 && lapsedStatuses.includes(status) ? 'active' : status

    if (effectiveStatus !== 'canceled' && enabledServices.length === 0) {
      toast.error('Enable at least one billable service for this location.')
      return
    }

    startTransition(async () => {
      const subscriptionResult = await saveAndChargeMerchantSubscription({
        subscriptionId: selectedLocationSubscription?.id,
        merchantId: merchant.id,
        locationId: selectedLocation.id,
        // Location subscriptions are devices-only — no base/per-station plan attached
        // (the server also forces this for location scope).
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
        services: (effectiveStatus === 'canceled' ? [] : enabledServices).map((service) => ({
          serviceId: service.serviceId,
          quantity: service.quantity,
          enabled: true,
          metadata: {
            source: 'hq_subscriptions_workspace',
            serviceCode: service.serviceCode,
            // HQ-granted free feature: entitled but excluded from billing.
            ...(service.comped ? { comped: true } : {}),
          },
        })),
      })

      if (!subscriptionResult.success || !subscriptionResult.subscriptionId) {
        toast.error(subscriptionResult.error || 'Failed to save and charge subscription.')
        return
      }

      if (subscriptionResult.queuedForNextCycle) {
        toast.success(
          subscriptionResult.message ||
            'This period is already paid — the change is saved and bills on the next cycle. No charge was made today.'
        )
        refresh()
        onSaved?.()
        return
      }

      // Only claim "automatic payment approved" when the server actually ran and
      // approved a charge (it returns an invoiceId only on the active charge path).
      // Otherwise the save skipped billing (trial, exemption, or a no-charge edit)
      // and we must not imply money moved.
      const paymentApproved = Boolean(subscriptionResult.invoiceId)
      toast.success(
        effectiveStatus === 'canceled'
          ? 'Subscription canceled.'
          : billingExemption.active
            ? selectedLocationSubscription
              ? 'Complimentary services updated without a charge.'
              : 'Complimentary services activated without a charge.'
            : paymentApproved
              ? selectedLocationSubscription
                ? 'Subscription updated and automatic payment approved.'
                : 'Subscription created and automatic payment approved.'
              : 'Subscription saved. No payment was charged.'
      )

      refresh()
      onSaved?.()
    })
  }

  const handleGenerateInvoice = (subscriptionId: string) => {
    if (billingExemption.active) {
      toast.error('Disable the merchant billing exemption before generating an invoice.')
      return
    }
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
    if (billingExemption.active) {
      toast.error('This merchant is billing exempt. Existing invoices remain available for records but cannot be charged.')
      return
    }
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
        billingExemption.active
          ? 'Merchant tier updated under the billing exemption.'
          : result.charged
          ? 'Merchant tier updated and automatic payment approved.'
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

  const handleServiceRequestDecision = (
    request: MerchantServiceRequestRecord,
    decision: 'approved' | 'denied',
  ) => {
    startTransition(async () => {
      const result = await reviewMerchantServiceRequest({
        requestId: request.id,
        decision,
        decisionNote: serviceDecisionNotes[request.id]?.trim(),
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to review the add-on request.')
        return
      }
      toast.success(
        decision === 'approved'
          ? `Request ${request.request_number} charged and activated.`
          : `Request ${request.request_number} denied.`,
      )
      if (result.notificationWarning) toast.warning(result.notificationWarning)
      setServiceDecisionNotes((current) => {
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
          One merchant tier is charged to the merchant billing card. Each location&apos;s devices and add-ons use its own card and separate subscription.
        </p>
      </div>

      <div className="rounded-xl border border-amber-300/70 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-700 dark:text-amber-400" />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">Merchant billing exemption</h2>
                <Badge variant={billingExemption.active ? 'default' : 'secondary'}>
                  {billingExemption.active ? 'Active' : billingExemption.enabled ? 'Expired' : 'Off'}
                </Badge>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Waives SaaS card and payment enforcement for this merchant. Plans and location add-ons must still be assigned normally, and a manual merchant suspension still blocks POS access.
              </p>
              {billingExemption.active && billingExemption.reason ? (
                <p className="text-xs text-muted-foreground">
                  Reason: {billingExemption.reason}
                  {billingExemption.expiresAt
                    ? ` | Expires ${new Date(billingExemption.expiresAt).toLocaleString()}`
                    : ' | No automatic expiration'}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="merchant-billing-exempt">Exempt from billing</Label>
            <Switch
              id="merchant-billing-exempt"
              checked={billingExemptionRequested}
              onCheckedChange={setBillingExemptionRequested}
              disabled={isPending}
            />
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="billing-exemption-reason">Audit reason</Label>
            <Input
              id="billing-exemption-reason"
              value={billingExemptionReason}
              onChange={(event) => setBillingExemptionReason(event.target.value)}
              placeholder={billingExemptionRequested ? 'Internal, demo, partner, or complimentary account' : 'Why normal billing is being restored'}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="billing-exemption-expires">Optional expiration</Label>
            <Input
              id="billing-exemption-expires"
              type="datetime-local"
              value={billingExemptionExpiresAt}
              onChange={(event) => setBillingExemptionExpiresAt(event.target.value)}
              disabled={!billingExemptionRequested}
            />
          </div>
          <Button
            type="button"
            variant={billingExemptionRequested ? 'default' : 'outline'}
            onClick={saveBillingExemption}
            disabled={isPending || billingExemptionReason.trim().length < 5}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply
          </Button>
        </div>
      </div>

      <SubscriptionCutoverReview key={merchant.id} merchantId={merchant.id} merchantRouteId={merchant.clerk_org_id || merchant.id} onPrepared={refresh} />

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

      {mode === 'overview' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Read-only overview. Use{' '}
              <span className="font-medium text-foreground">Edit billing</span> to change the tier,
              location add-ons, or run a charge.
            </p>
            <Button onClick={() => startEdit()}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit billing
            </Button>
          </div>

          <MerchantBillingSection
            tierStatus={merchantTierStatus}
            tierSubscription={merchantTierSubscription}
            cardProfile={merchantCardProfile}
          />

          {locationSubscriptions.length > 0 && (
            <LocationBillingList
              subscriptions={locationSubscriptions}
              assignmentsBySubscription={subscriptionServiceMap}
              billingProfilesByLocation={billingProfilesByLocation}
            />
          )}

          <LocationsWithoutSubscription locations={locationsWithoutSub} onSetup={startEdit} />

          <ReviewChangesSection
            pendingTierRequest={pendingMerchantTierRequest}
            onApproveTier={() =>
              pendingMerchantTierRequest &&
              handleSaveMerchantTier(
                pendingMerchantTierRequest.requested_plan_id,
                'active',
                pendingMerchantTierRequest.id,
              )
            }
            onDenyTier={handleDenyMerchantTierRequest}
            tierNote={merchantTierDecisionNote}
            onTierNoteChange={setMerchantTierDecisionNote}
            pendingServiceRequests={pendingServiceRequests}
            onServiceDecision={handleServiceRequestDecision}
            serviceNotes={serviceDecisionNotes}
            onServiceNoteChange={(id, value) =>
              setServiceDecisionNotes((current) => ({ ...current, [id]: value }))
            }
            pendingHardwareRequests={pendingHardwareRequests}
            onHardwareDecision={handleHardwareRequestDecision}
            hardwareNotes={hardwareDecisionNotes}
            onHardwareNoteChange={(id, value) =>
              setHardwareDecisionNotes((current) => ({ ...current, [id]: value }))
            }
            isBusy={isPending}
          />

          <BillingInsightsSection
            invoices={invoices}
            locations={sortedLocations.map((location) => ({ id: location.id, name: location.name }))}
            invoiceActionId={invoiceActionId}
            isBusy={isPending}
            onPreview={handlePreviewInvoice}
            onDownload={handleDownloadInvoice}
            onCharge={handleChargeInvoice}
          />
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => setMode('overview')}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back to overview
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/manage/settings/billing-catalog">Manage global pricing</Link>
            </Button>
          </div>

          {/* Display-only progress stepper (completed steps clickable) */}
          <ol aria-label="Subscription setup progress" className="grid grid-cols-3 gap-3">
            {SUBSCRIPTION_STEPS.map((step, index) => {
              const isCurrent = index === currentStep
              const isDone = index < currentStep
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    disabled={index > currentStep || isPending}
                    onClick={() => {
                      if (index <= currentStep) changeStep(index)
                    }}
                    className={`flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-sm transition-colors ${
                      isCurrent
                        ? 'border-primary/40 bg-primary/5 text-primary'
                        : isDone
                          ? 'border-transparent text-foreground hover:bg-muted'
                          : 'border-transparent text-muted-foreground'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        isCurrent || isDone ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 truncate font-medium">{step.title}</span>
                  </button>
                </li>
              )
            })}
          </ol>

          {/* Two-column: content + sticky summary */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-5">
              <div className="space-y-1">
                <h2
                  id="subscription-step-heading"
                  ref={stepHeadingRef}
                  tabIndex={-1}
                  className="scroll-mt-24 text-xl font-semibold focus:outline-none"
                >
                  {activeStep.title}
                </h2>
                <p className="text-sm text-muted-foreground">{activeStep.description}</p>
              </div>

              {/* Screen 1 — Confirm the plan */}
              {activeStep.id === 'tier' && (
                <Card>
                  <CardContent className="space-y-4 pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-muted/40 p-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold">
                            {merchantTierStatus.plan?.name || 'No tier assigned'}
                          </span>
                          <Badge variant={merchantTierStatusVariant(merchantTierStatus.subscription_status)}>
                            {merchantTierStatus.subscription_status || 'unassigned'}
                          </Badge>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {merchantTierStatus.plan?.max_locations == null || !merchantTierStatus.plan
                            ? `${merchantTierStatus.active_location_count} active locations`
                            : `${merchantTierStatus.active_location_count} of ${merchantTierStatus.plan.max_locations} locations`}
                          {merchantTierStatus.is_over_limit && (
                            <span className="ml-2 font-medium text-destructive">Over limit</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-semibold">
                          {merchantTierStatus.plan
                            ? merchantTierStatus.plan.monthly_price_cents > 0
                              ? formatTierPrice(merchantTierStatus.plan.monthly_price_cents)
                              : 'Free'
                            : '—'}
                        </div>
                        {merchantTierStatus.current_period_end && (
                          <div className="text-xs text-muted-foreground">
                            Renews {formatDate(merchantTierStatus.current_period_end)}
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      The merchant-wide fee is set automatically by active locations. Locations pay separately
                      for their stations, devices, and features. Usually you can just continue.
                    </p>

                    {merchantTierStatus.is_over_limit && recommendedMerchantTier && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        Recommended tier by location count:{' '}
                        <span className="font-medium">{recommendedMerchantTier.display_name}</span>.
                      </div>
                    )}

                    <details className="rounded-xl border p-3">
                      <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-foreground">
                        Advanced — change plan
                      </summary>
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {merchantTierPlans.map((plan) => {
                            const isSelected = selectedMerchantTierPlanId === plan.id
                            return (
                              <button
                                key={plan.id}
                                type="button"
                                onClick={() => setSelectedMerchantTierPlanId(plan.id)}
                                className={`flex flex-col rounded-xl border p-4 text-left transition-colors ${
                                  isSelected
                                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                                    : 'hover:border-primary/40'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{plan.display_name}</span>
                                  {isSelected && <Badge>Selected</Badge>}
                                </div>
                                <span className="mt-1 text-lg font-semibold">
                                  {formatTierPrice(plan.monthly_price_cents)}
                                </span>
                                <span className="mt-1 text-xs text-muted-foreground">
                                  {formatMerchantTierBillingUnit(plan)}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
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
                          <div className="space-y-2">
                            <Label>Current Period Start</Label>
                            <Input
                              type="date"
                              value={merchantTierPeriodStart}
                              onChange={(event) => setMerchantTierPeriodStart(event.target.value)}
                            />
                          </div>
                        </div>
                        <Button
                          onClick={() => handleSaveMerchantTier()}
                          disabled={isPending || !selectedMerchantTierPlanId}
                        >
                          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {merchantTierSubscriptionStatus === 'active'
                            ? billingExemption.active
                              ? 'Update complimentary tier'
                              : 'Update tier & charge'
                            : 'Update tier'}
                        </Button>
                      </div>
                    </details>
                  </CardContent>
                </Card>
              )}

              {/* Screen 2 — Set up the location */}
              {activeStep.id === 'locations' && (
                <Card>
                  <CardContent className="space-y-5 pt-6">
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
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
                      <p className="text-xs text-muted-foreground">
                        {selectedLocationSubscription
                          ? `Current: ${selectedLocationSubscription.status} · ${formatMoney(selectedLocationSubscription.monthly_amount)}/mo`
                          : 'No subscription yet for this location.'}
                        {selectedBillingProfile ? ' · Card ready' : ' · No card on file'}
                      </p>
                    </div>

                    {/* Features */}
                    <div className="rounded-xl border p-4">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        Features
                        <InfoHint label="Optional software add-ons this location uses (loyalty, online ordering, …). Each is billed monthly to the location card." />
                      </div>
                      <div className="mt-3 space-y-2">
                        {selectedServiceRows.filter((row) => row.service.service_category !== 'hardware').length === 0 ? (
                          <p className="text-xs text-muted-foreground">No features available. Add them in the billing catalog.</p>
                        ) : (
                          selectedServiceRows
                            .filter((row) => row.service.service_category !== 'hardware')
                            .map(({ service, enabled, comped, subtotal }) => (
                              <div key={service.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                                <label className="flex min-w-0 items-start gap-2.5">
                                  <Checkbox
                                    checked={enabled}
                                    onCheckedChange={(checked) => updateServiceState(service.id, { enabled: Boolean(checked) })}
                                    className="mt-0.5"
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium">{service.display_name}</span>
                                    <span className="block text-xs text-muted-foreground">{summarizePricing(service)}</span>
                                  </span>
                                </label>
                                <div className="flex items-center gap-2">
                                  {service.pricing_model !== 'flat' && enabled && !comped ? (
                                    <div className="flex items-center gap-1">
                                      <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateServiceState(service.id, { quantity: String(Math.max(0, parsePositiveInteger(serviceFormState[service.id]?.quantity) - 1)) })}>−</Button>
                                      <Input inputMode="numeric" className="h-7 w-12 text-center" value={serviceFormState[service.id]?.quantity ?? '1'} onChange={(event) => updateServiceState(service.id, { quantity: event.target.value })} />
                                      <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateServiceState(service.id, { quantity: String(parsePositiveInteger(serviceFormState[service.id]?.quantity) + 1) })}>+</Button>
                                    </div>
                                  ) : null}
                                  {enabled ? (
                                    <Button
                                      type="button"
                                      variant={comped ? 'default' : 'outline'}
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      title="Grant this feature for free (entitled, not billed)"
                                      onClick={() => updateServiceState(service.id, { comped: !comped })}
                                    >
                                      Free
                                    </Button>
                                  ) : null}
                                  <span className="w-16 text-right text-sm font-medium">{enabled ? (comped ? 'Free' : formatMoney(subtotal)) : '—'}</span>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>

                    {/* Devices */}
                    <div className="rounded-xl border p-4">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        Devices
                        <InfoHint label="Hardware-linked charges. These sync from the location's deployed devices." />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Synced from deployed devices.</p>

                      {/* Deployed-device count, for reference only. Devices are billed
                          per-device via the explicit hardware services below — there is no
                          automatic per-station charge. */}
                      <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-dashed bg-muted/30 p-2.5 text-xs text-muted-foreground">
                        <span className="min-w-0">
                          {activeStationCount === null
                            ? 'Counting deployed POS tablets…'
                            : `${activeStationCount} POS tablet${activeStationCount === 1 ? '' : 's'} deployed. Add per-device charges below — nothing is billed automatically.`}
                        </span>
                        <InfoHint label="Deployed device count, for reference only. Device charges are set explicitly below (e.g. POS Tablet, KDS); there is no automatic base or per-station charge." />
                      </div>

                      <div className="mt-3 space-y-2">
                        {selectedServiceRows.filter((row) => row.service.service_category === 'hardware').length === 0 ? (
                          <p className="text-xs text-muted-foreground">No additional device charges.</p>
                        ) : (
                          selectedServiceRows
                            .filter((row) => row.service.service_category === 'hardware')
                            .map(({ service, enabled, comped, subtotal }) => (
                              <div key={service.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                                <label className="flex min-w-0 items-start gap-2.5">
                                  <Checkbox
                                    checked={enabled}
                                    onCheckedChange={(checked) => updateServiceState(service.id, { enabled: Boolean(checked) })}
                                    className="mt-0.5"
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium">{service.display_name}</span>
                                    <span className="block text-xs text-muted-foreground">{summarizePricing(service)}</span>
                                  </span>
                                </label>
                                <div className="flex items-center gap-2">
                                  {service.pricing_model !== 'flat' && enabled && !comped ? (
                                    <div className="flex items-center gap-1">
                                      <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateServiceState(service.id, { quantity: String(Math.max(0, parsePositiveInteger(serviceFormState[service.id]?.quantity) - 1)) })}>−</Button>
                                      <Input inputMode="numeric" className="h-7 w-12 text-center" value={serviceFormState[service.id]?.quantity ?? '1'} onChange={(event) => updateServiceState(service.id, { quantity: event.target.value })} />
                                      <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateServiceState(service.id, { quantity: String(parsePositiveInteger(serviceFormState[service.id]?.quantity) + 1) })}>+</Button>
                                    </div>
                                  ) : null}
                                  {enabled ? (
                                    <Button
                                      type="button"
                                      variant={comped ? 'default' : 'outline'}
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      title="Grant this feature for free (entitled, not billed)"
                                      onClick={() => updateServiceState(service.id, { comped: !comped })}
                                    >
                                      Free
                                    </Button>
                                  ) : null}
                                  <span className="w-16 text-right text-sm font-medium">{enabled ? (comped ? 'Free' : formatMoney(subtotal)) : '—'}</span>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>

                    {/* Advanced */}
                    <details className="rounded-xl border p-3">
                      <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-foreground">
                        Advanced — status, periods &amp; grace
                      </summary>
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3">
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
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] sm:items-end">
                          <div className="space-y-2">
                            <Label htmlFor="edit-grace-until">Grace period until</Label>
                            <Input id="edit-grace-until" type="datetime-local" value={gracePeriodEndsAt} onChange={(event) => setGracePeriodEndsAt(event.target.value)} disabled={!selectedLocationSubscription} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-grace-reason">Reason</Label>
                            <Input id="edit-grace-reason" value={graceReason} onChange={(event) => setGraceReason(event.target.value)} placeholder="Approved extension or billing exception" disabled={!selectedLocationSubscription} />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" onClick={() => saveGracePeriod(false)} disabled={isPending || !selectedLocationSubscription || !gracePeriodEndsAt}>
                              Extend grace
                            </Button>
                            {selectedLocationSubscription?.grace_period_ends_at ? (
                              <Button type="button" variant="ghost" onClick={() => saveGracePeriod(true)} disabled={isPending}>
                                Clear
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </details>
                  </CardContent>
                </Card>
              )}

              {/* Screen 3 — Review & charge */}
              {activeStep.id === 'review' && (
                <div className="space-y-5">
                  <Card>
                    <CardContent className="space-y-4 pt-6">
                      {!selectedBillingProfile && status === 'active' && !billingExemption.active && (
                        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:flex-row sm:items-start sm:justify-between">
                          <span className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                              No card on file for {selectedLocation?.name ?? 'this location'}. Add one before charging.
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 sm:pl-2">
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 bg-amber-600 text-white hover:bg-amber-700"
                              asChild
                            >
                              <Link
                                href={`/manage/merchants/${merchant.id}/billing${selectedLocation ? `?billingScope=${selectedLocation.id}` : ''}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <CreditCard className="mr-1.5 h-4 w-4" />
                                Add a card
                                <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
                              </Link>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 text-amber-800 hover:bg-amber-100 hover:text-amber-900"
                              onClick={() => refresh()}
                              disabled={isPending}
                            >
                              <RefreshCcw className={`mr-1.5 h-4 w-4${isPending ? ' animate-spin' : ''}`} />
                              Refresh
                            </Button>
                          </span>
                        </div>
                      )}
                      {billingExemption.active && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                          This merchant is billing exempt. Services activate without an invoice or charge.
                        </div>
                      )}
                      <div className="overflow-hidden rounded-xl border">
                        <table className="w-full text-sm">
                          <tbody>
                            {(quote?.line_items ?? []).map((item, index) => (
                              <tr key={index} className="border-b last:border-0">
                                <td className="px-3 py-2 text-muted-foreground">
                                  {readQuoteLineString(item, ['description', 'label', 'name'], 'Item')}
                                </td>
                                <td className="px-3 py-2 text-right font-medium">
                                  {formatMoney(readQuoteLineNumber(item, ['amount', 'total', 'line_total', 'subtotal']))}
                                </td>
                              </tr>
                            ))}
                            <tr className="border-b">
                              <td className="px-3 py-2 text-muted-foreground">Subtotal</td>
                              <td className="px-3 py-2 text-right">{formatMoney(quote?.subtotal ?? 0)}</td>
                            </tr>
                            <tr className="border-b">
                              <td className="px-3 py-2 text-muted-foreground">Card surcharge</td>
                              <td className="px-3 py-2 text-right">{formatMoney(quote?.card_surcharge ?? 0)}</td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 font-semibold">Total</td>
                              <td className="px-3 py-2 text-right text-base font-semibold">{formatMoney(quote?.total_amount ?? 0)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      {billingExemption.active ? (
                        <p className="text-sm text-muted-foreground">
                          No charge is made while the exemption is active. Services are saved and
                          activated immediately.
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          We&apos;ll charge{' '}
                          <span className="font-medium text-foreground">{buildPaymentMethodLabel(selectedBillingProfile)}</span>{' '}
                          {formatMoney(quote?.total_amount ?? 0)} today for the first month, then the same amount
                          every month starting{' '}
                          <span className="font-medium text-foreground">{formatDate(nextBillingDate)}</span> (one month
                          from today).
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <BillingHistorySection
                    invoices={filteredInvoices}
                    invoiceActionId={invoiceActionId}
                    isBusy={isPending}
                    onPreview={handlePreviewInvoice}
                    onDownload={handleDownloadInvoice}
                    onCharge={handleChargeInvoice}
                    limit={3}
                  />
                </div>
              )}
            </div>

            {/* Sticky summary */}
            <div>
              <SubscriptionEditSummary
                tierName={merchantTierStatus.plan?.name || 'No tier'}
                tierPriceLabel={
                  merchantTierStatus.plan
                    ? merchantTierStatus.plan.monthly_price_cents > 0
                      ? formatTierPrice(merchantTierStatus.plan.monthly_price_cents)
                      : 'Free'
                    : '—'
                }
                locationName={selectedLocation?.name ?? null}
                quote={quote}
                isQuoteLoading={isQuoteLoading}
                cardLabel={buildPaymentMethodLabel(selectedBillingProfile)}
                nextBillingDateLabel={formatDate(nextBillingDate)}
              />
            </div>
          </div>

          {/* Single sticky action bar — the only navigation */}
          <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            {currentStep > 0 ? (
              <Button variant="outline" onClick={() => changeStep(currentStep - 1)} disabled={isPending}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            ) : (
              <span />
            )}
            {activeStep.id !== 'review' ? (
              <Button onClick={() => changeStep(currentStep + 1)} disabled={isPending}>
                Continue
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => handleSave(() => setMode('overview'))}
                disabled={
                  isPending ||
                  !selectedLocation ||
                  (status === 'active' && !selectedBillingProfile && !billingExemption.active)
                }
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {billingExemption.active
                  ? 'Save complimentary services'
                  : `Save & charge ${formatMoney(quote?.total_amount ?? 0)}`}
              </Button>
            )}
          </div>
        </div>
      )}

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
