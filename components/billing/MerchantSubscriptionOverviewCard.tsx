'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  CreditCard,
  Download,
  Eye,
  FileText,
  Loader2,
  Mail,
  Monitor,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Empty } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { PageHeader, PageShell, Panel, PanelSection } from '@/components/dashboard/shell'
import {
  getMerchantSubscriptionInvoiceDocument,
  type MerchantBillingLocationViewRecord,
  type MerchantPlanStatusView,
  type MerchantProvisionedDeviceViewRecord,
  type MerchantSubscriptionBillingProfileViewRecord,
  type MerchantSubscriptionInvoiceViewRecord,
  type MerchantTierPlanViewRecord,
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
import { cn } from '@/lib/utils'
import {
  invoiceStatusLabel,
  subscriptionStatusLabel,
} from '@/lib/constants/subscription-status'

interface MerchantSubscriptionOverviewCardProps {
  merchantName: string
}

const LOCATION_PAGE_SIZE = 10
type SubscriptionSection = 'plan' | 'hardware' | 'billing'

const EMPTY_PLAN_STATUS: MerchantPlanStatusView = {
  plan: null,
  active_location_count: 0,
  is_over_limit: false,
  required_plan_code: null,
  subscription_status: null,
  current_period_end: null,
}
const EMPTY_LOCATIONS: MerchantBillingLocationViewRecord[] = []
const EMPTY_DEVICES_BY_LOCATION: Record<string, MerchantProvisionedDeviceViewRecord[]> = {}
const EMPTY_INVOICES: MerchantSubscriptionInvoiceViewRecord[] = []
const EMPTY_BILLING_PROFILES: Record<string, MerchantSubscriptionBillingProfileViewRecord> = {}

const SUBSCRIPTION_SECTIONS: Array<{
  id: SubscriptionSection
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  {
    id: 'plan',
    label: 'Plan & locations',
    icon: Building2,
  },
  {
    id: 'hardware',
    label: 'Hardware',
    icon: Monitor,
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: CreditCard,
  },
]
const PLAN_NAME_BY_CODE: Record<string, string> = {
  basic: 'Basic',
  multi_location: 'Multi-Location',
  franchise: 'Franchise',
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatLocationAddress(location: MerchantBillingLocationViewRecord): string {
  return [location.address_line1, location.city, location.state, location.postal_code]
    .filter(Boolean)
    .join(', ') || 'Address not set'
}

/** Flat, uncoloured status badge — no per-status tint or dot. */
function StatusBadge({
  label,
}: {
  style?: { dot: string; text: string; bg: string }
  label: string
}) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  )
}

function buildPaymentMethodLabel(profile: MerchantSubscriptionBillingProfileViewRecord | null): string {
  if (!profile) return 'Not set'

  if (profile.billing_method === 'card') {
    const brand = profile.card_brand || 'Card'
    const suffix = profile.card_last_four ? `**** ${profile.card_last_four}` : ''
    return [brand, suffix].filter(Boolean).join(' ')
  }

  const bank = profile.bank_name || 'Bank account'
  const suffix = profile.account_number_last_four ? `**** ${profile.account_number_last_four}` : ''
  return [bank, suffix].filter(Boolean).join(' ')
}

function formatTierPrice(monthlyPriceCents: number): string {
  return monthlyPriceCents > 0 ? `${formatMoney(monthlyPriceCents / 100)}/mo` : 'Contact for pricing'
}

function formatTierCapacity(plan: MerchantTierPlanViewRecord): string {
  if (plan.max_locations === null) {
    return `${plan.min_locations ?? 0}+ locations`
  }

  if (plan.min_locations === plan.max_locations) {
    return `${plan.max_locations} location`
  }

  return `${plan.min_locations ?? 0}-${plan.max_locations} locations`
}

function merchantTierHighlights(plan: MerchantTierPlanViewRecord): string[] {
  switch (plan.plan_code) {
    case 'basic':
      return ['Single-location coverage', 'Flat monthly plan visibility', 'Contact Dexa for activation']
    case 'multi_location':
      return ['Supports 2 to 5 locations', 'Flat monthly tier', 'Built for growing merchant groups']
    case 'franchise':
      return ['Supports 6 or more locations', 'Unlimited cap in V1', 'Best fit for large operators']
    default:
      return ['Merchant-wide plan', 'Flat monthly structure', 'Contact Dexa for activation']
  }
}

function usageLabel(planStatus: MerchantPlanStatusView): string {
  const maxLocations = planStatus.plan?.max_locations ?? null
  const count = planStatus.active_location_count

  if (maxLocations === null) {
    return `${count} active locations`
  }

  return `${count} of ${maxLocations} locations used`
}

function SubscriptionSectionButton({
  section,
  active,
  onClick,
}: {
  section: (typeof SUBSCRIPTION_SECTIONS)[number]
  active: boolean
  onClick: () => void
}) {
  const Icon = section.icon

  return (
    <button
      type="button"
      onClick={onClick}
      data-subscription-section={section.id}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-w-max flex-1 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-center transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        active
          ? 'bg-white text-foreground shadow-sm dark:bg-background'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate text-sm font-medium">{section.label}</span>
    </button>
  )
}

export function MerchantSubscriptionOverviewCard({
  merchantName,
}: MerchantSubscriptionOverviewCardProps) {
  const overviewQuery = useMerchantSubscriptionOverview()
  const merchantTierPlansQuery = useMerchantTierPlans()
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [invoicePreviewDocument, setInvoicePreviewDocument] = useState<SubscriptionInvoiceDocumentData | null>(null)
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false)
  const [isInvoicePreviewLoading, setIsInvoicePreviewLoading] = useState(false)
  const [invoiceActionId, setInvoiceActionId] = useState<string | null>(null)
  const [contactModalMode, setContactModalMode] = useState<'plan' | 'hardware' | null>(null)
  const [activeSection, setActiveSection] = useState<SubscriptionSection>('plan')
  const [locationPage, setLocationPage] = useState(1)
  const [openLocationIds, setOpenLocationIds] = useState<string[]>([])

  const devicesRef = useRef<HTMLDivElement | null>(null)
  const sectionNavRef = useRef<HTMLElement | null>(null)
  const isLoading = overviewQuery.isLoading
  const merchantPlanStatus = overviewQuery.data?.merchantPlanStatus ?? EMPTY_PLAN_STATUS
  const locations = overviewQuery.data?.locations ?? EMPTY_LOCATIONS
  const merchantTierPlans: MerchantTierPlanViewRecord[] =
    merchantTierPlansQuery.data ?? overviewQuery.data?.merchantTierPlans ?? []
  const devicesByLocationId = overviewQuery.data?.devicesByLocationId ?? EMPTY_DEVICES_BY_LOCATION
  const invoices = overviewQuery.data?.invoices ?? EMPTY_INVOICES
  const billingProfilesByLocationId =
    overviewQuery.data?.billingProfilesByLocationId ?? EMPTY_BILLING_PROFILES

  const invoicePreviewHtml = useMemo(
    () => (invoicePreviewDocument ? renderSubscriptionInvoiceHtml(invoicePreviewDocument) : ''),
    [invoicePreviewDocument],
  )

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? locations[0] ?? null,
    [locations, selectedLocationId],
  )

  const selectedInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.location_id === selectedLocation?.id),
    [invoices, selectedLocation],
  )

  const selectedBillingProfile = useMemo(
    () => (selectedLocation?.id ? billingProfilesByLocationId[selectedLocation.id] ?? null : null),
    [billingProfilesByLocationId, selectedLocation],
  )

  const usage = useMemo(() => usageLabel(merchantPlanStatus), [merchantPlanStatus])

  const transactionSummary = useMemo(() => {
    const collected = selectedInvoices
      .filter((invoice) => invoice.status === 'paid')
      .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)

    const pending = selectedInvoices
      .filter((invoice) => ['open', 'processing', 'failed'].includes(invoice.status))
      .reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)

    return {
      collected,
      pending,
      count: selectedInvoices.length,
    }
  }, [selectedInvoices])

  const totalLocationPages = Math.max(1, Math.ceil(locations.length / LOCATION_PAGE_SIZE))
  const effectiveLocationPage = Math.min(locationPage, totalLocationPages)
  const paginatedLocations = useMemo(() => {
    const start = (effectiveLocationPage - 1) * LOCATION_PAGE_SIZE
    return locations.slice(start, start + LOCATION_PAGE_SIZE)
  }, [effectiveLocationPage, locations])

  const refresh = async () => {
    const [overviewResult, tierPlansResult] = await Promise.all([
      overviewQuery.refetch(),
      merchantTierPlansQuery.refetch(),
    ])

    const errorMessage =
      overviewResult.error instanceof Error
        ? overviewResult.error.message
        : tierPlansResult.error instanceof Error
          ? tierPlansResult.error.message
          : ''

    if (errorMessage) {
      toast.error(errorMessage || 'Failed to load subscription billing data.')
    }
  }

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

  useEffect(() => {
    if (!window.matchMedia('(max-width: 767px)').matches) return

    const navigation = sectionNavRef.current
    const selectedButton = navigation?.querySelector<HTMLElement>(
      `[data-subscription-section="${activeSection}"]`,
    )

    if (!navigation || !selectedButton) return

    const centeredPosition =
      selectedButton.offsetLeft -
      (navigation.clientWidth - selectedButton.offsetWidth) / 2

    navigation.scrollTo({
      left: Math.max(0, centeredPosition),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  }, [activeSection])

  const toggleLocationOpen = (locationId: string) => {
    setOpenLocationIds((current) =>
      current.includes(locationId) ? current.filter((value) => value !== locationId) : [...current, locationId],
    )
  }

  const focusLocation = (locationId: string) => {
    setSelectedLocationId(locationId)
    setActiveSection('hardware')
    setOpenLocationIds((current) => (current.includes(locationId) ? current : [...current, locationId]))
    setTimeout(() => {
      devicesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const selectLocation = (locationId: string) => {
    setSelectedLocationId(locationId)
    setOpenLocationIds((current) =>
      current.includes(locationId) ? current : [...current, locationId],
    )
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

  const contactRepHref = useMemo(() => {
    const reason = contactModalMode === 'hardware' ? 'hardware request' : 'plan assistance'
    const planName = merchantPlanStatus.plan?.name || 'No active plan'
    const selectedLocationName = selectedLocation?.name || 'No location selected'
    const subject = encodeURIComponent(`Dexa ${reason} - ${merchantName}`)
    const body = encodeURIComponent(
      `Hi Dexa team,\n\n` +
        `Merchant: ${merchantName}\n` +
        `Selected location: ${selectedLocationName}\n` +
        `Current plan: ${planName}\n` +
        `Active locations: ${merchantPlanStatus.active_location_count}\n` +
        `Requested help: ${reason}\n\n` +
        `Please follow up with the next steps.`,
    )

    return `mailto:support@dexaposai.com?subject=${subject}&body=${body}`
  }, [contactModalMode, merchantName, merchantPlanStatus, selectedLocation])

  const planAmountLabel = merchantPlanStatus.plan
    ? merchantPlanStatus.plan.monthly_price_cents > 0
      ? `${formatMoney(merchantPlanStatus.plan.monthly_price_cents / 100)}/mo`
      : 'Contact for pricing'
    : 'Contact your DEXA rep'

  const requiredPlanLabel = merchantPlanStatus.required_plan_code
    ? PLAN_NAME_BY_CODE[merchantPlanStatus.required_plan_code] || merchantPlanStatus.required_plan_code
    : null

  return (
    <PageShell>
      <PageHeader
        title="Subscription & Billing"
        subtitle="Review plan coverage, provisioned hardware, payments, and invoices."
        actions={
          <div className="w-full min-w-0 sm:w-auto">
            <Label htmlFor="merchant-subscriptions-location" className="sr-only">
              Selected location
            </Label>
            <Select
              value={selectedLocation?.id || ''}
              onValueChange={selectLocation}
              disabled={isLoading || locations.length === 0}
            >
              <SelectTrigger
                id="merchant-subscriptions-location"
                className="h-9 w-full min-w-0 rounded-full bg-card px-4 shadow-sm sm:w-[280px]"
              >
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
        }
      />

      {merchantPlanStatus.subscription_status === 'suspended' ? (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-300">
          <div className="font-medium">Your subscription is suspended.</div>
          <div className="mt-1">Contact your DEXA rep to restore billing and reactivate coverage.</div>
        </div>
      ) : null}

      <Panel className="min-w-0 overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="truncate text-lg font-semibold">
                  {merchantPlanStatus.plan?.name || 'Plan not activated'}
                </p>
                {merchantPlanStatus.plan ? (
                  <StatusBadge label={subscriptionStatusLabel(merchantPlanStatus.subscription_status)} />
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {planAmountLabel} · {merchantPlanStatus.active_location_count} locations ·{' '}
                {locations.reduce((sum, location) => sum + location.device_count, 0)} devices
              </p>
            </div>
          </div>

          <nav
            ref={sectionNavRef}
            aria-label="Subscription sections"
            className="mt-4 flex min-w-0 scroll-smooth gap-1 overflow-x-auto rounded-full bg-muted/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {SUBSCRIPTION_SECTIONS.map((section) => (
              <SubscriptionSectionButton
                key={section.id}
                section={section}
                active={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
              />
            ))}
          </nav>
        </div>

          {activeSection === 'plan' ? (
            <div className="min-w-0">
      <PanelSection
        label="Current Plan"
        caption="Read-only visibility into your merchant-wide subscription tier and plan capacity."
        action={
          <Button type="button" className="rounded-full" onClick={() => setContactModalMode('plan')}>
            Manage plan
          </Button>
        }
      >
        <div className="space-y-5">
          {!merchantPlanStatus.plan ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-muted/45 p-4 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">No active plan</div>
                <div className="mt-1">Choose a tier below, then contact Dexa to activate billing coverage for your merchant.</div>
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                {merchantTierPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex min-h-[340px] flex-col rounded-2xl bg-muted/45 p-6"
                  >
                    <div className="text-xl font-semibold">{plan.display_name}</div>
                    <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{formatTierPrice(plan.monthly_price_cents)}</div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      {plan.description || formatTierCapacity(plan)}
                    </div>
                    <div className="mt-6 rounded-xl bg-background/80 px-3 py-2 text-sm font-medium text-foreground">
                      {formatTierCapacity(plan)}
                    </div>
                    <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                      {merchantTierHighlights(plan).map((line) => (
                        <div key={`${plan.id}-${line}`} className="flex items-start gap-2">
                          <div className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-auto pt-8">
                      <Button type="button" className="w-full" onClick={() => setContactModalMode('plan')}>
                        Contact Dexa
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl bg-muted/45 p-4">
                  <div className="text-sm text-muted-foreground">Current Tier</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="text-2xl font-semibold">{merchantPlanStatus.plan.name}</div>
                    <StatusBadge label={merchantPlanStatus.plan.code.replace('_', ' ')} />
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    {merchantPlanStatus.plan.description || 'No description available'}
                  </div>
                </div>

                <div className="rounded-2xl bg-muted/45 p-4">
                  <div className="text-sm text-muted-foreground">Location Coverage</div>
                  <div className="mt-3">
                    <StatusBadge label={usage} />
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    Status:{' '}
                    <span className="font-medium text-foreground">
                      {subscriptionStatusLabel(merchantPlanStatus.subscription_status)}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl bg-muted/45 p-4">
                  <div className="text-sm text-muted-foreground">Next Charge</div>
                  <div className="mt-3 text-2xl font-semibold tabular-nums">{planAmountLabel}</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {formatDate(merchantPlanStatus.current_period_end)}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <div className="text-sm text-muted-foreground">Payment Method</div>
                  <div className="mt-1 font-medium">{buildPaymentMethodLabel(selectedBillingProfile)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Billing Contact</div>
                  <div className="mt-1 font-medium">{selectedBillingProfile?.billing_email || 'Not set'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Selected Location</div>
                  <div className="mt-1 font-medium">{selectedLocation?.name || 'No location selected'}</div>
                </div>
              </div>
            </>
          )}

          {merchantPlanStatus.is_over_limit &&
          merchantPlanStatus.plan &&
          merchantPlanStatus.plan.max_locations !== null ? (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <div className="space-y-2">
                  <div className="font-medium">
                    You are over your plan limit ({merchantPlanStatus.active_location_count}/{merchantPlanStatus.plan.max_locations} locations).
                  </div>
                  <div>Contact us to upgrade{requiredPlanLabel ? ` to ${requiredPlanLabel}` : ''}.</div>
                  <Button type="button" size="sm" onClick={() => setContactModalMode('plan')}>
                    Contact your DEXA rep
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection
        label="Locations"
        caption="All merchant locations covered under the current plan. Click a row to focus billing history and devices."
      >
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading locations...</div>
          ) : locations.length === 0 ? (
            <Empty icon={Building2} title="No locations configured" description="Locations you add will appear here." />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl bg-muted/20 xl:block">
                <Table className="min-w-[760px] [&_td]:px-4 [&_td]:py-3.5 [&_th]:px-4">
                  <TableHeader className="bg-muted/50">
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Name</TableHead>
                      <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Address</TableHead>
                      <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Status</TableHead>
                      <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Device Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_tr]:border-0">
                    {paginatedLocations.map((location) => (
                      <TableRow
                        key={location.id}
                        className="cursor-pointer border-0 transition-colors hover:bg-muted/55"
                        data-state={selectedLocation?.id === location.id ? 'selected' : undefined}
                        onClick={() => focusLocation(location.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{location.name}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatLocationAddress(location)}</TableCell>
                        <TableCell>
                          <StatusBadge label={location.is_active ? 'Active' : 'Inactive'} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{location.device_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                {paginatedLocations.map((location) => (
                  <button
                    key={`location-card-${location.id}`}
                    type="button"
                    onClick={() => focusLocation(location.id)}
                    className={cn(
                      'min-w-0 rounded-2xl bg-muted/45 p-4 text-left transition-colors hover:bg-muted/65',
                      selectedLocation?.id === location.id && 'ring-1 ring-border',
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{location.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {formatLocationAddress(location)}
                        </span>
                      </span>
                      <StatusBadge label={location.is_active ? 'Active' : 'Inactive'} />
                    </div>
                    <span className="mt-4 block text-center text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Devices
                    </span>
                    <span className="mt-1 block text-center text-sm font-medium tabular-nums">
                      {location.device_count}
                    </span>
                  </button>
                ))}
              </div>

              {locations.length > LOCATION_PAGE_SIZE ? (
                <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Showing {(effectiveLocationPage - 1) * LOCATION_PAGE_SIZE + 1}-
                    {Math.min(effectiveLocationPage * LOCATION_PAGE_SIZE, locations.length)} of {locations.length} locations
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                      disabled={effectiveLocationPage === 1}
                      onClick={() => setLocationPage(Math.max(1, effectiveLocationPage - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                      disabled={effectiveLocationPage >= totalLocationPages}
                      onClick={() => setLocationPage(Math.min(totalLocationPages, effectiveLocationPage + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </PanelSection>
            </div>
          ) : null}

          {activeSection === 'hardware' ? (
            <div ref={devicesRef} className="min-w-0">
      <PanelSection
        label="Devices"
        caption="Provisioned Dexa hardware grouped by location. This section is read-only in V1."
        action={
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
            onClick={() => setContactModalMode('hardware')}
          >
            Request hardware
          </Button>
        }
      >
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading hardware...</div>
          ) : locations.length === 0 ? (
            <Empty icon={Monitor} title="No locations available" description="Hardware review needs at least one location." />
          ) : (
            locations.map((location) => {
              const locationDevices = devicesByLocationId[location.id] ?? []
              const isOpen =
                openLocationIds.includes(location.id) ||
                (openLocationIds.length === 0 && selectedLocation?.id === location.id)
              return (
                <Collapsible key={location.id} open={isOpen} onOpenChange={() => toggleLocationOpen(location.id)}>
                  <div className="overflow-hidden rounded-2xl bg-muted/20">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full min-w-0 flex-col gap-3 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 w-full sm:flex-1">
                          <div className="break-words font-medium">{location.name}</div>
                          <div className="mt-0.5 break-words text-sm text-muted-foreground">{formatLocationAddress(location)}</div>
                        </div>
                        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center sm:flex sm:w-auto sm:shrink-0 sm:gap-3">
                          <span aria-hidden="true" className="sm:hidden" />
                          <Badge variant="secondary" className="rounded-full tabular-nums">{locationDevices.length} devices</Badge>
                          <ChevronDown className={`h-4 w-4 justify-self-end transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-4 py-4">
                        {locationDevices.length === 0 ? (
                          <div className="rounded-xl bg-background/60 p-4 text-sm text-muted-foreground">
                            No devices assigned - contact your DEXA rep.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-0 hover:bg-transparent">
                                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Model</TableHead>
                                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Serial</TableHead>
                                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">POS ID</TableHead>
                                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Status</TableHead>
                                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Linked Station</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {locationDevices.map((device) => (
                                  <TableRow key={device.id} className="border-0">
                                    <TableCell>
                                      <div className="flex items-center gap-2 font-medium">
                                        <Monitor className="h-4 w-4 text-muted-foreground" />
                                        {device.model_name}
                                      </div>
                                    </TableCell>
                                    <TableCell>{device.serial_number}</TableCell>
                                    <TableCell>{device.pos_id || 'Not assigned'}</TableCell>
                                    <TableCell>
                                      <Badge variant="secondary" className="rounded-full capitalize">{device.status.replace(/_/g, ' ')}</Badge>
                                    </TableCell>
                                    <TableCell>{device.linked_station_name || 'Not linked'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )
            })
          )}
        </div>
      </PanelSection>
            </div>
          ) : null}

          {activeSection === 'billing' ? (
            <div className="min-w-0">
      <PanelSection label="Payment Method" caption="Billing details for the selected location.">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading payment method...</div>
        ) : (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-2.5">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">{buildPaymentMethodLabel(selectedBillingProfile)}</div>
                <div className="text-sm text-muted-foreground">
                  {selectedBillingProfile?.billing_method === 'card' && selectedBillingProfile?.card_exp_month && selectedBillingProfile?.card_exp_year
                    ? `Expires ${String(selectedBillingProfile.card_exp_month).padStart(2, '0')}/${selectedBillingProfile.card_exp_year}`
                    : selectedBillingProfile?.billing_method === 'ach'
                      ? 'Bank account on file'
                      : 'Payment method setup is handled by your Dexa team.'}
                </div>
              </div>
            </div>
            {selectedBillingProfile?.is_primary ? (
              <Badge variant="secondary" className="rounded-full">Primary</Badge>
            ) : null}
          </div>
        )}
      </PanelSection>

      <PanelSection
        label="Transactions"
        caption={`Subscription payment activity for ${selectedLocation?.name || merchantName}.`}
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-muted/45 p-4">
              <div className="text-sm text-muted-foreground">Collected</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(transactionSummary.collected)}</div>
            </div>
            <div className="rounded-2xl bg-muted/45 p-4">
              <div className="text-sm text-muted-foreground">Pending</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(transactionSummary.pending)}</div>
            </div>
            <div className="rounded-2xl bg-muted/45 p-4">
              <div className="text-sm text-muted-foreground">Transactions</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{transactionSummary.count}</div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading transactions...</div>
          ) : selectedInvoices.length === 0 ? (
            <div className="rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">
              No subscription transactions for this location yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-muted/20">
              <Table>
                <TableHeader>
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Date</TableHead>
                    <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Reference</TableHead>
                    <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Method</TableHead>
                    <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Status</TableHead>
                    <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Invoice</TableHead>
                    <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedInvoices.map((invoice) => {
                    const activityDate = invoice.paid_at || invoice.last_payment_attempt_at || invoice.created_at
                    const reference = invoice.nmi_transaction_id || invoice.last_payment_error || '-'

                    return (
                      <TableRow key={`merchant-txn-${invoice.id}`} className="border-0">
                        <TableCell>{formatDate(activityDate)}</TableCell>
                        <TableCell className="max-w-[300px] truncate text-muted-foreground">{reference}</TableCell>
                        <TableCell className="uppercase">{invoice.billing_method}</TableCell>
                        <TableCell>
                          <StatusBadge label={invoiceStatusLabel(invoice.status)} />
                        </TableCell>
                        <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatMoney(invoice.total_amount)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </PanelSection>

      <PanelSection
        icon={FileText}
        label="Billing History"
        caption="View and download generated invoices for the selected location."
      >
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading invoices...</div>
        ) : selectedInvoices.length === 0 ? (
          <div className="rounded-2xl bg-muted/30 p-4 text-sm text-muted-foreground">
            No invoices have been generated for this location yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-muted/20">
            <Table>
              <TableHeader>
                <TableRow className="border-0 hover:bg-transparent">
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Date</TableHead>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Invoice</TableHead>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Status</TableHead>
                  <TableHead className="text-[0.8125rem] font-normal text-muted-foreground">Description</TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-right text-[0.8125rem] font-normal text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className="border-0">
                    <TableCell>{formatDate(invoice.created_at)}</TableCell>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>
                      <StatusBadge label={invoiceStatusLabel(invoice.status)} />
                    </TableCell>
                    <TableCell>
                      Subscription billing for {selectedLocation?.name || 'selected location'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMoney(invoice.total_amount)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-full px-3 text-xs font-medium shadow-sm"
                          onClick={() => handlePreviewInvoice(invoice.id)}
                          disabled={isInvoicePreviewLoading}
                        >
                          {isInvoicePreviewLoading && invoiceActionId === invoice.id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-full px-3 text-xs font-medium shadow-sm"
                          onClick={() => handleDownloadInvoice(invoice.id)}
                        >
                          {invoiceActionId === invoice.id && !isInvoicePreviewLoading ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Download
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PanelSection>
            </div>
          ) : null}
      </Panel>

      <Dialog open={Boolean(contactModalMode)} onOpenChange={(open) => !open && setContactModalMode(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {contactModalMode === 'hardware' ? 'Request hardware' : 'Manage plan'}
            </DialogTitle>
            <DialogDescription>
              V1 is informational only. Plan changes and hardware requests are handled by your Dexa representative.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 rounded-2xl bg-muted/45 p-4 text-sm">
            <div>
              <div className="font-medium">Merchant</div>
              <div className="text-muted-foreground">{merchantName}</div>
            </div>
            <div>
              <div className="font-medium">Selected location</div>
              <div className="text-muted-foreground">{selectedLocation?.name || 'No location selected'}</div>
            </div>
            <div>
              <div className="font-medium">Current plan</div>
              <div className="text-muted-foreground">{merchantPlanStatus.plan?.name || 'No active plan'}</div>
            </div>
            <div>
              <div className="font-medium">Recommended next step</div>
              <div className="text-muted-foreground">
                {contactModalMode === 'hardware'
                  ? 'Ask your Dexa rep to provision or assign additional hardware to the selected location.'
                  : merchantPlanStatus.is_over_limit && requiredPlanLabel
                    ? `Ask your Dexa rep about upgrading to ${requiredPlanLabel}.`
                    : 'Ask your Dexa rep to review plan pricing, coverage, or billing updates.'}
              </div>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <div className="text-xs text-muted-foreground">
              We prefill the email with your merchant and selected location details.
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setContactModalMode(null)}>
                Close
              </Button>
              <Button asChild className="bg-[#0C4FD1] hover:bg-[#0A45BA]">
                <a href={contactRepHref}>
                  <Mail className="mr-2 h-4 w-4" />
                  Contact your DEXA rep
                </a>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInvoicePreviewOpen} onOpenChange={setIsInvoicePreviewOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Invoice Preview</DialogTitle>
            <DialogDescription>
              Preview the customer-facing subscription invoice layout before downloading it.
            </DialogDescription>
          </DialogHeader>
          {invoicePreviewDocument ? (
            <div className="overflow-hidden rounded-2xl border border-border/60">
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
    </PageShell>
  )
}
