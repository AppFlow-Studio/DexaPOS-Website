'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  getMerchantSubscriptionInvoiceDocument,
  getMerchantSubscriptionOverview,
  type MerchantBillingLocationViewRecord,
  type MerchantPlanStatusView,
  type MerchantProvisionedDeviceViewRecord,
  type MerchantSubscriptionBillingProfileViewRecord,
  type MerchantSubscriptionInvoiceViewRecord,
} from '@/app/dashboard/actions/subscription-billing'
import {
  renderSubscriptionInvoiceHtml,
  type SubscriptionInvoiceDocumentData,
} from '@/lib/subscription-billing/invoice-template'
import { downloadSubscriptionInvoicePdf } from '@/lib/subscription-billing/invoice-pdf'

interface MerchantSubscriptionOverviewCardProps {
  merchantName: string
}

const LOCATION_PAGE_SIZE = 10
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

function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'active':
    case 'paid':
      return 'default'
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

function planBadgeClass(status: MerchantPlanStatusView['subscription_status']): string {
  switch (status) {
    case 'active':
      return 'bg-[#0C4FD1] text-white'
    case 'past_due':
      return 'border border-amber-200 bg-amber-100 text-amber-900'
    case 'suspended':
      return 'border border-red-200 bg-red-100 text-red-900'
    case 'cancelled':
      return 'border border-slate-200 bg-slate-100 text-slate-700'
    default:
      return 'border border-slate-200 bg-slate-100 text-slate-700'
  }
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

function usageTone(planStatus: MerchantPlanStatusView): {
  label: string
  className: string
} {
  const maxLocations = planStatus.plan?.max_locations ?? null
  const count = planStatus.active_location_count

  if (maxLocations === null) {
    return {
      label: `${count} active locations`,
      className: 'border border-blue-200 bg-blue-50 text-blue-700',
    }
  }

  if (count > maxLocations) {
    return {
      label: `${count} of ${maxLocations} locations used`,
      className: 'border border-red-200 bg-red-50 text-red-700',
    }
  }

  if (count === maxLocations) {
    return {
      label: `${count} of ${maxLocations} locations used`,
      className: 'border border-amber-200 bg-amber-50 text-amber-800',
    }
  }

  return {
    label: `${count} of ${maxLocations} locations used`,
    className: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  }
}

export function MerchantSubscriptionOverviewCard({
  merchantName,
}: MerchantSubscriptionOverviewCardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [merchantPlanStatus, setMerchantPlanStatus] = useState<MerchantPlanStatusView>({
    plan: null,
    active_location_count: 0,
    is_over_limit: false,
    required_plan_code: null,
    subscription_status: null,
    current_period_end: null,
  })
  const [locations, setLocations] = useState<MerchantBillingLocationViewRecord[]>([])
  const [devicesByLocationId, setDevicesByLocationId] = useState<Record<string, MerchantProvisionedDeviceViewRecord[]>>({})
  const [invoices, setInvoices] = useState<MerchantSubscriptionInvoiceViewRecord[]>([])
  const [billingProfilesByLocationId, setBillingProfilesByLocationId] = useState<
    Record<string, MerchantSubscriptionBillingProfileViewRecord>
  >({})
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [invoicePreviewDocument, setInvoicePreviewDocument] = useState<SubscriptionInvoiceDocumentData | null>(null)
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false)
  const [isInvoicePreviewLoading, setIsInvoicePreviewLoading] = useState(false)
  const [invoiceActionId, setInvoiceActionId] = useState<string | null>(null)
  const [contactModalMode, setContactModalMode] = useState<'plan' | 'hardware' | null>(null)
  const [locationPage, setLocationPage] = useState(1)
  const [openLocationIds, setOpenLocationIds] = useState<string[]>([])

  const devicesRef = useRef<HTMLDivElement | null>(null)

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

  const usage = useMemo(() => usageTone(merchantPlanStatus), [merchantPlanStatus])

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
  const paginatedLocations = useMemo(() => {
    const start = (locationPage - 1) * LOCATION_PAGE_SIZE
    return locations.slice(start, start + LOCATION_PAGE_SIZE)
  }, [locationPage, locations])

  const refresh = async () => {
    setIsLoading(true)
    try {
      const overview = await getMerchantSubscriptionOverview()
      setMerchantPlanStatus(overview.merchantPlanStatus)
      setLocations(overview.locations)
      setDevicesByLocationId(overview.devicesByLocationId)
      setInvoices(overview.invoices)
      setBillingProfilesByLocationId(overview.billingProfilesByLocationId)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load subscription billing data.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (!selectedLocationId && locations[0]?.id) {
      setSelectedLocationId(locations[0].id)
    }
  }, [locations, selectedLocationId])

  useEffect(() => {
    if (!selectedLocation?.id) return
    setOpenLocationIds((current) => (current.includes(selectedLocation.id) ? current : [...current, selectedLocation.id]))
  }, [selectedLocation])

  useEffect(() => {
    if (locationPage > totalLocationPages) {
      setLocationPage(totalLocationPages)
    }
  }, [locationPage, totalLocationPages])

  const toggleLocationOpen = (locationId: string) => {
    setOpenLocationIds((current) =>
      current.includes(locationId) ? current.filter((value) => value !== locationId) : [...current, locationId],
    )
  }

  const focusLocation = (locationId: string) => {
    setSelectedLocationId(locationId)
    setOpenLocationIds((current) => (current.includes(locationId) ? current : [...current, locationId]))
    setTimeout(() => {
      devicesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
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
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Billing</span>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">Subscriptions</span>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Subscription & Billing</h1>
            <p className="text-sm text-muted-foreground">
              Review your current plan, covered locations, provisioned hardware, and billing history.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="merchant-subscriptions-location">Selected Location</Label>
            <Select
              value={selectedLocation?.id || ''}
              onValueChange={setSelectedLocationId}
              disabled={isLoading || locations.length === 0}
            >
              <SelectTrigger id="merchant-subscriptions-location" className="min-w-[280px]">
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
        </div>
      </div>

      {merchantPlanStatus.subscription_status === 'suspended' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="font-medium">Your subscription is suspended.</div>
          <div className="mt-1">Contact your DEXA rep to restore billing and reactivate coverage.</div>
        </div>
      ) : null}

      <Card className="border-slate-200 shadow-none">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-xl">Current Plan</CardTitle>
            <CardDescription>
              Read-only visibility into your merchant-wide subscription tier and plan capacity.
            </CardDescription>
          </div>
          <Button
            type="button"
            className="bg-[#0C4FD1] hover:bg-[#0A45BA]"
            onClick={() => setContactModalMode('plan')}
          >
            Manage plan
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {!merchantPlanStatus.plan ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">No active plan</div>
              <div className="mt-1">Contact your DEXA rep to assign your subscription tier and billing coverage.</div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Plan</div>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-semibold">{merchantPlanStatus.plan.name}</div>
                    <Badge className={planBadgeClass(merchantPlanStatus.subscription_status)}>
                      {merchantPlanStatus.plan.code.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Coverage</div>
                  <Badge variant="outline" className={usage.className}>
                    {usage.label}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Next Billing Date</div>
                  <div className="text-lg font-semibold">{formatDate(merchantPlanStatus.current_period_end)}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Amount</div>
                  <div className="text-lg font-semibold">{planAmountLabel}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Payment Method</div>
                  <div className="text-lg font-semibold">{buildPaymentMethodLabel(selectedBillingProfile)}</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <div className="text-sm text-muted-foreground">Plan Description</div>
                  <div className="mt-1 font-medium">{merchantPlanStatus.plan.description || 'No description available'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="mt-1">
                    <Badge className={planBadgeClass(merchantPlanStatus.subscription_status)}>
                      {(merchantPlanStatus.subscription_status || 'inactive').replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Billing Contact</div>
                  <div className="mt-1 font-medium">{selectedBillingProfile?.billing_email || 'Not set'}</div>
                </div>
              </div>
            </>
          )}

          {merchantPlanStatus.is_over_limit && merchantPlanStatus.plan?.max_locations !== null ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <div className="space-y-2">
                  <div className="font-medium">
                    You are over your plan limit ({merchantPlanStatus.active_location_count}/{merchantPlanStatus.plan.max_locations} locations).
                  </div>
                  <div>Contact us to upgrade{requiredPlanLabel ? ` to ${requiredPlanLabel}` : ''}.</div>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#0C4FD1] hover:bg-[#0A45BA]"
                    onClick={() => setContactModalMode('plan')}
                  >
                    Contact your DEXA rep
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle>Locations</CardTitle>
          <CardDescription>
            All merchant locations covered under the current plan. Click a row to focus billing history and devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading locations...</div>
          ) : locations.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No locations are configured yet.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Device Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLocations.map((location) => (
                      <TableRow
                        key={location.id}
                        className="cursor-pointer"
                        data-state={selectedLocation?.id === location.id ? 'selected' : undefined}
                        onClick={() => focusLocation(location.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{location.name}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatLocationAddress(location)}</TableCell>
                        <TableCell>
                          <Badge variant={location.is_active ? 'outline' : 'secondary'}>
                            {location.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{location.device_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {locations.length > LOCATION_PAGE_SIZE ? (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Showing {(locationPage - 1) * LOCATION_PAGE_SIZE + 1}-
                    {Math.min(locationPage * LOCATION_PAGE_SIZE, locations.length)} of {locations.length} locations
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={locationPage === 1}
                      onClick={() => setLocationPage((current) => Math.max(1, current - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={locationPage >= totalLocationPages}
                      onClick={() => setLocationPage((current) => Math.min(totalLocationPages, current + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card ref={devicesRef} className="border-slate-200 shadow-none">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Devices</CardTitle>
            <CardDescription>
              Provisioned Dexa hardware grouped by location. This section is read-only in V1.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => setContactModalMode('hardware')}>
            Request hardware
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading hardware...</div>
          ) : locations.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No locations available for hardware review.
            </div>
          ) : (
            locations.map((location) => {
              const locationDevices = devicesByLocationId[location.id] ?? []
              const isOpen = openLocationIds.includes(location.id)
              return (
                <Collapsible key={location.id} open={isOpen} onOpenChange={() => toggleLocationOpen(location.id)}>
                  <div className="rounded-lg border">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-4 py-3 text-left"
                      >
                        <div>
                          <div className="font-medium">{location.name}</div>
                          <div className="text-sm text-muted-foreground">{formatLocationAddress(location)}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{locationDevices.length} devices</Badge>
                          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t px-4 py-4">
                        {locationDevices.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            No devices assigned - contact your DEXA rep.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Model</TableHead>
                                  <TableHead>Serial</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Linked Station</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {locationDevices.map((device) => (
                                  <TableRow key={device.id}>
                                    <TableCell>
                                      <div className="flex items-center gap-2 font-medium">
                                        <Monitor className="h-4 w-4 text-muted-foreground" />
                                        {device.model_name}
                                      </div>
                                    </TableCell>
                                    <TableCell>{device.serial_number}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline">{device.status.replace(/_/g, ' ')}</Badge>
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
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>
            Billing details for the selected location.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading payment method...</div>
          ) : (
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border p-2">
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
              {selectedBillingProfile?.is_primary ? <Badge variant="outline">Primary</Badge> : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            Subscription payment activity for {selectedLocation?.name || merchantName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Collected</div>
              <div className="mt-1 text-2xl font-semibold">{formatMoney(transactionSummary.collected)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Pending</div>
              <div className="mt-1 text-2xl font-semibold">{formatMoney(transactionSummary.pending)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Transactions</div>
              <div className="mt-1 text-2xl font-semibold">{transactionSummary.count}</div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading transactions...</div>
          ) : selectedInvoices.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No subscription transactions for this location yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
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
                  {selectedInvoices.map((invoice) => {
                    const activityDate = invoice.paid_at || invoice.last_payment_attempt_at || invoice.created_at
                    const reference = invoice.nmi_transaction_id || invoice.last_payment_error || '-'

                    return (
                      <TableRow key={`merchant-txn-${invoice.id}`}>
                        <TableCell>{formatDate(activityDate)}</TableCell>
                        <TableCell className="max-w-[300px] truncate text-muted-foreground">{reference}</TableCell>
                        <TableCell className="uppercase">{invoice.billing_method}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell className="text-right font-medium">{formatMoney(invoice.total_amount)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Billing History
          </CardTitle>
          <CardDescription>
            View and download generated invoices for the selected location.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading invoices...</div>
          ) : selectedInvoices.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No invoices have been generated for this location yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>{formatDate(invoice.created_at)}</TableCell>
                      <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                      </TableCell>
                      <TableCell>
                        Subscription billing for {selectedLocation?.name || 'selected location'}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(invoice.total_amount)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePreviewInvoice(invoice.id)}
                            disabled={isInvoicePreviewLoading}
                          >
                            {isInvoicePreviewLoading && invoiceActionId === invoice.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="mr-2 h-4 w-4" />
                            )}
                            View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDownloadInvoice(invoice.id)}>
                            {invoiceActionId === invoice.id && !isInvoicePreviewLoading ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="mr-2 h-4 w-4" />
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
        </CardContent>
      </Card>

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
          <div className="space-y-4 rounded-lg border p-4 text-sm">
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
