'use client'

import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Boxes, Link2, Package } from 'lucide-react'

import { useAdminDeviceActivity, useAdminDeviceDetail } from '@/app/manage/hooks/useDeviceRegistry'
import { DeviceRegistryPageHeader } from '@/app/manage/devices/components/DeviceRegistryPageHeader'
import { DeviceStatusTransitionDialog } from '@/app/manage/devices/components/DeviceStatusTransitionDialog'
import { ManageInLandiConnectButton } from '@/app/manage/devices/components/ManageInLandiConnectButton'
import { ActivityFeedSkeleton, DeviceDetailSkeleton } from '@/app/manage/devices/components/skeletons'
import { PageHeader, PageShell, Panel, PanelSection, PanelSubLabel } from '@/components/dashboard/shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  formatDeviceCategory,
  formatDeviceStatus,
  formatMoneyDollars,
  getTimelineIcon,
} from '@/lib/device-registry/presentation'

/** The feed is capped on the server at this many events (§5.7). */
const ACTIVITY_LIMIT = 50

function formatDateTime(date: string | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))
}

function formatDate(date: string | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

export default function DeviceDetailPage() {
  // useSearchParams needs a Suspense boundary; the fallback is the route skeleton.
  return (
    <Suspense fallback={<DeviceDetailSkeleton />}>
      <DeviceDetailPageInner />
    </Suspense>
  )
}

function DeviceDetailPageInner() {
  const params = useParams<{ deviceId: string }>()
  const deviceId = params?.deviceId ?? ''
  const searchParams = useSearchParams()

  // The list passes its own state in `back`, so "Back to inventory" returns to
  // the same page and filters (§5.9). It is only ever a query on the list's path.
  const back = searchParams.get('back')
  const backHref = back ? `/manage/devices?${back.replace(/^\?/, '')}` : '/manage/devices'

  const detailQuery = useAdminDeviceDetail(deviceId)
  const activityQuery = useAdminDeviceActivity(deviceId)

  const device = detailQuery.data
  const activity = activityQuery.data ?? []

  if (detailQuery.isLoading) {
    return <DeviceDetailSkeleton />
  }

  if (detailQuery.isError || !device) {
    return (
      <PageShell as="div">
        <PageHeader title="Device unavailable" backHref={backHref} backLabel="Back to inventory" />
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 px-4 py-20 text-center">
          <p className="text-sm font-medium">We couldn&apos;t load this device</p>
          <p className="max-w-md text-xs text-muted-foreground">
            {detailQuery.error?.message ?? 'The selected registry item is unavailable.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {detailQuery.isError ? (
              <Button variant="outline" size="sm" onClick={() => void detailQuery.refetch()}>
                Retry
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={backHref}>Back to inventory</Link>
            </Button>
          </div>
        </div>
      </PageShell>
    )
  }

  const model = [`${device.manufacturer} ${device.model_name}`, device.model_sku]
    .filter(Boolean)
    .join(' · ')

  return (
    <PageShell as="div">
      <DeviceRegistryPageHeader
        title={device.serial_number}
        backHref={backHref}
        showSectionNav={false}
        backLabel="Back to inventory"
        actions={
          <>
            <ManageInLandiConnectButton serialNumber={device.serial_number} />
            <DeviceStatusTransitionDialog device={device} />
          </>
        }
        titleBadge={
          <Badge variant="outline" className="w-fit px-2.5 text-xs font-medium">
            {formatDeviceStatus(device.status)}
          </Badge>
        }
        meta={
          // Phones keep only the serial and its status on the title row; this
          // identity line (model, category, POS ID, update time) drops below `sm`.
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground max-sm:hidden">
            <span className="min-w-0">{model}</span>
            <span>{formatDeviceCategory(device.device_category)}</span>
            {device.pos_id ? <span className="tabular-nums">POS ID {device.pos_id}</span> : null}
            <span className="tabular-nums">Updated {formatDateTime(device.updated_at)}</span>
          </div>
        }
      />

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-3">
        <Panel nested className="lg:col-span-2">
          <PanelSection
            label="Overview"
            caption="Current ownership, software state, warranty, and deployment metadata."
          >
            <div className="grid min-w-0 gap-6 sm:grid-cols-2">
              <div className="min-w-0">
                <PanelSubLabel>Ownership</PanelSubLabel>
                <dl className="space-y-2">
                  <DetailRow label="Merchant" value={device.merchant_name ?? 'DEXA HQ'} />
                  <DetailRow label="Location" value={device.location_name ?? '—'} />
                  <DetailRow label="POS ID" value={device.pos_id ?? '—'} />
                  <DetailRow label="Condition" value={capitalize(device.condition)} />
                  <DetailRow label="Monthly fee" value={formatMoneyDollars(device.monthly_fee)} />
                  <DetailRow label="Purchased" value={formatDate(device.purchased_at)} />
                  <DetailRow label="Warranty" value={formatDate(device.warranty_expires_at)} />
                </dl>
              </div>

              <div className="min-w-0">
                <PanelSubLabel>Software</PanelSubLabel>
                <dl className="space-y-2">
                  <DetailRow label="Firmware" value={device.firmware_version ?? '—'} />
                  <DetailRow label="App version" value={device.app_version ?? '—'} />
                  <DetailRow label="Last config" value={formatDateTime(device.last_config_at)} />
                  <DetailRow label="MAC" value={device.mac_address ?? '—'} mono />
                </dl>
              </div>
            </div>
          </PanelSection>
        </Panel>

        <Panel nested>
          <PanelSection label="Operational linkage" caption="Current bridge into the live operational tables.">
            <ul className="space-y-3">
              <LinkageRow icon={Link2} label="Station" id={device.linked_station_id} />
              <LinkageRow icon={Package} label="Payment terminal" id={device.linked_payment_terminal_id} />
              <LinkageRow icon={Boxes} label="Printer" id={device.linked_printer_id} />
            </ul>

            <PanelSubLabel className="mb-2 mt-6">Procurement</PanelSubLabel>
            <dl className="space-y-2">
              <DetailRow label="Catalog item" value={device.catalog_id} mono />
              <DetailRow label="PO number" value={device.purchase_order_number ?? '—'} />
            </dl>
          </PanelSection>
        </Panel>
      </div>

      <Panel>
        <PanelSection
          label="Activity timeline"
          caption="Status transitions, configuration changes, and support notes, newest first."
        >
          {activityQuery.isLoading ? (
            <>
              <p role="status" className="sr-only">Loading device activity</p>
              <ActivityFeedSkeleton />
            </>
          ) : activityQuery.isError ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 px-4 py-12 text-center">
              <p className="text-sm font-medium">We hit a snag loading this device&apos;s activity</p>
              <p className="max-w-md text-xs text-muted-foreground">
                {activityQuery.error?.message ?? 'Failed to load device activity.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => void activityQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : activity.length === 0 ? (
            <p className="rounded-2xl bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              No activity yet — assignments, config changes, and support notes will appear here.
            </p>
          ) : (
            <>
              {/* A chronological feed may scroll: capped by the viewport here and
                  by the server's event limit (§5.7). */}
              <ol className="thin-scrollbar max-h-[min(60vh,32rem)] space-y-2 overflow-y-auto">
                {activity.map((item) => {
                  const TimelineIcon = getTimelineIcon(item)
                  return (
                    <li key={`${item.type}-${item.id}`} className="flex gap-3 rounded-2xl bg-muted/40 px-4 py-3">
                      <TimelineIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <p className="font-medium capitalize">{item.title}</p>
                            {item.subtitle ? (
                              <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                            ) : null}
                          </div>
                          <time
                            dateTime={item.occurred_at}
                            className="shrink-0 text-xs tabular-nums text-muted-foreground"
                          >
                            {formatDateTime(item.occurred_at)}
                          </time>
                        </div>

                        {item.body ? <p className="text-sm text-foreground/90">{item.body}</p> : null}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {item.actor ? <span>By {item.actor}</span> : null}
                          {'tracking_number' in item && item.tracking_number ? (
                            <span className="tabular-nums">Tracking {item.tracking_number}</span>
                          ) : null}
                          {/* On a muted row the status is a word, not a pill (§3.5). */}
                          {'status' in item && item.status ? (
                            <span>
                              Status <span className="font-medium text-foreground">{formatDeviceStatus(item.status)}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
              {activity.length >= ACTIVITY_LIMIT ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing the latest {ACTIVITY_LIMIT} events.
                </p>
              ) : null}
            </>
          )}
        </PanelSection>
      </Panel>
    </PageShell>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? 'min-w-0 truncate text-right font-mono text-xs'
            : 'min-w-0 truncate text-right font-medium tabular-nums'
        }
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}

function LinkageRow({
  icon: Icon,
  label,
  id,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  id: string | null
}) {
  return (
    <li className="flex min-w-0 items-start gap-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        {id ? (
          <p className="truncate font-mono text-xs text-muted-foreground" title={id}>
            {id}
          </p>
        ) : (
          <p className="text-muted-foreground">Not linked</p>
        )}
      </div>
    </li>
  )
}
