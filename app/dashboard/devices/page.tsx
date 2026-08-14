'use client'

import { createElement, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LifeBuoy,
  MapPin,
  Monitor,
  Search,
  ShieldAlert,
} from 'lucide-react'

import { useMerchantDeviceActivity, useMerchantDeviceInventory } from '@/app/dashboard/hooks/useDeviceRegistry'
import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
  StatRow,
  StatTile,
} from '@/components/dashboard/shell'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatDeviceCategory,
  getDeviceCategoryIcon,
  getTimelineIcon,
} from '@/lib/device-registry/presentation'
import {
  deviceLifecycleStatusLabel,
  deviceNeedsAttention,
  deviceWarrantyIsOnWatch,
  deviceWarrantyState,
} from '@/lib/constants/device-status'
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

function DeviceLifecycleBadge({
  status,
  className,
}: {
  status: DeviceLifecycleStatus
  className?: string
}) {
  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 border-0 bg-muted text-muted-foreground', className)}
    >
      {deviceLifecycleStatusLabel(status)}
    </Badge>
  )
}

function ActivityRow({ item }: { item: DeviceActivityItem }) {
  const timelineIcon = createElement(getTimelineIcon(item), {
    className: 'h-4 w-4',
  })

  return (
    <div className="flex gap-3 rounded-2xl bg-muted/30 p-4">
      <div className="mt-1 rounded-full bg-background/80 p-2 text-muted-foreground">
        {timelineIcon}
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
            <DeviceLifecycleBadge status={item.status} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function DeviceHistoryDialog({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(800px,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl max-sm:top-1/2 max-sm:right-auto max-sm:bottom-auto max-sm:left-1/2 max-sm:h-[calc(100dvh-2rem)] max-sm:max-w-[calc(100%-2rem)] max-sm:-translate-x-1/2 max-sm:-translate-y-1/2 max-sm:rounded-3xl max-sm:overflow-hidden">
        {!device ? null : (
          <>
            <DialogHeader className="border-b border-border/60 px-5 py-5 pr-14 text-left sm:px-6 sm:pr-16">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-muted/60 p-2.5 text-muted-foreground">
                  {createElement(getDeviceCategoryIcon(device.device_category), {
                    className: 'h-5 w-5',
                  })}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle>{device.serial_number}</DialogTitle>
                    <DeviceLifecycleBadge status={device.status} />
                    <Badge variant="secondary">Read only</Badge>
                  </div>
                  <DialogDescription>
                    {device.manufacturer} {device.model_name} | {device.location_name ?? 'Location pending'}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-6 p-4 sm:p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Device overview</div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div>Category: <span className="font-medium">{formatDeviceCategory(device.device_category)}</span></div>
                      <div>Location: <span className="font-medium">{device.location_name ?? 'N/A'}</span></div>
                      <div>Warranty: <span className="font-medium">{formatDate(device.warranty_expires_at)}</span></div>
                      <div>Updated: <span className="font-medium">{formatDateTime(device.updated_at)}</span></div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-muted/30 p-4">
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
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DeviceRow({
  device,
  onSelect,
}: {
  device: AdminDeviceInventoryRow
  onSelect: (device: AdminDeviceInventoryRow) => void
}) {
  const categoryIcon = createElement(
    getDeviceCategoryIcon(device.device_category),
    { className: 'h-5 w-5' }
  )
  const warranty = deviceWarrantyState(device.warranty_expires_at)

  return (
    <button
      type="button"
      onClick={() => onSelect(device)}
      className="grid w-full min-w-0 gap-4 rounded-2xl bg-muted/25 p-4 text-left transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[minmax(250px,1.5fr)_minmax(150px,0.9fr)_minmax(170px,1fr)_minmax(130px,0.75fr)_auto] lg:items-center"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="shrink-0 rounded-full bg-background/80 p-2.5 text-muted-foreground">
          {categoryIcon}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold tracking-tight">
            {device.serial_number}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {device.manufacturer} {device.model_name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDeviceCategory(device.device_category)}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground lg:hidden">
          Location
        </p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-medium lg:mt-0">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{device.location_name ?? 'Not assigned'}</span>
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground lg:hidden">
          Warranty
        </p>
        <Badge
          variant="secondary"
          className="mt-1 gap-1.5 border-0 bg-muted text-muted-foreground lg:mt-0"
        >
          {warranty.label}
        </Badge>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground lg:hidden">
          Status
        </p>
        <DeviceLifecycleBadge status={device.status} className="mt-1 lg:mt-0" />
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground lg:justify-end">
        <span className="flex items-center gap-1.5 lg:hidden">
          <LifeBuoy className="h-4 w-4" />
          View support history
        </span>
        <ChevronRight className="h-4 w-4" />
      </div>
    </button>
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

  const devices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data])

  const filteredDevices = useMemo(() => {
    const locationScoped =
      isAllLocations || !selectedLocationId || selectedLocationId === 'all'
        ? devices
        : devices.filter((device) => device.location_id === selectedLocationId)

    return locationScoped.filter((device) => {
      if (status === 'attention' && !deviceNeedsAttention(device.status)) return false
      if (status === 'warranty' && !deviceWarrantyIsOnWatch(device.warranty_expires_at)) return false
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
      attention: filteredDevices.filter((device) => deviceNeedsAttention(device.status)).length,
      warranty: filteredDevices.filter((device) => deviceWarrantyIsOnWatch(device.warranty_expires_at)).length,
    }),
    [filteredDevices]
  )

  const hasFilters = Boolean(search.trim()) || status !== 'all'

  return (
    <PageShell>
      <PageHeader
        title="Devices"
        subtitle="Review the hardware assigned to your business and its support history."
        indicator={
          <LocationIndicator
            isAllLocations={isAllLocations}
            locationName={selectedLocation?.name}
          />
        }
        actions={
          <Badge variant="secondary" className="h-8 rounded-full px-3 font-normal">
            Read-only registry
          </Badge>
        }
      />

      <Panel padded>
        <StatRow columns={4}>
          <StatTile
            label="Visible devices"
            value={summary.total}
            meta="Registry rows in this view"
            icon={<Monitor />}
            isLoading={devicesQuery.isLoading}
          />
          <StatTile
            label="Deployed"
            value={summary.deployed}
            meta="Active production hardware"
            icon={<CheckCircle2 />}
            isLoading={devicesQuery.isLoading}
          />
          <StatTile
            label="Needs attention"
            value={summary.attention}
            meta="Repair, loss, or RMA"
            icon={<AlertTriangle />}
            isLoading={devicesQuery.isLoading}
          />
          <StatTile
            label="Warranty watch"
            value={summary.warranty}
            meta="Expired or within 60 days"
            icon={<ShieldAlert />}
            isLoading={devicesQuery.isLoading}
          />
        </StatRow>
      </Panel>

      <Panel className="overflow-hidden">
        <section className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">Assigned hardware</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredDevices.length} device{filteredDevices.length === 1 ? '' : 's'} in the current view.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <div className="relative min-w-0 flex-1 sm:min-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 rounded-full border-0 bg-muted/45 pl-10 shadow-none focus-visible:ring-1"
                placeholder="Search serial, model, or location"
              />
            </div>

            <Select value={status} onValueChange={(value) => setStatus(value as MerchantStatusFilter)}>
              <SelectTrigger className="h-10 w-full rounded-full bg-muted/45 shadow-none sm:w-[220px]">
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
        </section>

        <section className="border-t border-border/60 px-4 py-5 sm:px-6">
          {devicesQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-2xl" />
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
            <div className="space-y-2">
              <div className="hidden grid-cols-[minmax(250px,1.5fr)_minmax(150px,0.9fr)_minmax(170px,1fr)_minmax(130px,0.75fr)_auto] gap-4 px-4 pb-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground lg:grid">
                <span>Device</span>
                <span>Location</span>
                <span>Warranty</span>
                <span>Status</span>
                <span className="sr-only">Actions</span>
              </div>
              {filteredDevices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  onSelect={setSelectedDevice}
                />
              ))}
            </div>
          )}
        </section>
      </Panel>

      <DeviceHistoryDialog
        device={selectedDevice}
        open={Boolean(selectedDevice)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDevice(null)
          }
        }}
      />
    </PageShell>
  )
}
