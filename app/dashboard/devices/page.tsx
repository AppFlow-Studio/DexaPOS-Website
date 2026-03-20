'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  MapPin,
  Monitor,
  Search,
  ShieldAlert,
  Wrench,
} from 'lucide-react'

import { useMerchantDeviceActivity, useMerchantDeviceInventory } from '@/app/dashboard/hooks/useDeviceRegistry'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatDeviceCategory,
  formatDeviceStatus,
  getDeviceCategoryIcon,
  getDeviceStatusClasses,
  getTimelineIcon,
} from '@/lib/device-registry/presentation'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { useIsAllLocations, useLocationStore, useSelectedLocation } from '@/stores/location-store'
import type {
  AdminDeviceInventoryRow,
  DeviceActivityItem,
  DeviceLifecycleStatus,
} from '@/types/device-registry'

type MerchantStatusFilter = DeviceLifecycleStatus | 'all' | 'attention' | 'warranty'

const STATUS_FILTERS: Array<{ value: MerchantStatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'deployed', label: 'Deployed' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'warranty', label: 'Warranty watch' },
  { value: 'in_warehouse', label: 'In warehouse' },
  { value: 'allocated', label: 'Allocated' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'provisioning', label: 'Provisioning' },
  { value: 'in_repair', label: 'In repair' },
  { value: 'decommissioned', label: 'Decommissioned' },
  { value: 'lost', label: 'Lost' },
  { value: 'rma', label: 'RMA' },
]

function formatDate(date: string | null) {
  if (!date) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function formatDateTime(date: string | null) {
  if (!date) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))
}

function needsAttention(status: DeviceLifecycleStatus) {
  return status === 'in_repair' || status === 'lost' || status === 'rma'
}

function isWarrantyWatch(date: string | null) {
  if (!date) return false

  const target = new Date(date)
  const now = new Date()
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)

  const diffDays = Math.floor((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
  return diffDays <= 60
}

function getWarrantyState(date: string | null) {
  if (!date) {
    return {
      label: 'Warranty unknown',
      tone: 'border-zinc-200 bg-zinc-100 text-zinc-700',
    }
  }

  const target = new Date(date)
  const now = new Date()
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)

  const diffDays = Math.floor((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

  if (diffDays < 0) {
    return {
      label: 'Warranty expired',
      tone: 'border-red-200 bg-red-50 text-red-700',
    }
  }

  if (diffDays <= 60) {
    return {
      label: `Warranty ends in ${diffDays}d`,
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }

  return {
    label: 'Warranty active',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  loading = false,
}: {
  label: string
  value: number
  detail: string
  icon: React.ElementType
  loading?: boolean
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="flex items-start justify-between p-5">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">{label}</div>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-3xl font-semibold tracking-tight">{value}</div>
          )}
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
        <div className="rounded-2xl border bg-muted/40 p-3 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function ActivityRow({ item }: { item: DeviceActivityItem }) {
  const TimelineIcon = getTimelineIcon(item)

  return (
    <div className="flex gap-3 rounded-2xl border p-4">
      <div className="mt-1 rounded-full border bg-muted/30 p-2 text-muted-foreground">
        <TimelineIcon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-medium capitalize">{item.title}</div>
            {item.subtitle ? <div className="text-sm text-muted-foreground">{item.subtitle}</div> : null}
          </div>
          <div className="text-xs text-muted-foreground">{formatDateTime(item.occurred_at)}</div>
        </div>

        {item.body ? <p className="text-sm text-foreground/90">{item.body}</p> : null}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {item.actor ? <span>By {item.actor}</span> : null}
          {'tracking_number' in item && item.tracking_number ? <span>Tracking {item.tracking_number}</span> : null}
          {'status' in item && item.status ? (
            <Badge variant="outline" className={cn(getDeviceStatusClasses(item.status))}>
              {formatDeviceStatus(item.status)}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DeviceHistorySheet({
  device,
  open,
  onOpenChange,
}: {
  device: AdminDeviceInventoryRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const activityQuery = useMerchantDeviceActivity(device?.id ?? '', open && Boolean(device?.id))
  const activity = activityQuery.data ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        {!device ? null : (
          <>
            <SheetHeader className="border-b pb-4">
              <div className="flex items-start gap-3 pr-8">
                <div className="rounded-2xl border bg-muted/40 p-3 text-muted-foreground">
                  {(() => {
                    const CategoryIcon = getDeviceCategoryIcon(device.device_category)
                    return <CategoryIcon className="h-5 w-5" />
                  })()}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SheetTitle>{device.serial_number}</SheetTitle>
                    <Badge variant="outline" className={cn(getDeviceStatusClasses(device.status))}>
                      {formatDeviceStatus(device.status)}
                    </Badge>
                    <Badge variant="outline">Read only</Badge>
                  </div>
                  <SheetDescription>
                    {device.manufacturer} {device.model_name} | {device.location_name ?? 'Location pending'}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-6 overflow-y-auto p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Device overview</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div>Category: <span className="font-medium">{formatDeviceCategory(device.device_category)}</span></div>
                    <div>Location: <span className="font-medium">{device.location_name ?? 'N/A'}</span></div>
                    <div>Warranty: <span className="font-medium">{formatDate(device.warranty_expires_at)}</span></div>
                    <div>Updated: <span className="font-medium">{formatDateTime(device.updated_at)}</span></div>
                  </div>
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Support metadata</div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div>Firmware: <span className="font-medium">{device.firmware_version ?? 'N/A'}</span></div>
                    <div>App version: <span className="font-medium">{device.app_version ?? 'N/A'}</span></div>
                    <div>
                      Linked entity:
                      <span className="font-medium">
                        {' '}
                        {device.linked_station_id
                          ? 'Station'
                          : device.linked_payment_terminal_id
                            ? 'Payment terminal'
                            : device.linked_printer_id
                              ? 'Printer'
                              : 'Pending linkage'}
                      </span>
                    </div>
                    <div>MAC: <span className="font-medium">{device.mac_address ?? 'N/A'}</span></div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-base font-medium">Support history</div>
                  <div className="text-sm text-muted-foreground">
                    Read-only timeline of assignments, configuration changes, and support notes.
                  </div>
                </div>

                {activityQuery.isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-20 w-full" />
                    ))}
                  </div>
                ) : activityQuery.isError ? (
                  <Empty
                    icon={LifeBuoy}
                    title="Support history unavailable"
                    description={activityQuery.error?.message ?? 'Device activity could not be loaded.'}
                  />
                ) : activity.length === 0 ? (
                  <Empty
                    icon={Clock3}
                    title="No support history yet"
                    description="This device does not have recorded assignments, configuration changes, or support notes yet."
                  />
                ) : (
                  <div className="space-y-3">
                    {activity.map((item) => (
                      <ActivityRow key={`${item.type}-${item.id}`} item={item} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default function MerchantDevicesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<MerchantStatusFilter>('all')
  const [selectedDevice, setSelectedDevice] = useState<AdminDeviceInventoryRow | null>(null)

  const debouncedSearch = useDebounce(search, 250)
  const devicesQuery = useMerchantDeviceInventory()
  const selectedLocation = useSelectedLocation()
  const isAllLocations = useIsAllLocations()
  const { selectedLocationId } = useLocationStore()

  const devices = devicesQuery.data ?? []

  const filteredDevices = useMemo(() => {
    const locationScoped =
      isAllLocations || !selectedLocationId || selectedLocationId === 'all'
        ? devices
        : devices.filter((device) => device.location_id === selectedLocationId)

    return locationScoped.filter((device) => {
      if (status === 'attention' && !needsAttention(device.status)) return false
      if (status === 'warranty' && !isWarrantyWatch(device.warranty_expires_at)) return false
      if (status !== 'all' && status !== 'attention' && status !== 'warranty' && device.status !== status) {
        return false
      }

      if (!debouncedSearch.trim()) return true

      const term = debouncedSearch.trim().toLowerCase()
      return [
        device.serial_number,
        device.manufacturer,
        device.model_name,
        device.model_sku,
        device.location_name,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term))
    })
  }, [debouncedSearch, devices, isAllLocations, selectedLocationId, status])

  const summary = useMemo(
    () => ({
      total: filteredDevices.length,
      deployed: filteredDevices.filter((device) => device.status === 'deployed').length,
      attention: filteredDevices.filter((device) => needsAttention(device.status)).length,
      warranty: filteredDevices.filter((device) => isWarrantyWatch(device.warranty_expires_at)).length,
    }),
    [filteredDevices]
  )

  const hasFilters = Boolean(search.trim()) || status !== 'all'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Devices</h1>
            <Badge variant="outline">Read only</Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Simplified hardware view for the equipment assigned to your business. Use the location selector in the header to narrow the grid.
          </p>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
          {isAllLocations
            ? 'Showing all visible locations in your dashboard scope.'
            : `Showing devices for ${selectedLocation?.name ?? 'the selected location'}.`}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Visible devices"
          value={summary.total}
          detail="Current registry rows in this view"
          icon={Monitor}
          loading={devicesQuery.isLoading}
        />
        <StatCard
          label="Deployed"
          value={summary.deployed}
          detail="Active production hardware"
          icon={CheckCircle2}
          loading={devicesQuery.isLoading}
        />
        <StatCard
          label="Needs attention"
          value={summary.attention}
          detail="Repair, loss, or RMA"
          icon={AlertTriangle}
          loading={devicesQuery.isLoading}
        />
        <StatCard
          label="Warranty watch"
          value={summary.warranty}
          detail="Expired or within 60 days"
          icon={ShieldAlert}
          loading={devicesQuery.isLoading}
        />
      </div>

      <Card className="shadow-sm">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Assigned hardware</CardTitle>
              <CardDescription>
                Card-based device list with clear health and warranty signals.
              </CardDescription>
            </div>

            <div className="flex w-full flex-col gap-3 md:flex-row lg:w-auto">
              <div className="relative min-w-0 flex-1 md:min-w-[260px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Search serial, model, or location"
                />
              </div>

              <Select value={status} onValueChange={(value) => setStatus(value as MerchantStatusFilter)}>
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent align="end">
                  {STATUS_FILTERS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {devicesQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-[240px] w-full rounded-3xl" />
              ))}
            </div>
          ) : devicesQuery.isError ? (
            <Empty
              icon={ShieldAlert}
              title="Device grid unavailable"
              description={devicesQuery.error?.message ?? 'The device registry could not be loaded.'}
            />
          ) : filteredDevices.length === 0 ? (
            <Empty
              icon={Monitor}
              title={hasFilters ? 'No devices match the current filters' : 'No devices are assigned yet'}
              description={
                hasFilters
                  ? 'Reset the search or status filter to widen the result set.'
                  : 'Your merchant dashboard does not have visible device registry rows yet.'
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredDevices.map((device) => {
                const CategoryIcon = getDeviceCategoryIcon(device.device_category)
                const warranty = getWarrantyState(device.warranty_expires_at)

                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => setSelectedDevice(device)}
                    className="text-left"
                  >
                    <Card className="group h-full border-border/70 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="rounded-2xl border bg-muted/40 p-3 text-muted-foreground">
                              <CategoryIcon className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                              <div className="font-semibold tracking-tight">{device.serial_number}</div>
                              <div className="text-sm text-muted-foreground">
                                {device.manufacturer} {device.model_name}
                              </div>
                            </div>
                          </div>
                          <Badge variant="outline" className={cn(getDeviceStatusClasses(device.status))}>
                            {formatDeviceStatus(device.status)}
                          </Badge>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border bg-muted/20 p-3">
                            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Location</div>
                            <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              {device.location_name ?? 'Not assigned'}
                            </div>
                          </div>

                          <div className="rounded-2xl border bg-muted/20 p-3">
                            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Warranty</div>
                            <div className="mt-2">
                              <Badge variant="outline" className={cn(warranty.tone)}>
                                {warranty.label}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 text-sm text-muted-foreground">
                          <div>Category: <span className="font-medium text-foreground">{formatDeviceCategory(device.device_category)}</span></div>
                          <div>
                            Linked to:
                            <span className="font-medium text-foreground">
                              {' '}
                              {device.linked_station_id
                                ? 'Station'
                                : device.linked_payment_terminal_id
                                  ? 'Payment terminal'
                                  : device.linked_printer_id
                                    ? 'Printer'
                                    : 'Pending linkage'}
                            </span>
                          </div>
                          <div>Firmware: <span className="font-medium text-foreground">{device.firmware_version ?? 'N/A'}</span></div>
                        </div>

                        <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <LifeBuoy className="h-4 w-4" />
                            View support history
                          </div>
                          {needsAttention(device.status) ? (
                            <div className="flex items-center gap-1 text-amber-700">
                              <Wrench className="h-4 w-4" />
                              Follow-up needed
                            </div>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <DeviceHistorySheet
        device={selectedDevice}
        open={Boolean(selectedDevice)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDevice(null)
          }
        }}
      />
    </div>
  )
}
