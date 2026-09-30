'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Building2,
  Clock,
  Globe,
  Loader2,
  MapPin,
  Moon,
  Power,
  Save,
  Settings,
  ShoppingCart,
} from 'lucide-react'
import { adminKeys } from '@/lib/queries/admin-keys'
import {
  adminToggleLocationActive,
  adminToggleLocationOrders,
  adminUpdateLocation,
} from '@/app/manage/actions/admin-merchant/locations'
import {
  type BusinessHours,
  DEFAULT_BUSINESS_HOURS,
  type DayHours,
  type Location,
  US_STATES,
  US_TIMEZONES,
} from '@/types/merchant_locations'
import { cn } from '@/lib/utils'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'

interface AdminLocationDetailSheetProps {
  merchantId: string
  location: Location | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type LocationDetailsFormState = {
  name: string
  code: string
  description: string
  phone: string
  email: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  timezone: string
  latitude: number | null
  longitude: number | null
  ein: string
  tax_id: string
  sales_tax_rate: string
  tax_registration_status: NonNullable<Location['tax_registration_status']>
}

const DAYS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
] as const

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2)
  const minutes = (i % 2) * 30
  const value = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  const ampm = hours < 12 ? 'AM' : 'PM'
  return { value, label: `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}` }
})

// Capped at 16rem and never taller than the space left inside the dialog's
// tab body (the select's collisionBoundary).
const TIME_LIST_CLASS = 'max-h-[min(16rem,var(--radix-select-content-available-height))]'

// Overnight close times: 12:00 AM – 6:00 AM (next day), 30-min steps
const OVERNIGHT_CLOSE_OPTIONS = Array.from({ length: 13 }, (_, i) => {
  const totalMinutes = i * 30
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  const hour12 = h === 0 ? 12 : h
  const label = `${hour12}:${m.toString().padStart(2, '0')} AM (next day)`
  return { value, label }
})

/**
 * `locations.business_hours` also holds the storefront shape
 * `{ from, to, enabled, is24Hours }`. Read either shape (the merchant
 * dashboard's HoursTab does the same) so the time selects are never blank.
 */
function readBusinessHours(raw: Location['business_hours']): BusinessHours {
  const hours: BusinessHours = { ...DEFAULT_BUSINESS_HOURS }
  if (!raw) return hours
  DAYS.forEach(({ key }) => {
    const day = raw[key] as (Partial<DayHours> & { from?: string; to?: string; enabled?: boolean }) | undefined
    if (!day) return
    const open = (day.open || day.from || '09:00').slice(0, 5)
    const close = (day.close || day.to || '17:00').slice(0, 5)
    hours[key] = {
      open,
      close,
      is_closed: day.is_closed ?? day.enabled === false,
      is_overnight: day.is_overnight ?? false,
    }
  })
  return hours
}

/** Write both shapes back, matching the merchant dashboard's HoursTab. */
function toStoredBusinessHours(hours: BusinessHours) {
  const stored: Record<string, unknown> = {}
  DAYS.forEach(({ key }) => {
    const day = hours[key]
    if (!day) return
    stored[key] = {
      from: day.open,
      to: day.close,
      enabled: !day.is_closed,
      is24Hours: false,
      open: day.open,
      close: day.close,
      is_closed: day.is_closed,
      is_overnight: day.is_overnight ?? false,
    }
  })
  return stored as BusinessHours
}

export function AdminLocationDetailSheet({
  merchantId,
  location,
  open,
  onOpenChange,
}: AdminLocationDetailSheetProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = React.useState('details')
  const [currentLocation, setCurrentLocation] = React.useState<Location | null>(location)
  const [isSavingDetails, setIsSavingDetails] = React.useState(false)
  const [isSavingHours, setIsSavingHours] = React.useState(false)
  const [isTogglingOrders, setIsTogglingOrders] = React.useState(false)
  const [isTogglingStatus, setIsTogglingStatus] = React.useState(false)
  const [details, setDetails] = React.useState<LocationDetailsFormState>({
    name: '',
    code: '',
    description: '',
    phone: '',
    email: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'US',
    timezone: 'America/New_York',
    latitude: null,
    longitude: null,
    ein: '',
    tax_id: '',
    sales_tax_rate: '',
    tax_registration_status: 'pending',
  })
  const [hours, setHours] = React.useState<BusinessHours>(DEFAULT_BUSINESS_HOURS)
  // The tab body is the collision boundary for the time selects, so their
  // lists size to (and flip within) the dialog instead of the viewport.
  const [tabBody, setTabBody] = React.useState<HTMLDivElement | null>(null)

  React.useEffect(() => {
    setCurrentLocation(location)
    setActiveTab('details')
  }, [location?.id, open])

  React.useEffect(() => {
    if (!currentLocation) return
    setDetails({
      name: currentLocation.name,
      code: currentLocation.code || '',
      description: currentLocation.description || '',
      phone: currentLocation.phone || '',
      email: currentLocation.email || '',
      address_line1: currentLocation.address_line1,
      address_line2: currentLocation.address_line2 || '',
      city: currentLocation.city,
      state: currentLocation.state,
      postal_code: currentLocation.postal_code,
      country: currentLocation.country || 'US',
      timezone: currentLocation.timezone,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      ein: currentLocation.ein || '',
      tax_id: currentLocation.tax_id || '',
      sales_tax_rate:
        currentLocation.sales_tax_rate !== null && currentLocation.sales_tax_rate !== undefined
          ? String((currentLocation.sales_tax_rate * 100).toFixed(4).replace(/\.?0+$/, ''))
          : '',
      tax_registration_status: currentLocation.tax_registration_status || 'pending',
    })
    setHours(readBusinessHours(currentLocation.business_hours))
  }, [currentLocation])

  const invalidateLocation = React.useCallback(
    async (locationId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.merchantDetail(merchantId) }),
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantLocationDetail(merchantId, locationId),
        }),
      ])
    },
    [merchantId, queryClient]
  )

  const applyLocation = React.useCallback(
    async (next: Location) => {
      setCurrentLocation(next)
      await invalidateLocation(next.id)
    },
    [invalidateLocation]
  )

  const handleSaveDetails = async () => {
    if (!currentLocation) return
    if (!details.name.trim() || !details.address_line1.trim() || !details.city.trim() || !details.state) {
      toast.error('Name, address, city, and state are required')
      return
    }
    if (details.sales_tax_rate.trim() !== '') {
      const parsedRate = Number(details.sales_tax_rate)
      if (Number.isNaN(parsedRate) || parsedRate < 0 || parsedRate > 100) {
        toast.error('Sales tax rate must be between 0 and 100')
        return
      }
    }
    setIsSavingDetails(true)
    try {
      const result = await adminUpdateLocation(merchantId, currentLocation.id, {
        name: details.name.trim(),
        code: details.code.trim() || undefined,
        description: details.description.trim() || undefined,
        phone: details.phone.trim() || undefined,
        email: details.email.trim() || undefined,
        address_line1: details.address_line1.trim(),
        address_line2: details.address_line2.trim() || undefined,
        city: details.city.trim(),
        state: details.state,
        postal_code: details.postal_code.trim(),
        country: details.country,
        latitude: details.latitude,
        longitude: details.longitude,
        timezone: details.timezone,
        ein: details.ein.trim() || undefined,
        tax_id: details.tax_id.trim() || undefined,
        sales_tax_rate: details.sales_tax_rate.trim() === '' ? null : Number(details.sales_tax_rate) / 100,
        tax_registration_status: details.tax_registration_status,
      })
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to update location')
        return
      }
      await applyLocation(result.data)
      toast.success('Location details updated')
    } finally {
      setIsSavingDetails(false)
    }
  }

  const handleSaveHours = async () => {
    if (!currentLocation) return
    setIsSavingHours(true)
    try {
      const result = await adminUpdateLocation(merchantId, currentLocation.id, {
        business_hours: toStoredBusinessHours(hours),
      })
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to update business hours')
        return
      }
      await applyLocation(result.data)
      toast.success('Business hours updated')
    } finally {
      setIsSavingHours(false)
    }
  }

  const handleToggleOrders = async () => {
    if (!currentLocation) return
    setIsTogglingOrders(true)
    try {
      const result = await adminToggleLocationOrders(merchantId, currentLocation.id)
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to update order status')
        return
      }
      await applyLocation(result.data)
      toast.success(result.data.is_accepting_orders ? 'Orders enabled' : 'Orders disabled')
    } finally {
      setIsTogglingOrders(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!currentLocation) return
    if (currentLocation.is_active) {
      const confirmed = window.confirm(`Deactivate "${currentLocation.name}"?`)
      if (!confirmed) return
    }
    setIsTogglingStatus(true)
    try {
      const result = await adminToggleLocationActive(merchantId, currentLocation.id)
      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to update location status')
        return
      }
      await applyLocation(result.data)
      toast.success(result.data.is_active ? 'Location activated' : 'Location deactivated')
    } finally {
      setIsTogglingStatus(false)
    }
  }

  const handleDefaultsToggle = async (checked: boolean) => {
    if (!currentLocation) return
    const result = await adminUpdateLocation(merchantId, currentLocation.id, {
      use_merchant_pricing_defaults: checked,
    })
    if (!result.success || !result.data) {
      toast.error(result.error || 'Failed to update pricing defaults')
      return
    }
    await applyLocation(result.data)
    toast.success(checked ? 'Using merchant defaults' : 'Using location pricing')
  }

  const handleStrategyChange = async (value: 'manual' | 'dual') => {
    if (!currentLocation) return
    const result = await adminUpdateLocation(merchantId, currentLocation.id, { pricing_strategy: value })
    if (!result.success || !result.data) {
      toast.error(result.error || 'Failed to update pricing strategy')
      return
    }
    await applyLocation(result.data)
    toast.success('Pricing strategy updated')
  }

  const handleDualPercentageBlur = async (value: string) => {
    if (!currentLocation) return
    const parsed = Number(value)
    if (Number.isNaN(parsed) || parsed === parseFloat(String(currentLocation.dual_pricing_percentage ?? 0))) return
    const result = await adminUpdateLocation(merchantId, currentLocation.id, {
      dual_pricing_percentage: parsed,
    })
    if (!result.success || !result.data) {
      toast.error(result.error || 'Failed to update dual pricing percentage')
      return
    }
    await applyLocation(result.data)
    toast.success('Dual pricing percentage updated')
  }

  const handleHourChange = (day: keyof BusinessHours, updates: Partial<DayHours>) => {
    setHours((prev) => ({
      ...prev,
      [day]: {
        ...(prev[day] || DEFAULT_BUSINESS_HOURS[day] || { open: '09:00', close: '17:00', is_closed: false }),
        ...updates,
      },
    }))
  }

  if (!currentLocation) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* §12/§13.1: a centred dialog, not a side sheet, and full-screen below
          `sm` (it is an editor). The content clips; the tab body scrolls. */}
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 max-sm:overflow-hidden sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-4xl sm:rounded-3xl">
        <DialogHeader className="shrink-0 px-6 pb-4 pr-14 pt-6 text-left">
          <div className="flex items-start gap-4">
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground sm:flex">
              <MapPin className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-2xl">{currentLocation.name}</DialogTitle>
                {currentLocation.code ? <Badge variant="outline" className="font-mono text-xs">{currentLocation.code}</Badge> : null}
                <Badge variant="outline">
                  {currentLocation.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant="outline">
                  {currentLocation.is_accepting_orders ? 'Accepting Orders' : 'Orders Paused'}
                </Badge>
              </div>
              <DialogDescription className="mt-2">
                {[currentLocation.address_line1, currentLocation.city, currentLocation.state]
                  .filter(Boolean)
                  .join(', ')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col gap-0">
          {/* §4.5 pill rail; classes are the TAB_* literals (C7). */}
          <div className="shrink-0 px-6">
            <div className="w-full min-w-0 overflow-x-auto pb-1">
              <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                <TabsTrigger value="details" className="shrink-0 gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"><Building2 className="h-4 w-4" />Details</TabsTrigger>
                <TabsTrigger value="hours" className="shrink-0 gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"><Clock className="h-4 w-4" />Hours</TabsTrigger>
                <TabsTrigger value="settings" className="shrink-0 gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"><Settings className="h-4 w-4" />Settings</TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div ref={setTabBody} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
            <TabsContent value="details" className="mt-0">
              <DialogSection label="Location Details" caption="Edit the full location profile from HQ">
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input value={details.name} onChange={(e) => setDetails((p) => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Code</Label>
                      <Input value={details.code} onChange={(e) => setDetails((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Description</Label>
                      <Textarea rows={3} value={details.description} onChange={(e) => setDetails((p) => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={details.phone} onChange={(e) => setDetails((p) => ({ ...p, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={details.email} onChange={(e) => setDetails((p) => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Address Line 1</Label>
                      <AddressAutocomplete
                        value={details.address_line1}
                        onInputChange={(v) => setDetails((p) => ({ ...p, address_line1: v }))}
                        onAddressSelected={(parts) => setDetails((p) => ({
                          ...p,
                          address_line1: parts.address_line1,
                          city: parts.city,
                          state: parts.state,
                          postal_code: parts.postal_code,
                          country: parts.country || 'US',
                          latitude: parts.latitude,
                          longitude: parts.longitude,
                        }))}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Address Line 2</Label>
                      <Input value={details.address_line2} onChange={(e) => setDetails((p) => ({ ...p, address_line2: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input value={details.city} onChange={(e) => setDetails((p) => ({ ...p, city: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Select value={details.state} onValueChange={(value) => setDetails((p) => ({ ...p, state: value }))}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select state" /></SelectTrigger>
                        <SelectContent>{US_STATES.map((state) => <SelectItem key={state.code} value={state.code}>{state.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Postal Code</Label>
                      <Input value={details.postal_code} onChange={(e) => setDetails((p) => ({ ...p, postal_code: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <Select value={details.timezone} onValueChange={(value) => setDetails((p) => ({ ...p, timezone: value }))}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{US_TIMEZONES.map((timezone) => <SelectItem key={timezone.value} value={timezone.value}>{timezone.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>EIN</Label>
                      <Input value={details.ein} onChange={(e) => setDetails((p) => ({ ...p, ein: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Tax ID</Label>
                      <Input value={details.tax_id} onChange={(e) => setDetails((p) => ({ ...p, tax_id: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Sales Tax Rate</Label>
                      <Input type="number" step="0.01" min="0" max="100" className="tabular-nums" value={details.sales_tax_rate} onChange={(e) => setDetails((p) => ({ ...p, sales_tax_rate: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Registration Status</Label>
                      <Select
                        value={details.tax_registration_status}
                        onValueChange={(value: LocationDetailsFormState['tax_registration_status']) =>
                          setDetails((p) => ({ ...p, tax_registration_status: value }))
                        }
                      >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="verified">Verified</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleSaveDetails} disabled={isSavingDetails}>
                    {isSavingDetails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Details
                  </Button>
                </div>
              </DialogSection>
            </TabsContent>

            <TabsContent value="hours" className="mt-0">
              <DialogSection label="Business Hours" caption="Update operating hours for each day">
                <div className="space-y-3">
                  {DAYS.map(({ key, label }) => {
                    const day = hours[key] || DEFAULT_BUSINESS_HOURS[key] || { open: '09:00', close: '17:00', is_closed: false, is_overnight: false }
                    const isOvernight = day.is_overnight ?? false
                    const closeOptions = isOvernight ? OVERNIGHT_CLOSE_OPTIONS : TIME_OPTIONS

                    const handleOvernightToggle = (checked: boolean) => {
                      if (checked) {
                        const keepClose = day.close <= '06:00' ? day.close : '02:00'
                        handleHourChange(key, { is_overnight: true, close: keepClose })
                      } else {
                        handleHourChange(key, { is_overnight: false, close: '23:00' })
                      }
                    }

                    return (
                      <div key={key} className={cn('rounded-2xl border p-4', day.is_closed && 'bg-muted/40')}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 w-32 shrink-0">
                              <span className="text-sm font-medium">{label}</span>
                              {isOvernight && !day.is_closed && (
                                <Badge variant="outline" className="gap-1 px-1.5 text-xs">
                                  <Moon className="h-2.5 w-2.5" />
                                  Overnight
                                </Badge>
                              )}
                            </div>
                            <Switch checked={!day.is_closed} onCheckedChange={(checked) => handleHourChange(key, { is_closed: !checked })} aria-label={`${label} open`} />
                            <span className="text-sm text-muted-foreground">{day.is_closed ? 'Closed' : 'Open'}</span>
                          </div>
                          <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center', day.is_closed && 'pointer-events-none opacity-40')}>
                            <Select value={day.open} onValueChange={(value) => handleHourChange(key, { open: value })} disabled={day.is_closed}>
                              <SelectTrigger className="w-full tabular-nums sm:w-40" aria-label={`${label} opens`}><SelectValue /></SelectTrigger>
                              <SelectContent collisionBoundary={tabBody} collisionPadding={8} className={TIME_LIST_CLASS}>{TIME_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <span className="text-sm text-muted-foreground text-center">to</span>
                            <Select value={day.close} onValueChange={(value) => handleHourChange(key, { close: value })} disabled={day.is_closed}>
                              <SelectTrigger className="w-full tabular-nums sm:w-44" aria-label={`${label} closes`}><SelectValue /></SelectTrigger>
                              <SelectContent collisionBoundary={tabBody} collisionPadding={8} className={TIME_LIST_CLASS}>{closeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <div className="flex items-center gap-1.5">
                              <Switch
                                id={`overnight-${key}`}
                                checked={isOvernight}
                                onCheckedChange={handleOvernightToggle}
                                disabled={day.is_closed}
                              />
                              <Label htmlFor={`overnight-${key}`} className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                                Closes next day
                              </Label>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <Button onClick={handleSaveHours} disabled={isSavingHours}>
                    {isSavingHours ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Hours
                  </Button>
                </div>
              </DialogSection>
            </TabsContent>

            <TabsContent value="settings" className="mt-0 space-y-8">
              <DialogSection
                icon={ShoppingCart}
                label="Order Settings"
                caption="Control whether this location accepts orders"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{currentLocation.is_accepting_orders ? 'Accepting orders' : 'Orders paused'}</p>
                    <p className="text-sm text-muted-foreground">
                      {currentLocation.is_accepting_orders ? 'Customers can place orders here' : 'New orders are currently disabled'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {isTogglingOrders ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                    <Switch aria-label="Accepting orders" checked={currentLocation.is_accepting_orders} onCheckedChange={handleToggleOrders} disabled={isTogglingOrders || !currentLocation.is_active} />
                  </div>
                </div>
              </DialogSection>

              <DialogSection
                icon={Globe}
                label="Pricing & Menu"
                caption="Inheritance and pricing strategy"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-muted/60 px-4 py-3">
                    <div>
                      <p className="font-medium">Use Merchant Pricing Defaults</p>
                      <p className="text-sm text-muted-foreground">Inherit pricing behavior from merchant defaults</p>
                    </div>
                    <Switch aria-label="Use merchant pricing defaults" checked={currentLocation.use_merchant_pricing_defaults} onCheckedChange={handleDefaultsToggle} />
                  </div>
                  {!currentLocation.use_merchant_pricing_defaults ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Pricing Strategy</Label>
                        <Select value={currentLocation.pricing_strategy || 'manual'} onValueChange={(value) => handleStrategyChange(value as 'manual' | 'dual')}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual Pricing</SelectItem>
                            <SelectItem value="dual">Dual Pricing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Dual Pricing Percentage</Label>
                        <Input type="number" min="0" max="100" step="0.01" className="tabular-nums" defaultValue={currentLocation.dual_pricing_percentage ?? 4} onBlur={(e) => handleDualPercentageBlur(e.target.value)} disabled={currentLocation.pricing_strategy !== 'dual'} />
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                    Menu mode: {currentLocation.uses_global_menu ? 'Using merchant global menu' : 'Using location-specific menu'}
                  </div>
                </div>
              </DialogSection>

              <DialogSection
                icon={Power}
                label="Location Status"
                caption="Activate or deactivate this location"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{currentLocation.is_active ? 'Active' : 'Inactive'}</p>
                    <p className="text-sm text-muted-foreground">
                      {currentLocation.is_active ? 'This location is operational and visible' : 'This location is hidden and unavailable'}
                    </p>
                  </div>
                  <Button variant={currentLocation.is_active ? 'outline' : 'default'} onClick={handleToggleStatus} disabled={isTogglingStatus}>
                    {isTogglingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Power className="mr-2 h-4 w-4" />}
                    {currentLocation.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </DialogSection>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A headed section inside the dialog. A dialog is already the tier-1 surface,
 * so its sections are plain spaced blocks with the brand-blue heading (§3.1,
 * §3.2) — never a `Panel` inside the panel. The literal accent classes live
 * here, in the `.tsx` (C7).
 */
function DialogSection({
  icon: Icon,
  label,
  caption,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  caption?: string
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0 space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
          {Icon && <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" />}
          {label}
        </h3>
        {caption && <p className="mt-1 text-sm text-muted-foreground max-sm:hidden">{caption}</p>}
      </div>
      {children}
    </section>
  )
}
