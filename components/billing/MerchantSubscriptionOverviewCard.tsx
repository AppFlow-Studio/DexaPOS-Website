'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { subscriptionBillingScope } from '@/supabase/functions/_shared/subscription-billing-scope'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Building2,
  Check,
  CreditCard,
  Download,
  Eye,
  Loader2,
  MoreHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Empty } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader, PageShell, Panel, PanelSection } from '@/components/dashboard/shell'
import {
  getMerchantSubscriptionInvoiceDocument,
  RequestMerchantTierPlan,
  RequestMerchantServiceAddOn,
  RequestSubscriptionHardware,
  type MerchantBillingLocationViewRecord,
  type MerchantPlanStatusView,
  type MerchantProvisionedDeviceViewRecord,
  type MerchantSubscriptionBillingProfileViewRecord,
  type MerchantSubscriptionInvoiceViewRecord,
  type MerchantTierPlanViewRecord,
  type MerchantBillableServiceViewRecord,
  type MerchantPendingHardwareRequestViewRecord,
  type MerchantPendingServiceRequestViewRecord,
  type MerchantServiceAssignmentViewRecord,
} from '@/app/dashboard/actions/subscription-billing'
import {
  useMerchantSubscriptionOverview,
  useMerchantTierPlans,
} from '@/lib/queries/use-dashboard-subscription-billing'
import {
  renderSubscriptionInvoiceHtml,
  type SubscriptionInvoiceDocumentData,
} from '@/lib/subscription-billing/invoice-template'
import { downloadSubscriptionInvoicePdf } from '@/lib/subscription-billing/invoice-pdf'
import { formatBillingCard } from '@/lib/subscription-billing/card-display'
import { cn } from '@/lib/utils'
import {
  describeTierPricing,
  monthlyTierCharge,
  planFitLabel,
  planFitsLocationCount,
} from '@/lib/subscription-billing/tier-pricing'
import {
  describePaymentFailure,
  estimateNextCharge,
  groupInvoicesByMonth,
  serviceSubtotal,
  cardFee,
  UNPAID_INVOICE_STATUSES,
} from '@/lib/subscription-billing/merchant-billing-statement'
import { cn } from '@/lib/utils'
import { invoiceStatusLabel } from '@/lib/constants/subscription-status'
import {
  getMerchantTierFallbackName,
  getMerchantTierPresentation,
} from '@/lib/subscription-billing/merchant-tier-presentation'

interface MerchantSubscriptionOverviewCardProps {
  merchantName: string
  /**
   * Which part of the page to open on. Comes from `?section=` so the billing
   * emails (and the public invoice page) can deep-link straight to the
   * payments — they used to point at `/dashboard/subscriptions/billing`, which
   * is now a redirect onto `?section=billing`.
   */
  initialSection?: SubscriptionSection
}

/**
 * Deep-link targets. The page is one scroll — no tabs — so a section is an
 * anchor to scroll to, not a panel to switch to. The names are kept from the
 * tabbed version because live emails carry `?section=billing`.
 */
export type SubscriptionSection = 'overview' | 'locations' | 'billing'

const SECTION_ANCHORS: Record<SubscriptionSection, string | null> = {
  overview: null,
  locations: 'subscription-locations',
  billing: 'subscription-payments',
}

type InvoiceFilter = 'all' | 'unpaid' | 'paid'

/** Invoices shown per month before "Show N more". */
const INVOICES_PER_MONTH = 3

const SUPPORT_HREF = '/dashboard/support/new?category=billing'

/** `DS-CTL-01` pill control, as a literal so Tailwind generates it (C7). */
const PILL = 'h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm'

const EMPTY_PLAN_STATUS: MerchantPlanStatusView = {
  plan: null,
  active_location_count: 0,
  is_over_limit: false,
  required_plan_code: null,
  subscription_status: null,
  current_period_end: null,
}
// Stable identities: an inline `?? []` allocates a fresh array on every render,
// which makes every `useMemo` that depends on it recompute every time.
const EMPTY_LOCATIONS: MerchantBillingLocationViewRecord[] = []
const EMPTY_DEVICES_BY_LOCATION: Record<string, MerchantProvisionedDeviceViewRecord[]> = {}
const EMPTY_INVOICES: MerchantSubscriptionInvoiceViewRecord[] = []
const EMPTY_BILLING_PROFILES: Record<string, MerchantSubscriptionBillingProfileViewRecord> = {}
const EMPTY_TIER_PLANS: MerchantTierPlanViewRecord[] = []
const EMPTY_SERVICES: MerchantBillableServiceViewRecord[] = []
const EMPTY_ASSIGNMENTS: MerchantServiceAssignmentViewRecord[] = []
const EMPTY_SERVICE_REQUESTS: MerchantPendingServiceRequestViewRecord[] = []
const EMPTY_HARDWARE_REQUESTS: MerchantPendingHardwareRequestViewRecord[] = []

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'

  // A bare `YYYY-MM-DD` parses as UTC midnight — the previous day west of
  // Greenwich. Anchor date-only values to local noon instead.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Whether a date (or `YYYY-MM-DD`) falls before today, in local time. */
function isPastDate(value: string): boolean {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0]
  if (!day) return false
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return day < todayKey
}

function formatLocationAddress(location: MerchantBillingLocationViewRecord): string {
  return [location.address_line1, location.city, location.state, location.postal_code]
    .filter(Boolean)
    .join(', ') || 'Address not set'
}

function formatCity(location: MerchantBillingLocationViewRecord): string {
  return [location.city, location.state].filter(Boolean).join(', ')
}

/**
 * Flat, uncoloured status badge — no per-status tint or dot (`DS-CTL-09`).
 *
 * Urgency is carried by the alert banners at the top instead, which the
 * design system does allow to take a tint. A failed invoice therefore reads
 * as urgent at the top of the page rather than by turning its row red.
 */
function StatusBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  )
}

const CARD_BRAND_NAMES: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  mc: 'Mastercard',
  amex: 'Amex',
  americanexpress: 'Amex',
  discover: 'Discover',
  diners: 'Diners Club',
  dinersclub: 'Diners Club',
  jcb: 'JCB',
}

/** "Visa •• 1111" — the card as the owner recognises it. */
function cardLabel(profile: MerchantSubscriptionBillingProfileViewRecord | null): string {
  if (!profile) return 'No card'

  if (profile.billing_method === 'card') {
    return formatBillingCard(profile).label
  }

  const bank = profile.bank_name || 'Bank account'
  return profile.account_number_last_four ? `${bank} •• ${profile.account_number_last_four}` : bank
}

function cardExpiry(profile: MerchantSubscriptionBillingProfileViewRecord | null): string | null {
  if (profile?.billing_method !== 'card' || !profile.card_exp_month || !profile.card_exp_year) return null
  return `Expires ${String(profile.card_exp_month).padStart(2, '0')}/${profile.card_exp_year}`
}

function formatTierBillingUnit(plan: MerchantTierPlanViewRecord): string {
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

/** What an add-on will cost this location per month, card fee included. */
function addOnMonthlyAmount(service: MerchantBillableServiceViewRecord, quantity: number): number {
  const subtotal = serviceSubtotal(service, quantity)
  return subtotal + cardFee(subtotal, service.card_surcharge_pct, 'card')
}

function merchantTierHighlights(plan: MerchantTierPlanViewRecord): string[] {
  return getMerchantTierPresentation(plan.plan_code)?.highlights ?? [
    'Merchant-wide plan',
    'Flat monthly structure',
    'Contact Dexa for activation',
  ]
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * A tinted alert at the top of the page.
 *
 * `DS-CTL-09` bars colour from *status display* — a badge, a row, a label
 * describing what a record is. It explicitly permits a tinted banner, which is
 * what this is: not a description of state, but a call to act on one.
 */
function AttentionBanner({
  tone,
  title,
  body,
  action,
}: {
  tone: 'critical' | 'warning'
  title: React.ReactNode
  body: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      role={tone === 'critical' ? 'alert' : undefined}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-2xl px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between',
        tone === 'critical' && 'bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-100',
        tone === 'warning' && 'bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-sm opacity-85">{body}</div>
        </div>
      </div>
      {action ? <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  )
}

/** A label/value pair. */
function Field({ label, value, meta }: { label: string; value: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
      {meta ? <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div> : null}
    </div>
  )
}

/** One line of the "What makes it up" breakdown. */
function BreakdownRow({
  label,
  meta,
  amount,
  emphasis = false,
}: {
  label: string
  meta?: React.ReactNode
  amount: string
  emphasis?: boolean
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-baseline justify-between gap-4 rounded-xl px-3 py-2.5',
        emphasis && 'mt-2 bg-muted/60 py-3',
      )}
    >
      <div className="min-w-0">
        <div className={cn('text-sm', emphasis && 'font-semibold')}>{label}</div>
        {meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      <div className={cn('shrink-0 tabular-nums', emphasis ? 'text-base font-semibold' : 'text-sm font-medium')}>
        {amount}
      </div>
    </div>
  )
}

/**
 * Submitted → DEXA review → Active. Every open request is waiting on DEXA, so
 * the second step is always the current one. Neutral marks only: filled for
 * reached, hollow for not yet (`DS-CTL-09`).
 */
function RequestTracker({ finalStep }: { finalStep: string }) {
  const steps = ['Submitted', 'DEXA review', finalStep]
  const current = 1

  return (
    <ol aria-label="Request progress" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={index === current ? 'step' : undefined}
          className={cn(
            'flex items-center gap-1.5',
            index === current ? 'font-semibold text-foreground' : 'text-muted-foreground',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              index <= current ? 'bg-foreground' : 'ring-1 ring-inset ring-muted-foreground',
            )}
          />
          {step}
        </li>
      ))}
    </ol>
  )
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-2xl" />
      ))}
    </div>
  )
}

export function MerchantSubscriptionOverviewCard({
  merchantName,
  initialSection = 'overview',
}: MerchantSubscriptionOverviewCardProps) {
  const overviewQuery = useMerchantSubscriptionOverview()
  const merchantTierPlansQuery = useMerchantTierPlans()

  const [invoicePreviewDocument, setInvoicePreviewDocument] = useState<SubscriptionInvoiceDocumentData | null>(null)
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false)
  const [isInvoicePreviewLoading, setIsInvoicePreviewLoading] = useState(false)
  const [invoiceActionId, setInvoiceActionId] = useState<string | null>(null)
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('all')
  const [expandedMonths, setExpandedMonths] = useState<string[]>([])

  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false)
  const [selectedRequestedPlanId, setSelectedRequestedPlanId] = useState('')
  const [hasAcceptedPlanAuthorization, setHasAcceptedPlanAuthorization] = useState(false)
  const [isSubmittingPlanRequest, setIsSubmittingPlanRequest] = useState(false)

  const [manageLocationId, setManageLocationId] = useState<string | null>(null)

  const [hardwareDialogLocationId, setHardwareDialogLocationId] = useState<string | null>(null)
  const [isSubmittingHardwareRequest, setIsSubmittingHardwareRequest] = useState(false)
  const [hardwareRequestQuantity, setHardwareRequestQuantity] = useState('1')
  const [hardwareRequestNote, setHardwareRequestNote] = useState('')

  const [addOnDialog, setAddOnDialog] = useState<{
    locationId: string
    service: MerchantBillableServiceViewRecord
  } | null>(null)
  const [addOnQuantity, setAddOnQuantity] = useState('1')
  const [hasAcceptedAddOnAuthorization, setHasAcceptedAddOnAuthorization] = useState(false)
  const [isSubmittingAddOnRequest, setIsSubmittingAddOnRequest] = useState(false)

  const hasScrolledToSection = useRef(false)
  const isLoading = overviewQuery.isLoading
  const merchantPlanStatus = overviewQuery.data?.merchantPlanStatus ?? EMPTY_PLAN_STATUS
  const pendingTierRequest = overviewQuery.data?.pendingTierRequest ?? null
  const pendingHardwareRequests =
    overviewQuery.data?.pendingHardwareRequests ?? EMPTY_HARDWARE_REQUESTS
  const availableServices = overviewQuery.data?.availableServices ?? EMPTY_SERVICES
  const serviceAssignments = overviewQuery.data?.serviceAssignments ?? EMPTY_ASSIGNMENTS
  const pendingServiceRequests =
    overviewQuery.data?.pendingServiceRequests ?? EMPTY_SERVICE_REQUESTS
  const locations = overviewQuery.data?.locations ?? EMPTY_LOCATIONS
  const merchantTierPlans = useMemo(
    () =>
      merchantTierPlansQuery.data ??
      overviewQuery.data?.merchantTierPlans ??
      EMPTY_TIER_PLANS,
    [merchantTierPlansQuery.data, overviewQuery.data?.merchantTierPlans],
  )
  const devicesByLocationId = overviewQuery.data?.devicesByLocationId ?? EMPTY_DEVICES_BY_LOCATION
  const invoices = overviewQuery.data?.invoices ?? EMPTY_INVOICES
  const billingProfilesByLocationId =
    overviewQuery.data?.billingProfilesByLocationId ?? EMPTY_BILLING_PROFILES
  const primaryBillingProfile = overviewQuery.data?.primaryBillingProfile ?? null
  const nextBillingDate =
    overviewQuery.data?.tierNextBillingDate ?? merchantPlanStatus.current_period_end

  const billingScopeHref = (scope: string | null) =>
    `/dashboard/settings/billing?billingScope=${encodeURIComponent(scope || '__merchant_wide__')}`
  const planCardHref = billingScopeHref(primaryBillingProfile?.location_id ?? null)

  const invoicePreviewHtml = useMemo(
    () => (invoicePreviewDocument ? renderSubscriptionInvoiceHtml(invoicePreviewDocument) : ''),
    [invoicePreviewDocument],
  )

  const servicesById = useMemo(() => {
    const map: Record<string, MerchantBillableServiceViewRecord> = {}
    availableServices.forEach((service) => {
      map[service.id] = service
    })
    return map
  }, [availableServices])

  const locationsById = useMemo(() => {
    const map: Record<string, MerchantBillingLocationViewRecord> = {}
    locations.forEach((location) => {
      map[location.id] = location
    })
    return map
  }, [locations])

  // `monthly_price_cents` is 0 for every merchant tier since the 2026-09-10
  // pricing change — the charge is per-location overage. The plan status RPC
  // does not return those columns, so match the catalogue row by plan code.
  const tierPlan = useMemo(
    () => merchantTierPlans.find((plan) => plan.plan_code === merchantPlanStatus.plan?.code) ?? null,
    [merchantPlanStatus.plan?.code, merchantTierPlans],
  )
  const tierCharge = useMemo(
    () => monthlyTierCharge(tierPlan, merchantPlanStatus.active_location_count),
    [merchantPlanStatus.active_location_count, tierPlan],
  )

  /** What the merchant will be charged next cycle, card fee included. */
  const nextCharge = useMemo(
    () =>
      estimateNextCharge({
        tierSubtotal: tierCharge.total,
        tierSurchargePct: tierPlan?.card_surcharge_pct ?? 0,
        tierBillingMethod: primaryBillingProfile?.billing_method ?? 'card',
        assignments: serviceAssignments,
        servicesById,
        locationBillingMethod: (locationId) =>
          billingProfilesByLocationId[locationId]?.billing_method ?? 'card',
      }),
    [billingProfilesByLocationId, primaryBillingProfile?.billing_method, serviceAssignments, servicesById, tierCharge.total, tierPlan?.card_surcharge_pct],
  )

  /**
   * Whether the plan's price is in the catalogue at all. A tier with no
   * catalogue row is sold by agreement; rendering a confident "$0.00" would
   * tell the owner they owe nothing, directly above failed invoices for real
   * money. The free single-location tier *is* in the catalogue, so its $0.00
   * is true and shown.
   */
  const pricingKnown = Boolean(tierPlan) || nextCharge.addOnSubtotal > 0

  const failedInvoices = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status === 'failed')
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [invoices],
  )

  /**
   * One overdue banner for every failed payment, not one banner each.
   *
   * The previous page stacked a pink banner per failed invoice, each with its
   * own "Update card" — six on one screen for five failures — and printed the
   * raw processor error in every one.
   */
  const overdue = useMemo(() => {
    if (failedInvoices.length === 0) return null

    const reasons = failedInvoices.map((invoice) => describePaymentFailure(invoice.last_payment_error))
    const distinctMessages = [...new Set(reasons.map((reason) => reason.message))]
    // Retrying with a different card cannot fix a problem on our side, so
    // "Update card" is not offered as the fix when that is the only cause.
    const processorOnly = reasons.every((reason) => reason.kind === 'processor')

    // Which card to fix: the plan card for tier invoices, the location's card
    // for location invoices. Only deep-link a scope when it is unambiguous.
    const scopes = new Set(
      failedInvoices.map((invoice) =>
        subscriptionBillingScope(invoice.metadata) === 'merchant_tier'
          ? primaryBillingProfile?.location_id ?? null
          : invoice.location_id,
      ),
    )
    const [onlyScope] = [...scopes]
    const updateCardHref = scopes.size === 1 ? billingScopeHref(onlyScope) : '/dashboard/settings/billing'

    const nextRetry = failedInvoices
      .map((invoice) => invoice.next_retry_at)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null

    return {
      count: failedInvoices.length,
      total: failedInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0),
      since: failedInvoices[0].created_at,
      reason: distinctMessages.length === 1 ? distinctMessages[0] : null,
      processorOnly,
      updateCardHref,
      nextRetry,
    }
  }, [failedInvoices, primaryBillingProfile?.location_id])

  /**
   * Locations that are live but have no way to be charged. Previously
   * invisible: the page only ever showed the profiles that *did* exist.
   */
  const locationsWithoutBilling = useMemo(
    () => locations.filter((location) => location.is_active && !billingProfilesByLocationId[location.id]),
    [billingProfilesByLocationId, locations],
  )

  const invoiceCounts = useMemo(
    () => ({
      all: invoices.length,
      unpaid: invoices.filter((invoice) => UNPAID_INVOICE_STATUSES.includes(invoice.status)).length,
      paid: invoices.filter((invoice) => invoice.status === 'paid').length,
    }),
    [invoices],
  )

  const invoiceMonths = useMemo(() => {
    const filtered =
      invoiceFilter === 'all'
        ? invoices
        : invoiceFilter === 'paid'
          ? invoices.filter((invoice) => invoice.status === 'paid')
          : invoices.filter((invoice) => UNPAID_INVOICE_STATUSES.includes(invoice.status))
    return groupInvoicesByMonth(filtered)
  }, [invoiceFilter, invoices])

  /**
   * Requests waiting on DEXA. They used to sit among the urgent alerts and
   * inflate the "Needs attention" count, though nothing about them needs the
   * owner.
   */
  const inProgress = useMemo(() => {
    const items: Array<{ key: string; title: string; meta: string; finalStep: string }> = []

    if (pendingTierRequest) {
      items.push({
        key: `tier-${pendingTierRequest.id}`,
        title: `Plan change to ${pendingTierRequest.requested_plan_name}`,
        meta: `${pendingTierRequest.request_number} · submitted ${formatDate(pendingTierRequest.requested_at)}`,
        finalStep: 'Active',
      })
    }

    pendingServiceRequests.forEach((request) => {
      const service = servicesById[request.service_id]
      const location = locationsById[request.location_id]
      items.push({
        key: `svc-${request.id}`,
        title: `${service?.display_name ?? 'Add-on'} for ${location?.name ?? 'a location'}`,
        meta: `${request.request_number} · submitted ${formatDate(request.requested_at)} · ${formatMoney(
          request.authorized_total,
        )}/mo once active`,
        finalStep: 'Active',
      })
    })

    pendingHardwareRequests.forEach((request) => {
      items.push({
        key: `hw-${request.id}`,
        title: `Hardware for ${request.location_name}`,
        meta: `${request.request_number} · submitted ${formatDate(request.requested_at)}`,
        finalStep: 'Provisioned',
      })
    })

    return items
  }, [locationsById, pendingHardwareRequests, pendingServiceRequests, pendingTierRequest, servicesById])

  const currentPlanCode = merchantPlanStatus.plan?.code ?? null

  /**
   * Which plan the dialog opens on.
   *
   * `required_plan_code` is the tier the merchant's location count *requires*,
   * which for a compliant merchant is the tier they are already on. Letting it
   * win outright opens the dialog with the current plan selected, which
   * disables the authorization checkbox and the submit button and reads as a
   * broken dialog. Only honour it when it is actually a different plan;
   * otherwise fall through to the first plan that is not the current one.
   */
  const selectedRequestedPlan = useMemo(() => {
    const explicitChoice = merchantTierPlans.find((plan) => plan.id === selectedRequestedPlanId)
    if (explicitChoice) return explicitChoice

    const requiredPlan =
      merchantPlanStatus.required_plan_code && merchantPlanStatus.required_plan_code !== currentPlanCode
        ? merchantTierPlans.find((plan) => plan.plan_code === merchantPlanStatus.required_plan_code)
        : null
    if (requiredPlan) return requiredPlan

    const locationCount = merchantPlanStatus.active_location_count
    const eligible = merchantTierPlans.filter(
      (plan) => plan.plan_code !== currentPlanCode && planFitsLocationCount(plan, locationCount),
    )

    // No fallback to an ineligible tier: preselecting one the merchant cannot
    // move to renders a price delta for a request that can never be approved,
    // directly above the note explaining there is nothing to switch to.
    return eligible[0] ?? null
  }, [
    currentPlanCode,
    merchantPlanStatus.active_location_count,
    merchantPlanStatus.required_plan_code,
    merchantTierPlans,
    selectedRequestedPlanId,
  ])

  /**
   * The money difference the merchant is agreeing to, stated before they agree.
   * Both sides are priced at the merchant's current location count, because
   * that is what drives a tier's cost — comparing the flat
   * `monthly_price_cents` would compare 0 against 0.
   */
  const planDelta = useMemo(() => {
    if (!selectedRequestedPlan) return null
    const locationCount = merchantPlanStatus.active_location_count
    const current = tierCharge.total
    const next = monthlyTierCharge(selectedRequestedPlan, locationCount).total
    return { current, next, difference: next - current }
  }, [merchantPlanStatus.active_location_count, tierCharge.total, selectedRequestedPlan])

  useEffect(() => {
    const errorMessage =
      overviewQuery.error instanceof Error
        ? overviewQuery.error.message
        : merchantTierPlansQuery.error instanceof Error
          ? merchantTierPlansQuery.error.message
          : ''

    if (errorMessage) {
      toast.error(errorMessage)
    }
  }, [merchantTierPlansQuery.error, overviewQuery.error])

  /**
   * Honour `?section=` once the sections have real content — scrolling while
   * the skeletons are up lands short when the data arrives and pushes the
   * target down.
   */
  useEffect(() => {
    if (isLoading || hasScrolledToSection.current) return
    hasScrolledToSection.current = true
    const anchor = SECTION_ANCHORS[initialSection]
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [initialSection, isLoading])

  const showUnpaidPayments = () => {
    setInvoiceFilter('unpaid')
    document.getElementById(SECTION_ANCHORS.billing!)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const loadInvoiceDocument = async (invoiceId: string): Promise<SubscriptionInvoiceDocumentData | null> => {
    setInvoiceActionId(invoiceId)
    const result = await getMerchantSubscriptionInvoiceDocument(invoiceId)
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

  const openPlanRequestDialog = () => {
    setHasAcceptedPlanAuthorization(false)
    setIsPlanDialogOpen(true)
  }

  const handleRequestPlan = async () => {
    if (!selectedRequestedPlan) {
      toast.error('Select a subscription plan first.')
      return
    }

    if (selectedRequestedPlan.plan_code === currentPlanCode) {
      toast.error('This is already your current subscription plan.')
      return
    }

    if (!hasAcceptedPlanAuthorization) {
      toast.error('Accept the recurring charge authorization before submitting.')
      return
    }

    setIsSubmittingPlanRequest(true)
    const result = await RequestMerchantTierPlan(selectedRequestedPlan.id, {
      accepted: hasAcceptedPlanAuthorization,
    })
    setIsSubmittingPlanRequest(false)

    if (!result.success) {
      toast.error(result.error || 'Failed to submit the plan request.')
      return
    }

    if (result.alreadyRequested) {
      toast.info(`Request ${result.requestNumber || ''} is already awaiting review.`.trim())
    } else {
      toast.success(
        `Plan request submitted${result.requestNumber ? ` as ${result.requestNumber}` : ''}.`,
      )
    }

    if (result.notificationWarning) {
      toast.warning(result.notificationWarning)
    }

    await overviewQuery.refetch()
    setHasAcceptedPlanAuthorization(false)
    setIsPlanDialogOpen(false)
  }

  const openHardwareDialog = (locationId: string) => {
    setHardwareRequestQuantity('1')
    setHardwareRequestNote('')
    setManageLocationId(null)
    setHardwareDialogLocationId(locationId)
  }

  const handleRequestHardware = async () => {
    if (!hardwareDialogLocationId) {
      toast.error('Select a location first.')
      return
    }

    setIsSubmittingHardwareRequest(true)
    const result = await RequestSubscriptionHardware({
      locationId: hardwareDialogLocationId,
      quantity: Number(hardwareRequestQuantity),
      note: hardwareRequestNote,
    })
    setIsSubmittingHardwareRequest(false)

    if (!result.success) {
      toast.error(result.error || 'Failed to submit the hardware request.')
      return
    }

    if (result.alreadyRequested) {
      toast.info(`Request ${result.requestNumber || ''} is already awaiting review.`.trim())
    } else {
      toast.success(`Hardware request submitted${result.requestNumber ? ` as ${result.requestNumber}` : ''}.`)
    }
    if (result.notificationWarning) toast.warning(result.notificationWarning)

    await overviewQuery.refetch()
    setHardwareRequestQuantity('1')
    setHardwareRequestNote('')
    setHardwareDialogLocationId(null)
  }

  const openAddOnDialog = (locationId: string, service: MerchantBillableServiceViewRecord) => {
    setAddOnQuantity('1')
    setHasAcceptedAddOnAuthorization(false)
    setManageLocationId(null)
    setAddOnDialog({ locationId, service })
  }

  const handleRequestAddOn = async () => {
    if (!addOnDialog) return

    setIsSubmittingAddOnRequest(true)
    const result = await RequestMerchantServiceAddOn(
      {
        locationId: addOnDialog.locationId,
        serviceId: addOnDialog.service.id,
        quantity: Number(addOnQuantity),
      },
      { accepted: hasAcceptedAddOnAuthorization },
    )
    setIsSubmittingAddOnRequest(false)

    if (!result.success) {
      toast.error(result.error || 'Failed to submit the add-on request.')
      return
    }

    toast.success(`Add-on request ${result.requestNumber ?? ''} submitted for DEXA review.`.trim())
    if (result.notificationWarning) toast.warning(result.notificationWarning)

    setAddOnDialog(null)
    setAddOnQuantity('1')
    setHasAcceptedAddOnAuthorization(false)
    await overviewQuery.refetch()
  }

  const requiredPlanLabel = merchantPlanStatus.required_plan_code
    ? getMerchantTierFallbackName(merchantPlanStatus.required_plan_code)
    : null

  /**
   * A merchant on the only tier that covers their location count has nowhere
   * to move. Without saying so the dialog is a dead end: every row disabled,
   * no consent box, and a greyed submit with no reason given.
   */
  const hasEligibleAlternativePlan = useMemo(
    () =>
      merchantTierPlans.some(
        (plan) =>
          plan.plan_code !== currentPlanCode &&
          planFitsLocationCount(plan, merchantPlanStatus.active_location_count),
      ),
    [currentPlanCode, merchantPlanStatus.active_location_count, merchantTierPlans],
  )

  const hardwareDialogLocation = hardwareDialogLocationId
    ? locationsById[hardwareDialogLocationId] ?? null
    : null
  const addOnDialogLocation = addOnDialog ? locationsById[addOnDialog.locationId] ?? null : null
  const addOnDialogCharge = addOnDialog
    ? addOnMonthlyAmount(addOnDialog.service, Number(addOnQuantity))
    : 0

  const manageLocation = manageLocationId ? locationsById[manageLocationId] ?? null : null

  /** The plan's payer, in the words an owner uses. */
  const planPayerSentence = !primaryBillingProfile
    ? 'No card is set up to pay for the plan yet.'
    : primaryBillingProfile.location_id
      ? `The plan is paid by ${primaryBillingProfile.location_name ?? 'your first location'}'s card. Each location pays for its own add-ons.`
      : `The plan is paid by your account card, ${cardLabel(primaryBillingProfile)}. Each location pays for its own add-ons.`

  const hasAlerts =
    merchantPlanStatus.subscription_status === 'suspended' ||
    Boolean(overdue) ||
    merchantPlanStatus.is_over_limit ||
    locationsWithoutBilling.length > 0

  const subtitle = merchantPlanStatus.plan
    ? `${merchantPlanStatus.plan.name} plan · ${plural(merchantPlanStatus.active_location_count, 'active location')} · billed monthly`
    : merchantName

  /** Per-location facts for the "who pays" table and cards. */
  const locationRows = locations.map((location) => {
    const profile = billingProfilesByLocationId[location.id] ?? null
    const assignments = serviceAssignments.filter((item) => item.location_id === location.id)
    const activeAddOns = assignments
      .map((assignment) => servicesById[assignment.service_id])
      .filter((service): service is MerchantBillableServiceViewRecord => Boolean(service))
    const pendingAddOns = pendingServiceRequests
      .filter((item) => item.location_id === location.id)
      .map((item) => servicesById[item.service_id]?.display_name ?? 'Add-on')
    const paysPlan = Boolean(primaryBillingProfile && profile?.id === primaryBillingProfile.id)
    const monthly =
      (nextCharge.locations[location.id]?.total ?? 0) + (paysPlan ? nextCharge.tier.total : 0)

    return {
      location,
      profile,
      activeAddOns,
      pendingAddOns,
      paysPlan,
      monthly,
      deviceCount: devicesByLocationId[location.id]?.length ?? location.device_count,
    }
  })

  const addOnSummary = (row: (typeof locationRows)[number]) => {
    if (row.activeAddOns.length === 0 && row.pendingAddOns.length === 0) {
      return <span className="text-muted-foreground">None</span>
    }
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {row.activeAddOns.length > 0 ? (
          <span>{row.activeAddOns.map((service) => service.display_name).join(', ')}</span>
        ) : null}
        {row.pendingAddOns.map((name) => (
          <StatusBadge key={name} label={`${name} · pending`} />
        ))}
      </div>
    )
  }

  const paidBy = (row: (typeof locationRows)[number]) => {
    if (!row.location.is_active) return <span className="text-muted-foreground">Not billed</span>
    if (!row.profile) {
      return (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusBadge label="No card" />
          <Link
            href={billingScopeHref(row.location.id)}
            className="text-sm font-medium text-[#0C4FD1] hover:underline dark:text-[#6CA0FF]"
          >
            Add card
          </Link>
        </div>
      )
    }
    return (
      <div className="min-w-0">
        <div className="truncate">{cardLabel(row.profile)}</div>
        <div className="truncate text-xs text-muted-foreground">
          {row.paysPlan ? 'Also pays the plan' : 'This location only'}
        </div>
      </div>
    )
  }

  const monthlyLabel = (row: (typeof locationRows)[number]) =>
    row.location.is_active ? formatMoney(row.monthly) : '—'

  return (
    <PageShell>
      <PageHeader
        title="Subscription"
        subtitle={subtitle}
        actions={
          <Button type="button" variant="outline" className={PILL} onClick={openPlanRequestDialog}>
            Change plan
          </Button>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Alerts — only things the owner must act on. Requests waiting on     */}
      {/* DEXA are "In progress" further down, not here.                      */}
      {/* ------------------------------------------------------------------ */}
      {hasAlerts ? (
        <section aria-label="Needs you" className="min-w-0 space-y-2">
          {merchantPlanStatus.subscription_status === 'suspended' ? (
            <AttentionBanner
              tone="critical"
              title="Your subscription is suspended"
              body="Your POS features are limited until billing is restored. Contact DEXA billing to reactivate."
              action={
                <Button asChild className={PILL}>
                  <Link href={SUPPORT_HREF}>Contact DEXA billing</Link>
                </Button>
              }
            />
          ) : null}

          {overdue ? (
            <AttentionBanner
              tone="critical"
              title={<span className="tabular-nums">{formatMoney(overdue.total)} overdue</span>}
              body={
                <>
                  {plural(overdue.count, 'card payment')} didn&rsquo;t go through since{' '}
                  {formatShortDate(overdue.since)}.{' '}
                  {overdue.reason ?? 'Each payment lists its reason below.'}{' '}
                  {overdue.nextRetry ? `We'll try again on ${formatDate(overdue.nextRetry)}.` : null}
                </>
              }
              action={
                <>
                  {overdue.processorOnly ? (
                    <Button asChild className={PILL}>
                      <Link href={SUPPORT_HREF}>Contact DEXA billing</Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild className={PILL}>
                        <Link href={overdue.updateCardHref}>Update payment method</Link>
                      </Button>
                      <Button asChild variant="outline" className={cn(PILL, 'border-transparent bg-background/70')}>
                        <Link href={SUPPORT_HREF}>Contact DEXA billing</Link>
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(PILL, 'shadow-none hover:bg-background/60')}
                    onClick={showUnpaidPayments}
                  >
                    See the {overdue.count === 1 ? 'payment' : `${overdue.count} payments`}
                  </Button>
                </>
              }
            />
          ) : null}

          {merchantPlanStatus.is_over_limit &&
          merchantPlanStatus.plan &&
          merchantPlanStatus.plan.max_locations !== null ? (
            <AttentionBanner
              tone="warning"
              title={`Over your plan limit — ${merchantPlanStatus.active_location_count} of ${merchantPlanStatus.plan.max_locations} locations`}
              body={`Request an upgrade${requiredPlanLabel ? ` to ${requiredPlanLabel}` : ''} to bring every location back under coverage.`}
              action={
                <Button type="button" className={PILL} onClick={openPlanRequestDialog}>
                  Request upgrade
                </Button>
              }
            />
          ) : null}

          {locationsWithoutBilling.length > 0 ? (
            <AttentionBanner
              tone="warning"
              title={
                locationsWithoutBilling.length === 1
                  ? `${locationsWithoutBilling[0].name} has no card`
                  : `${locationsWithoutBilling.length} locations have no card`
              }
              body={
                locationsWithoutBilling.length === 1
                  ? "Its add-ons can't be charged until one is added."
                  : `${locationsWithoutBilling.map((location) => location.name).join(', ')}. Their add-ons can't be charged until each has a card.`
              }
              action={
                <Button asChild variant="outline" className={cn(PILL, 'border-transparent bg-background/70')}>
                  <Link
                    href={
                      locationsWithoutBilling.length === 1
                        ? billingScopeHref(locationsWithoutBilling[0].id)
                        : '/dashboard/settings/billing'
                    }
                  >
                    Add card
                  </Link>
                </Button>
              }
            />
          ) : null}
        </section>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Next charge — what, when, and to which card.                        */}
      {/* ------------------------------------------------------------------ */}
      <Panel>
        <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 px-4 py-6 sm:px-6 sm:py-8">
            <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Next charge</h2>
            {isLoading ? (
              <Skeleton className="mt-3 h-12 w-44" />
            ) : !merchantPlanStatus.plan ? (
              <div className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">
                No active plan
              </div>
            ) : pricingKnown ? (
              <div className="mt-2 text-[2.5rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                {formatMoney(nextCharge.total)}
              </div>
            ) : (
              <div className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">
                Priced by agreement
              </div>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              {!nextBillingDate
                ? 'Date set once your plan is activated'
                : isPastDate(nextBillingDate)
                  ? // The billing date only advances when a cycle is invoiced
                    // and collected, so a lapsed account still shows the one
                    // it missed. Saying "On Sep 7" on Sep 26 reads as a typo.
                    `Was due ${formatDate(nextBillingDate)} · not collected yet`
                  : `On ${formatDate(nextBillingDate)}`}
            </p>
            {merchantPlanStatus.plan && !pricingKnown ? (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Your plan is priced by agreement, so we can&rsquo;t total it here. Your DEXA rep can
                confirm the amount.
              </p>
            ) : null}

            <div className="mt-5 flex min-w-0 flex-wrap items-center gap-3 rounded-2xl bg-muted/60 px-4 py-3">
              <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {primaryBillingProfile ? cardLabel(primaryBillingProfile) : 'No card on file'}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {cardExpiry(primaryBillingProfile) ?? 'Pays for the plan'}
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className={cn(PILL, 'shrink-0')}>
                <Link href={planCardHref}>{primaryBillingProfile ? 'Change' : 'Add card'}</Link>
              </Button>
            </div>
          </div>

          <div className="min-w-0 px-4 pb-6 sm:px-6 lg:bg-muted/20 lg:py-8">
            <h3 className="text-sm text-muted-foreground">What makes it up</h3>
            {isLoading ? (
              <SectionSkeleton rows={3} />
            ) : (
              <div className="mt-3 space-y-1">
                <BreakdownRow
                  label={`${merchantPlanStatus.plan?.name ?? 'No active'} plan`}
                  meta={
                    tierCharge.extraLocations > 0
                      ? `${plural(tierCharge.extraLocations, 'location')} after the first × ${formatMoney(tierCharge.perExtraLocation)}`
                      : plural(merchantPlanStatus.active_location_count, 'active location')
                  }
                  amount={pricingKnown ? formatMoney(nextCharge.tier.subtotal) : '—'}
                />
                <BreakdownRow
                  label="Location add-ons"
                  meta={
                    nextCharge.addOnCount === 0
                      ? 'None active'
                      : `${nextCharge.addOnCount} active · charged to each location's card`
                  }
                  amount={formatMoney(nextCharge.addOnSubtotal)}
                />
                {nextCharge.fee > 0 ? (
                  <BreakdownRow
                    label="Card processing fee"
                    meta={
                      tierPlan?.card_surcharge_pct
                        ? `${tierPlan.card_surcharge_pct}% of card payments`
                        : 'A percentage of card payments'
                    }
                    amount={formatMoney(nextCharge.fee)}
                  />
                ) : null}
                <BreakdownRow
                  label="Total"
                  amount={pricingKnown ? formatMoney(nextCharge.total) : '—'}
                  emphasis
                />
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* What you pay for: the plan, and each location with its card.       */}
      {/* ------------------------------------------------------------------ */}
      <Panel>
        <PanelSection
          label="Plan"
          action={
            <Button type="button" variant="outline" className={PILL} onClick={openPlanRequestDialog}>
              Compare plans
            </Button>
          }
        >
          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-2xl" />
          ) : (
            <div className="min-w-0">
              <div className="text-xl font-semibold tracking-[-0.01em]">
                {merchantPlanStatus.plan?.name ?? 'No plan yet'}
              </div>
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                {merchantPlanStatus.plan
                  ? [
                      describeTierPricing(tierPlan) ?? 'No monthly fee',
                      merchantPlanStatus.plan.max_locations === null
                        ? `unlimited locations · you have ${merchantPlanStatus.active_location_count} active`
                        : `up to ${plural(merchantPlanStatus.plan.max_locations, 'location')} · you have ${merchantPlanStatus.active_location_count} active`,
                    ].join(' · ')
                  : 'Choose a plan and send it to DEXA for approval.'}
              </p>
              {merchantPlanStatus.plan?.description ? (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {merchantPlanStatus.plan.description}
                </p>
              ) : null}
            </div>
          )}
        </PanelSection>

        <div id={SECTION_ANCHORS.locations!} className="scroll-mt-6">
          <PanelSection label="Locations and who pays" caption={isLoading ? undefined : planPayerSentence}>
            {isLoading ? (
              <SectionSkeleton rows={4} />
            ) : locations.length === 0 ? (
              <Empty
                icon={Building2}
                title="No locations yet"
                description="Locations you add will appear here with the card that pays for them."
              />
            ) : (
              <>
                <Table variant="data" containerClassName="hidden xl:block" className="min-w-[860px]">
                  <TableHeader className="[&_tr]:border-0">
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>Add-ons</TableHead>
                      <TableHead>Paid by</TableHead>
                      <TableHead className="text-right">Monthly</TableHead>
                      <TableHead className="w-24 text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locationRows.map((row) => (
                      <TableRow key={row.location.id}>
                        <TableCell className="max-w-[16rem] whitespace-normal">
                          <div className={cn('font-medium', !row.location.is_active && 'text-muted-foreground')}>
                            {row.location.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[
                              formatCity(row.location),
                              row.location.is_active ? plural(row.deviceCount, 'device') : 'Inactive',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </TableCell>
                        {/* `TableCell` is `whitespace-nowrap`; free text needs its own cap. */}
                        <TableCell className="max-w-[18rem] whitespace-normal text-sm">
                          {row.location.is_active ? addOnSummary(row) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="max-w-[14rem] whitespace-normal text-sm">{paidBy(row)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{monthlyLabel(row)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-full px-3 text-[0.8125rem] font-medium"
                            onClick={() => setManageLocationId(row.location.id)}
                          >
                            Manage
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Below xl the table becomes cards, never a scrolling table (§5.3). */}
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                  {locationRows.map((row) => (
                    <div key={`location-card-${row.location.id}`} className="min-w-0 rounded-2xl bg-muted/45 p-4">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={cn('truncate font-medium', !row.location.is_active && 'text-muted-foreground')}>
                            {row.location.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {row.location.is_active ? plural(row.deviceCount, 'device') : 'Inactive · not billed'}
                          </div>
                        </div>
                        <div className="shrink-0 font-medium tabular-nums">{monthlyLabel(row)}</div>
                      </div>
                      {row.location.is_active ? (
                        <div className="mt-3 grid min-w-0 grid-cols-2 gap-3 text-sm">
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">Add-ons</div>
                            <div className="mt-0.5">{addOnSummary(row)}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">Paid by</div>
                            <div className="mt-0.5">{paidBy(row)}</div>
                          </div>
                        </div>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-3 h-9 w-full rounded-full text-[0.8125rem] font-medium hover:bg-background/60"
                        onClick={() => setManageLocationId(row.location.id)}
                      >
                        Manage
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </PanelSection>
        </div>

          {activeSection === 'billing' ? (
            <div className="min-w-0">
      {transactionSummary.pending > 0 ? (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <div className="font-medium">Outstanding balance: {formatMoney(transactionSummary.pending)}</div>
              <div className="mt-1 text-sm text-amber-800">
                Update the saved card so DEXA Billing can automatically retry eligible invoices.
              </div>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="rounded-full border-amber-300 bg-white">
            <Link href={billingSettingsHref}>Review payment method</Link>
          </Button>
        </div>
      ) : null}
      <PanelSection label="Merchant Payment Method" caption="The primary payment profile used for merchant-wide subscription billing.">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            This card pays the merchant tier only. Each location pays its own devices and add-ons using its own card.
          </p>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link href={billingSettingsHref}>Update payment method</Link>
          </Button>
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading payment method...</div>
        ) : (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-2.5">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">{buildPaymentMethodLabel(primaryBillingProfile)}</div>
                <div className="text-sm text-muted-foreground">
                  {primaryBillingProfile?.billing_method === 'card'
                    ? formatBillingCard(primaryBillingProfile).detail
                    : primaryBillingProfile?.billing_method === 'ach'
                      ? 'Bank account on file'
                      : 'Payment method setup is handled by your Dexa team.'}
                </div>
                {primaryBillingProfile?.location_name ? (
                  <div className="mt-1 text-xs text-muted-foreground">Billing anchor: {primaryBillingProfile.location_name}</div>
                ) : null}
              </div>
            </div>
            {primaryBillingProfile?.is_primary ? (
              <Badge variant="secondary" className="rounded-full">Primary</Badge>
            ) : null}
          </div>
        )}
        {Object.keys(billingProfilesByLocationId).length > 0 ? (
          <div className="mt-5 space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Location payment profiles
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {Object.values(billingProfilesByLocationId).map((profile) => (
                <div key={profile.id} className="rounded-2xl bg-muted/35 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">{profile.location_name || 'Location profile'}</div>
                    {profile.id === primaryBillingProfile?.id ? (
                      <Badge variant="outline" className="rounded-full text-[0.6875rem]">Billing anchor</Badge>
                    ) : null}
                  </div>
                  <RequestTracker finalStep={item.finalStep} />
                </div>
              ))}
            </div>
          </PanelSection>
        ) : null}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* Payments, grouped by month with the totals an accountant asks for.  */}
      {/* ------------------------------------------------------------------ */}
      <Panel id={SECTION_ANCHORS.billing!} className="scroll-mt-6">
        <PanelSection
          label="Payments"
          caption="Grouped by month. The plan and each location are invoiced separately and charged automatically to their card."
        >
          <div className="mb-4 flex min-w-0 flex-wrap gap-2">
            {([
              { id: 'all', label: 'All' },
              { id: 'unpaid', label: 'Unpaid' },
              { id: 'paid', label: 'Paid' },
            ] as Array<{ id: InvoiceFilter; label: string }>).map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={invoiceFilter === filter.id}
                onClick={() => setInvoiceFilter(filter.id)}
                className={cn(
                  'rounded-full border-0 px-3 py-1.5 text-[0.8125rem] font-medium shadow-none transition-colors',
                  invoiceFilter === filter.id
                    ? 'bg-muted text-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {filter.label}
                <span className="ml-1.5 tabular-nums opacity-70">{invoiceCounts[filter.id]}</span>
              </button>
            ))}
          </div>

          {isLoading ? (
            <SectionSkeleton rows={4} />
          ) : invoiceMonths.length === 0 ? (
            <Empty
              icon={CreditCard}
              title={invoiceFilter === 'all' ? 'No payments yet' : 'Nothing matches this filter'}
              description={
                invoiceFilter === 'all'
                  ? 'Invoices appear here once billing begins.'
                  : invoiceFilter === 'unpaid'
                    ? 'Every invoice is paid.'
                    : 'No paid invoices yet.'
              }
            />
          ) : (
            <div className="space-y-6">
              {invoiceMonths.map((month) => {
                const isExpanded = expandedMonths.includes(month.key)
                const shown = isExpanded ? month.invoices : month.invoices.slice(0, INVOICES_PER_MONTH)
                const hidden = month.invoices.length - shown.length

                return (
                  <section key={month.key} aria-label={month.label} className="min-w-0">
                    <div className="mb-2 flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                      <h3 className="font-semibold">{month.label}</h3>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {plural(month.invoices.length, 'invoice')} · {formatMoney(month.billed)} billed
                        {month.unpaid > 0 ? ` · ${formatMoney(month.unpaid)} unpaid` : ' · all paid'}
                      </p>
                    </div>

                    <div className="min-w-0 space-y-1 rounded-2xl bg-muted/20 p-1">
                      {shown.map((invoice) => {
                        const covers =
                          subscriptionBillingScope(invoice.metadata) === 'merchant_tier'
                            ? 'Plan'
                            : invoice.location_name
                        const reason =
                          invoice.status === 'failed'
                            ? describePaymentFailure(invoice.last_payment_error).message
                            : null
                        const isBusy = invoiceActionId === invoice.id

                        return (
                          <div
                            key={invoice.id}
                            className="flex min-w-0 items-center gap-3 rounded-xl bg-card/70 px-3 py-3"
                          >
                            <div className="hidden w-14 shrink-0 text-sm text-muted-foreground tabular-nums sm:block">
                              {formatShortDate(invoice.created_at)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{covers}</div>
                              <div className="text-xs text-muted-foreground">
                                <span className="sm:hidden">{formatShortDate(invoice.created_at)} · </span>
                                {invoice.invoice_number}
                                {reason ? ` · ${reason}` : ''}
                              </div>
                            </div>
                            <div className="hidden shrink-0 sm:block">
                              <StatusBadge label={invoiceStatusLabel(invoice.status)} />
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="text-sm font-medium tabular-nums">{formatMoney(invoice.total_amount)}</span>
                              <span className="sm:hidden">
                                <StatusBadge label={invoiceStatusLabel(invoice.status)} />
                              </span>
                            </div>
                            <div className="shrink-0">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-8 w-8 rounded-full p-0"
                                    aria-label={`Actions for invoice ${invoice.invoice_number}`}
                                    disabled={isBusy}
                                  >
                                    {isBusy ? (
                                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    disabled={isInvoicePreviewLoading}
                                    onSelect={() => handlePreviewInvoice(invoice.id)}
                                  >
                                    <Eye className="h-4 w-4" aria-hidden="true" />
                                    View invoice
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => handleDownloadInvoice(invoice.id)}>
                                    <Download className="h-4 w-4" aria-hidden="true" />
                                    Download PDF
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {hidden > 0 || isExpanded ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-8 rounded-full px-3 text-[0.8125rem] font-medium"
                        onClick={() =>
                          setExpandedMonths((current) =>
                            isExpanded ? current.filter((key) => key !== month.key) : [...current, month.key],
                          )
                        }
                      >
                        {isExpanded ? 'Show fewer' : `Show ${hidden} more in ${month.label.split(' ')[0]}`}
                      </Button>
                    ) : null}
                  </section>
                )
              })}
            </div>
          )}
        </PanelSection>
      </Panel>

      <div className="space-y-1 px-1 text-center text-sm text-muted-foreground">
        {primaryBillingProfile?.billing_email ? (
          <p>
            Receipts and payment notices go to{' '}
            <span className="font-medium text-foreground">{primaryBillingProfile.billing_email}</span> ·{' '}
            <Link href={planCardHref} className="font-medium text-[#0C4FD1] hover:underline dark:text-[#6CA0FF]">
              Change
            </Link>
          </p>
        ) : null}
        <p>
          Want to pause or cancel?{' '}
          <Link href={SUPPORT_HREF} className="font-medium text-[#0C4FD1] hover:underline dark:text-[#6CA0FF]">
            Contact DEXA billing
          </Link>
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Manage a location — devices, add-ons and card in one pop-up.       */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={Boolean(manageLocation)} onOpenChange={(open) => (open ? null : setManageLocationId(null))}>
        <DialogContent className="dashboard-sidebar-theme max-h-[85vh] max-w-lg overflow-y-auto">
          {manageLocation ? (
            (() => {
              const row = locationRows.find((item) => item.location.id === manageLocation.id)
              const devices = devicesByLocationId[manageLocation.id] ?? []
              const assignments = serviceAssignments.filter((item) => item.location_id === manageLocation.id)
              const pending = pendingServiceRequests.filter((item) => item.location_id === manageLocation.id)
              const pendingHardware = pendingHardwareRequests.find(
                (request) => request.location_id === manageLocation.id,
              )
              const availableToRequest = availableServices.filter(
                (service) =>
                  !assignments.some((item) => item.service_id === service.id) &&
                  !pending.some((item) => item.service_id === service.id),
              )

              return (
                <>
                  <DialogHeader>
                    <DialogTitle>{manageLocation.name}</DialogTitle>
                    <DialogDescription>{formatLocationAddress(manageLocation)}</DialogDescription>
                  </DialogHeader>

                  <div className="space-y-5">
                    <section className="space-y-2">
                      <h3 className="text-sm font-medium">Card</h3>
                      <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-muted/45 px-4 py-3">
                        <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{cardLabel(row?.profile ?? null)}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {row?.profile
                              ? row.paysPlan
                                ? "Pays the plan and this location's add-ons"
                                : "Pays this location's add-ons only"
                              : 'Paid add-ons need a card on this location first.'}
                          </div>
                        </div>
                        <Button asChild size="sm" variant="outline" className={cn(PILL, 'shrink-0')}>
                          <Link href={billingScopeHref(manageLocation.id)}>{row?.profile ? 'Change' : 'Add card'}</Link>
                        </Button>
                      </div>
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-sm font-medium">Add-ons</h3>
                      <div className="space-y-1 rounded-2xl bg-muted/45 p-1">
                        {assignments.length === 0 && pending.length === 0 ? (
                          <p className="px-3 py-2.5 text-sm text-muted-foreground">No add-ons active.</p>
                        ) : null}
                        {assignments.map((assignment) => {
                          const service = servicesById[assignment.service_id]
                          if (!service) return null
                          return (
                            <div
                              key={assignment.service_id}
                              className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-card/70 px-3 py-2.5"
                            >
                              <span className="min-w-0 truncate text-sm">
                                {service.display_name}
                                {assignment.quantity > 1 ? ` × ${assignment.quantity}` : ''}
                              </span>
                              <span className="shrink-0 text-sm tabular-nums">
                                {formatMoney(addOnMonthlyAmount(service, assignment.quantity))}/mo
                              </span>
                            </div>
                          )
                        })}
                        {pending.map((request) => (
                          <div
                            key={request.id}
                            className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-card/70 px-3 py-2.5"
                          >
                            <span className="min-w-0 truncate text-sm">
                              {servicesById[request.service_id]?.display_name ?? 'Add-on'}
                            </span>
                            <StatusBadge label="Waiting on DEXA" />
                          </div>
                        ))}
                      </div>

                      {availableToRequest.length > 0 ? (
                        <div className="space-y-1 pt-2">
                          <p className="px-1 text-xs text-muted-foreground">Available to add</p>
                          {availableToRequest.map((service) => (
                            <div
                              key={service.id}
                              className="flex min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-1.5 hover:bg-muted/40"
                            >
                              <span className="min-w-0 truncate text-sm">
                                {service.display_name}
                                <span className="ml-2 text-muted-foreground tabular-nums">
                                  {formatMoney(addOnMonthlyAmount(service, 1))}/mo
                                </span>
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 shrink-0 rounded-full px-3 text-[0.8125rem] font-medium shadow-sm"
                                onClick={() => openAddOnDialog(manageLocation.id, service)}
                              >
                                Add
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <p className="px-1 text-xs text-muted-foreground">
                        To remove an add-on,{' '}
                        <Link href={SUPPORT_HREF} className="font-medium text-[#0C4FD1] hover:underline dark:text-[#6CA0FF]">
                          contact DEXA billing
                        </Link>
                        .
                      </p>
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-sm font-medium">
                        Devices
                        <span className="ml-1.5 text-muted-foreground tabular-nums">{devices.length}</span>
                      </h3>
                      <div className="space-y-1 rounded-2xl bg-muted/45 p-1">
                        {devices.length === 0 ? (
                          <p className="px-3 py-2.5 text-sm text-muted-foreground">No devices assigned yet.</p>
                        ) : (
                          devices.map((device) => (
                            <div
                              key={device.id}
                              className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-card/70 px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm">{device.model_name}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {device.serial_number}
                                  {device.linked_station_name ? ` · ${device.linked_station_name}` : ''}
                                </div>
                              </div>
                              <StatusBadge label={device.status.replace(/_/g, ' ')} />
                            </div>
                          ))
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(PILL, 'w-full')}
                        onClick={() => openHardwareDialog(manageLocation.id)}
                        disabled={Boolean(pendingHardware)}
                      >
                        {pendingHardware ? `${pendingHardware.request_number} waiting on DEXA` : 'Request hardware'}
                      </Button>
                    </section>
                  </div>
                </>
              )
            })()
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* Change plan — choice and authorization in one view.                 */}
      {/* The tier grid used to sit on the page as three 320px cards, with    */}
      {/* "Review plan request" below the fold and the authorization in a     */}
      {/* dialog that also served hardware requests. By the time a merchant   */}
      {/* authorised a recurring charge, the plan they picked was off-screen  */}
      {/* and the price difference was never stated at all.                   */}
      {/* ------------------------------------------------------------------ */}
      <Dialog
        open={isPlanDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setHasAcceptedPlanAuthorization(false)
            setIsPlanDialogOpen(false)
          }
        }}
      >
        <DialogContent className="dashboard-sidebar-theme max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>
              DEXA reviews this request before anything is charged or activated.
            </DialogDescription>
          </DialogHeader>

          {merchantTierPlans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No subscription plans are currently available.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {merchantTierPlans.map((plan) => {
                  const isCurrent = plan.plan_code === currentPlanCode
                  const isSelected = selectedRequestedPlan?.id === plan.id
                  const fits = planFitsLocationCount(plan, merchantPlanStatus.active_location_count)
                  const fitNote = fits ? '' : planFitLabel(plan, merchantPlanStatus.active_location_count)

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      aria-pressed={isSelected}
                      aria-disabled={!fits || isCurrent}
                      disabled={isCurrent || !fits}
                      onClick={() => {
                        setSelectedRequestedPlanId(plan.id)
                        setHasAcceptedPlanAuthorization(false)
                      }}
                      className={cn(
                        'flex w-full min-w-0 items-start justify-between gap-3 rounded-2xl p-4 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        isCurrent
                          ? 'cursor-default bg-muted/30'
                          : !fits
                            ? 'cursor-not-allowed bg-muted/20 opacity-70'
                            : isSelected
                              ? 'bg-muted ring-1 ring-border'
                              : 'bg-muted/45 hover:bg-muted/65',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          {isSelected && !isCurrent ? (
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" aria-hidden="true" />
                            </span>
                          ) : null}
                          <span className="font-medium">{plan.display_name}</span>
                          {isCurrent ? (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                              Current
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {describeTierPricing(plan) ?? formatTierBillingUnit(plan)}
                        </span>
                        {fitNote ? (
                          <span className="mt-1 block text-xs text-muted-foreground">{fitNote}</span>
                        ) : null}
                        {isSelected && !isCurrent ? (
                          <span className="mt-2 block space-y-1 text-xs text-muted-foreground">
                            {merchantTierHighlights(plan).map((line) => (
                              <span key={`${plan.id}-${line}`} className="block">
                                {line}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-medium tabular-nums">
                          {formatMoney(
                            monthlyTierCharge(plan, merchantPlanStatus.active_location_count).total,
                          )}
                          <span className="text-muted-foreground">/mo</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          at {merchantPlanStatus.active_location_count} location
                          {merchantPlanStatus.active_location_count === 1 ? '' : 's'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {planDelta &&
              selectedRequestedPlan &&
              selectedRequestedPlan.plan_code !== currentPlanCode &&
              planFitsLocationCount(selectedRequestedPlan, merchantPlanStatus.active_location_count) ? (
                <div className="space-y-2 rounded-2xl bg-muted/45 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Today</span>
                    <span className="tabular-nums">
                      {merchantPlanStatus.plan?.name || 'No plan'}
                      {planDelta.current > 0 ? ` · ${formatMoney(planDelta.current)}/mo` : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Requested</span>
                    <span className="tabular-nums">
                      {selectedRequestedPlan.display_name}
                      {planDelta.next > 0 ? ` · ${formatMoney(planDelta.next)}/mo` : ''}
                    </span>
                  </div>
                  {/* Both tiers can be "Contact for pricing" (0 cents). A
                      "+$0.00" difference would be a false reassurance. */}
                  <div className="flex items-center justify-between gap-3 font-medium">
                    <span>Monthly difference</span>
                    {planDelta.current > 0 || planDelta.next > 0 ? (
                      <span className="tabular-nums">
                        {planDelta.difference >= 0 ? '+' : '−'}
                        {formatMoney(Math.abs(planDelta.difference))}
                      </span>
                    ) : (
                      <span>DEXA confirms on approval</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Takes effect</span>
                    <span>On DEXA approval</span>
                  </div>
                </div>
              ) : null}

              {pendingTierRequest ? (
                <p className="text-sm text-muted-foreground">
                  {pendingTierRequest.request_number} is already awaiting review. You can submit another
                  change once it is resolved.
                </p>
              ) : merchantPlanStatus.plan && !hasEligibleAlternativePlan ? (
                <div className="rounded-2xl bg-muted/45 p-4 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {merchantPlanStatus.plan.name} is the only tier that covers your{' '}
                    {merchantPlanStatus.active_location_count} locations.
                  </span>{' '}
                  Your bill changes automatically as you add or remove locations, so there is nothing
                  to switch to here. Contact your DEXA rep if you need different terms.
                </div>
              ) : selectedRequestedPlan &&
                selectedRequestedPlan.plan_code !== currentPlanCode &&
                planFitsLocationCount(selectedRequestedPlan, merchantPlanStatus.active_location_count) ? (
                <div className="flex items-start gap-3 rounded-2xl bg-muted/45 p-4">
                  <Checkbox
                    id="plan-charge-authorization"
                    checked={hasAcceptedPlanAuthorization}
                    onCheckedChange={(checked) => setHasAcceptedPlanAuthorization(checked === true)}
                  />
                  {/* `Label` ships `flex items-center gap-2`; inline spans in a
                      sentence become flex items and each fragment stacks into
                      its own column. `block` overrides it via tailwind-merge. */}
                  <Label
                    htmlFor="plan-charge-authorization"
                    className="block min-w-0 flex-1 cursor-pointer text-sm font-normal leading-relaxed"
                  >
                    I authorize DEXA POS to charge{' '}
                    <span className="font-semibold tabular-nums">
                      {formatMoney(planDelta?.next ?? 0)}/mo
                    </span>{' '}
                    at my current {merchantPlanStatus.active_location_count} location
                    {merchantPlanStatus.active_location_count === 1 ? '' : 's'} on a recurring
                    monthly basis for{' '}
                    <span className="font-semibold">{selectedRequestedPlan.display_name}</span>. I
                    understand activation requires DEXA HQ approval and billing continues until
                    cancellation under the applicable terms.
                  </Label>
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Nothing is charged today. The request shows under &ldquo;In progress&rdquo; until DEXA
              resolves it.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                onClick={() => setIsPlanDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                disabled={
                  isSubmittingPlanRequest ||
                  Boolean(pendingTierRequest) ||
                  !selectedRequestedPlan ||
                  !hasAcceptedPlanAuthorization ||
                  selectedRequestedPlan.plan_code === currentPlanCode ||
                  !planFitsLocationCount(
                    selectedRequestedPlan,
                    merchantPlanStatus.active_location_count,
                  )
                }
                onClick={handleRequestPlan}
              >
                {isSubmittingPlanRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send request
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------- Request hardware ------------------------- */}
      <Dialog
        open={Boolean(hardwareDialogLocationId)}
        onOpenChange={(open) => {
          if (!open) setHardwareDialogLocationId(null)
        }}
      >
        <DialogContent className="dashboard-sidebar-theme max-w-lg">
          <DialogHeader>
            <DialogTitle>Request hardware</DialogTitle>
            <DialogDescription>
              {hardwareDialogLocation
                ? `Devices for ${hardwareDialogLocation.name}. DEXA HQ reviews this before anything is provisioned.`
                : 'DEXA HQ reviews this before anything is provisioned.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hardware-request-quantity">Device quantity</Label>
              <Input
                id="hardware-request-quantity"
                type="number"
                min={1}
                max={100}
                value={hardwareRequestQuantity}
                onChange={(event) => setHardwareRequestQuantity(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hardware-request-note">Request details (optional)</Label>
              <Textarea
                id="hardware-request-note"
                value={hardwareRequestNote}
                maxLength={2000}
                onChange={(event) => setHardwareRequestNote(event.target.value)}
                placeholder="Device type, intended use, or fulfillment notes"
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Creates a request and notifies DEXA HQ. Nothing is charged today.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                onClick={() => setHardwareDialogLocationId(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                disabled={isSubmittingHardwareRequest || !hardwareDialogLocationId}
                onClick={handleRequestHardware}
              >
                {isSubmittingHardwareRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send request
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------ Request add-on -------------------------- */}
      <Dialog
        open={Boolean(addOnDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setAddOnDialog(null)
            setHasAcceptedAddOnAuthorization(false)
          }
        }}
      >
        <DialogContent className="dashboard-sidebar-theme max-w-lg">
          <DialogHeader>
            <DialogTitle>Authorize paid add-on</DialogTitle>
            <DialogDescription>
              Review the recurring location charge before sending it to DEXA HQ.
            </DialogDescription>
          </DialogHeader>

          {addOnDialog ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-2xl bg-muted/45 p-4 sm:grid-cols-2">
                <Field label="Feature" value={addOnDialog.service.display_name} />
                <Field label="Location" value={addOnDialogLocation?.name ?? '—'} />
                <div className="space-y-2">
                  <Label htmlFor="addon-quantity">Quantity</Label>
                  <Input
                    id="addon-quantity"
                    type="number"
                    min={1}
                    max={1000}
                    value={addOnQuantity}
                    onChange={(event) => setAddOnQuantity(event.target.value)}
                  />
                </div>
                <Field
                  label="Authorized recurring total"
                  value={
                    <span className="text-xl font-semibold tabular-nums">
                      {formatMoney(addOnDialogCharge)}/mo
                    </span>
                  }
                  meta="Includes card surcharge"
                />
              </div>

              <div className="flex items-start gap-3 rounded-2xl bg-muted/45 p-4">
                <Checkbox
                  id="addon-charge-authorization"
                  checked={hasAcceptedAddOnAuthorization}
                  onCheckedChange={(checked) => setHasAcceptedAddOnAuthorization(checked === true)}
                />
                <Label
                  htmlFor="addon-charge-authorization"
                  className="block min-w-0 flex-1 cursor-pointer text-sm font-normal leading-relaxed"
                >
                  I authorize DEXA POS to charge{' '}
                  <span className="font-semibold tabular-nums">
                    {formatMoney(addOnDialogCharge)}/month
                  </span>{' '}
                  for {addOnDialog.service.display_name} at {addOnDialogLocation?.name ?? 'this location'}.
                  I understand the charge is recurring, requires DEXA HQ approval, and continues until
                  cancellation.
                </Label>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              onClick={() => setAddOnDialog(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
              disabled={
                !hasAcceptedAddOnAuthorization ||
                isSubmittingAddOnRequest ||
                Number(addOnQuantity) < 1
              }
              onClick={handleRequestAddOn}
            >
              {isSubmittingAddOnRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------- Invoice preview -------------------------- */}
      <Dialog open={isInvoicePreviewOpen} onOpenChange={setIsInvoicePreviewOpen}>
        <DialogContent className="dashboard-sidebar-theme max-w-5xl">
          <DialogHeader>
            <DialogTitle>Invoice preview</DialogTitle>
            <DialogDescription>
              Preview the customer-facing subscription invoice before downloading it.
            </DialogDescription>
          </DialogHeader>
          {invoicePreviewDocument ? (
            <div className="overflow-hidden rounded-2xl">
              <iframe
                title="Subscription invoice preview"
                srcDoc={invoicePreviewHtml}
                className="h-[720px] w-full bg-white"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No invoice selected.</p>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
