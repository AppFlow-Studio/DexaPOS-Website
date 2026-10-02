'use client'

import { createElement, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LifeBuoy,
  MapPin,
  MessageSquareWarning,
  Monitor,
  Search,
  ShieldAlert,
} from 'lucide-react'

import { useMerchantDeviceActivity, useMerchantDeviceInventory } from '@/app/dashboard/hooks/useDeviceRegistry'
import { useDeviceTicketLinks } from '@/app/dashboard/hooks/useSupport'
import {
  PageHeader,
  PageShell,
  Panel,
  StatRow,
  StatTile,
} from '@/components/dashboard/shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import type { DeviceWarrantyState } from '@/lib/constants/device-status'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { useIsAllLocations, useLocationStore } from '@/stores/location-store'
import type {
  AdminDeviceInventoryRow,
  DeviceActivityItem,
  DeviceLifecycleStatus,
  DeviceSupportTicketLink,
} from '@/types/device-registry'

type MerchantStatusFilter = DeviceLifecycleStatus | 'all' | 'attention' | 'warranty'

/** Where "Report an issue" goes: the support form, pre-filled from the device. */
function reportIssueHref(deviceId: string) {
  return `/dashboard/support/new?device=${encodeURIComponent(deviceId)}`
}

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_merchant: 'Waiting on you',
}

function ticketStatusLabel(status: string) {
  return TICKET_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

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

function warrantyDateLabel(state: DeviceWarrantyState, expiresAt: string | null) {
  if (state === 'unknown' || !expiresAt) return 'No expiry on file'
  return `${state === 'expired' ? 'Ended' : 'Until'} ${formatDate(expiresAt)}`
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
    <div className="flex gap-3 rounded-2xl border border-border/50 bg-secondary p-4">
      <div className="mt-1 rounded-full bg-background p-2 text-muted-foreground">
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

/**
 * The band that shows a device already has a ticket open.
 *
 * A merchant who reported a fault yesterday should not be invited to report it
 * again today — so where there is an open ticket, the conversation becomes the
 * primary action and reporting steps back.
 */
function OpenTicketBand({ ticket }: { ticket: DeviceSupportTicketLink }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-secondary p-4 sm:flex-row sm:items-center">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground">
        <MessageSquareWarning className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          Ticket {ticket.ticket_number} · {ticketStatusLabel(ticket.status)}
        </p>
        <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
          {ticket.subject}
        </p>
      </div>
      <Button asChild size="sm" className="shrink-0 rounded-full">
        <Link href={`/dashboard/support/${ticket.ticket_id}`}>
          View conversation
        </Link>
      </Button>
    </div>
  )
}

function DeviceHistoryDialog({
  device,
  ticket,
  open,
  onOpenChange,
}: {
  device: AdminDeviceInventoryRow | null
  ticket: DeviceSupportTicketLink | null
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

              {/* The registry is read-only, so this is the page's one way out:
                  a merchant looking at a broken device can ask for help here
                  rather than going hunting for the Support section. */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  variant={ticket ? 'outline' : 'default'}
                  className="rounded-full"
                >
                  <Link href={reportIssueHref(device.id)}>
                    <MessageSquareWarning className="mr-2 h-4 w-4" />
                    {ticket ? 'Report another issue' : 'Report an issue'}
                  </Link>
                </Button>
                {!ticket && (
                  <span className="text-[0.8125rem] text-muted-foreground">
                    Goes to DexaPOS support with this device attached.
                  </span>
                )}
              </div>
            </DialogHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-6 p-4 sm:p-6">
                {ticket && <OpenTicketBand ticket={ticket} />}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-border/50 bg-secondary p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Device overview</div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div>Category: <span className="font-medium">{formatDeviceCategory(device.device_category)}</span></div>
                      <div>Location: <span className="font-medium">{device.location_name ?? 'N/A'}</span></div>
                      <div>Warranty: <span className="font-medium">{formatDate(device.warranty_expires_at)}</span></div>
                      <div>Updated: <span className="font-medium">{formatDateTime(device.updated_at)}</span></div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/50 bg-secondary p-4">
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
  ticket,
  onSelect,
}: {
  device: AdminDeviceInventoryRow
  ticket: DeviceSupportTicketLink | null
  onSelect: (device: AdminDeviceInventoryRow) => void
}) {
  const categoryIcon = createElement(
    getDeviceCategoryIcon(device.device_category),
    { className: 'h-5 w-5' }
  )
  const warranty = deviceWarrantyState(device.warranty_expires_at)

  return (
    // The row is a group, not one control: opening the history and asking for
    // help are two destinations, and a link nested inside the row button would
    // be both invalid markup and unreachable by keyboard.
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border/50 bg-secondary transition-colors hover:bg-accent lg:flex-row lg:items-center">
    <button
      type="button"
      onClick={() => onSelect(device)}
      aria-label={`View support history for ${device.serial_number}`}
      className="grid min-w-0 flex-1 gap-4 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[minmax(210px,1.35fr)_minmax(125px,0.8fr)_minmax(145px,0.95fr)_minmax(155px,0.95fr)_auto] lg:items-center"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="shrink-0 rounded-full bg-background p-2.5 text-muted-foreground">
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
        <p className="mt-1 text-xs text-muted-foreground">
          {warrantyDateLabel(warranty.state, device.warranty_expires_at)}
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground lg:hidden">
          Status
        </p>
        <DeviceLifecycleBadge status={device.status} className="mt-1 lg:mt-0" />
        {ticket && (
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            Ticket {ticket.ticket_number} · {ticketStatusLabel(ticket.status)}
          </p>
        )}
      </div>

      {/* The chevron belongs to the row, not to the button beside it — so it
          is labelled and sits inside the row's own control, where it lights up
          with the row on hover. A bare chevron parked next to "Report issue"
          read as that button's menu. */}
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground lg:justify-end">
        <LifeBuoy className="h-4 w-4 shrink-0 lg:hidden" />
        <span className="lg:hidden">View support history</span>
        <span className="hidden lg:inline">History</span>
        <ChevronRight aria-hidden="true" className="hidden h-4 w-4 shrink-0 lg:block" />
      </span>
    </button>

      <div className="flex shrink-0 items-center px-4 pb-4 lg:border-l lg:border-border/60 lg:py-3 lg:pb-0 lg:pl-4 lg:pr-4">
        <Button
          asChild
          size="sm"
          variant="outline"
          className="rounded-full text-xs"
        >
          <Link
            href={
              ticket
                ? `/dashboard/support/${ticket.ticket_id}`
                : reportIssueHref(device.id)
            }
          >
            <MessageSquareWarning className="mr-1.5 h-3.5 w-3.5" />
            {ticket ? 'View ticket' : 'Report issue'}
          </Link>
        </Button>
      </div>
    </div>
  )
}

export default function MerchantDevicesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<MerchantStatusFilter>('all')
  const [selectedDevice, setSelectedDevice] = useState<AdminDeviceInventoryRow | null>(null)

  const debouncedSearch = useDebounce(search, 250)
  const devicesQuery = useMerchantDeviceInventory()
  const ticketLinksQuery = useDeviceTicketLinks()
  const ticketLinks = ticketLinksQuery.data ?? {}
  const isAllLocations = useIsAllLocations()
  const { selectedLocationId } = useLocationStore()

  const devices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data])

  /**
   * Everything the location and the search term allow, before the status
   * filter. The tiles count these: a tile is the control that applies the
   * status filter, so counting post-filter would zero out every tile but the
   * one just pressed.
   */
  const scopedDevices = useMemo(() => {
    const locationScoped =
      isAllLocations || !selectedLocationId || selectedLocationId === 'all'
        ? devices
        : devices.filter((device) => device.location_id === selectedLocationId)

    if (!debouncedSearch.trim()) return locationScoped

    const term = debouncedSearch.trim().toLowerCase()
    return locationScoped.filter((device) =>
      [
        device.serial_number,
        device.manufacturer,
        device.model_name,
        device.model_sku,
        device.location_name,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term))
    )
  }, [debouncedSearch, devices, isAllLocations, selectedLocationId])

  const filteredDevices = useMemo(() => {
    return scopedDevices.filter((device) => {
      if (status === 'attention' && !deviceNeedsAttention(device.status)) return false
      if (status === 'warranty' && !deviceWarrantyIsOnWatch(device.warranty_expires_at)) return false
      if (status !== 'all' && status !== 'attention' && status !== 'warranty' && device.status !== status) {
        return false
      }
      return true
    })
  }, [scopedDevices, status])

  const summary = useMemo(
    () => ({
      total: scopedDevices.length,
      deployed: scopedDevices.filter((device) => device.status === 'deployed').length,
      attention: scopedDevices.filter((device) => deviceNeedsAttention(device.status)).length,
      warranty: scopedDevices.filter((device) => deviceWarrantyIsOnWatch(device.warranty_expires_at)).length,
    }),
    [scopedDevices]
  )

  // Devices in repair, lost or at RMA, named in the band above the list.
  const attentionDevices = useMemo(
    () => scopedDevices.filter((device) => deviceNeedsAttention(device.status)),
    [scopedDevices]
  )

  const hasFilters = Boolean(search.trim()) || status !== 'all'

  return (
    <PageShell>
      <PageHeader
        title="Devices"
        subtitle="The hardware assigned to your business, and how to get help with it."
        actions={
          <Badge variant="secondary" className="h-8 rounded-full px-3 font-normal">
            Managed by DexaPOS
          </Badge>
        }
      />

      <Panel padded>
        {/* Each figure states a count, so it doubles as the control that shows
            the rows behind it. Pressing an applied tile clears back to all. */}
        <StatRow columns={4}>
          <StatTile
            label="All devices"
            value={summary.total}
            meta="Every device in this view"
            icon={<Monitor />}
            isLoading={devicesQuery.isLoading}
            isActive={status === 'all'}
            onClick={() => setStatus('all')}
          />
          <StatTile
            label="Deployed"
            value={summary.deployed}
            meta="Active production hardware"
            icon={<CheckCircle2 />}
            isLoading={devicesQuery.isLoading}
            isActive={status === 'deployed'}
            onClick={() => setStatus(status === 'deployed' ? 'all' : 'deployed')}
          />
          <StatTile
            label="Needs attention"
            value={summary.attention}
            meta="Repair, loss, or RMA"
            icon={<AlertTriangle />}
            isLoading={devicesQuery.isLoading}
            isActive={status === 'attention'}
            onClick={() => setStatus(status === 'attention' ? 'all' : 'attention')}
          />
          <StatTile showMetaOnMobile
            label="Warranty watch"
            value={summary.warranty}
            meta="Expired or within 60 days"
            icon={<ShieldAlert />}
            isLoading={devicesQuery.isLoading}
            isActive={status === 'warranty'}
            onClick={() => setStatus(status === 'warranty' ? 'all' : 'warranty')}
          />
        </StatRow>
      </Panel>

      {/* Urgency is carried by the band, never by colouring a status pill
          (DS-CTL-09). It names the device so the merchant does not have to
          hunt the list for which one broke. */}
      {attentionDevices.length > 0 && (
        <Panel padded>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <AlertTriangle className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {attentionDevices.length === 1
                  ? 'One device needs attention'
                  : `${attentionDevices.length} devices need attention`}
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                {attentionDevices.length === 1
                  ? `${attentionDevices[0].serial_number} (${formatDeviceCategory(
                      attentionDevices[0].device_category
                    )}) is ${deviceLifecycleStatusLabel(
                      attentionDevices[0].status
                    ).toLowerCase()}.`
                  : 'These are in repair, lost, or at RMA.'}
              </p>
            </div>
            {attentionDevices.length === 1 ? (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full"
                onClick={() => setSelectedDevice(attentionDevices[0])}
              >
                View device
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full"
                onClick={() => setStatus('attention')}
              >
                Show them
              </Button>
            )}
          </div>
        </Panel>
      )}

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
              {/* Mirrors the row's two zones so the labels stay over their
                  columns: the row's own grid, then the action column's width. */}
              <div className="hidden items-center pb-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground lg:flex">
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(210px,1.35fr)_minmax(125px,0.8fr)_minmax(145px,0.95fr)_minmax(155px,0.95fr)_auto] gap-4 px-4">
                  <span>Device</span>
                  <span>Location</span>
                  <span>Warranty</span>
                  <span>Status</span>
                  <span className="sr-only">Details</span>
                </div>
                <div className="w-39 shrink-0 pl-4">
                  <span className="sr-only">Actions</span>
                </div>
              </div>
              {filteredDevices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  ticket={ticketLinks[device.id] ?? null}
                  onSelect={setSelectedDevice}
                />
              ))}
            </div>
          )}
        </section>
      </Panel>

      <DeviceHistoryDialog
        device={selectedDevice}
        ticket={selectedDevice ? ticketLinks[selectedDevice.id] ?? null : null}
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
