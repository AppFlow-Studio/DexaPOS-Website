'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Boxes, Clock3, Link2, Package, ShieldAlert } from 'lucide-react'

import { useAdminDeviceActivity, useAdminDeviceDetail } from '@/app/manage/hooks/useDeviceRegistry'
import { DeviceRegistrySectionNav } from '@/app/manage/devices/components/DeviceRegistrySectionNav'
import { DeviceStatusTransitionDialog } from '@/app/manage/devices/components/DeviceStatusTransitionDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  formatDeviceCategory,
  formatDeviceStatus,
  formatMoneyCents,
  getDeviceCategoryIcon,
  getDeviceStatusClasses,
  getTimelineIcon,
} from '@/lib/device-registry/presentation'

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

function formatDate(date: string | null) {
  if (!date) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export default function DeviceDetailPage() {
  const params = useParams<{ deviceId: string }>()
  const deviceId = params?.deviceId ?? ''

  const detailQuery = useAdminDeviceDetail(deviceId)
  const activityQuery = useAdminDeviceActivity(deviceId)

  const device = detailQuery.data
  const activity = activityQuery.data ?? []

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <Skeleton className="h-[260px] w-full" />
          <Skeleton className="h-[260px] w-full" />
        </div>
        <Skeleton className="h-[420px] w-full" />
      </div>
    )
  }

  if (detailQuery.isError || !device) {
    return (
      <Empty
        icon={ShieldAlert}
        title="Device not found"
        description={detailQuery.error?.message ?? 'The selected registry item is unavailable.'}
        action={
          <Button asChild variant="outline">
            <Link href="/manage/devices">Back to inventory</Link>
          </Button>
        }
      />
    )
  }

  const CategoryIcon = getDeviceCategoryIcon(device.device_category)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" className="w-fit px-0 text-muted-foreground hover:bg-transparent">
          <Link href="/manage/devices">
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <DeviceRegistrySectionNav />

        <div className="flex flex-col gap-4 rounded-3xl border bg-card p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border bg-muted/40 p-3 text-muted-foreground">
              <CategoryIcon className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight">{device.serial_number}</h1>
                <Badge
                  variant="outline"
                  className={cn('capitalize', getDeviceStatusClasses(device.status))}
                >
                  {formatDeviceStatus(device.status)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {device.manufacturer} {device.model_name}
                {device.model_sku ? ` | ${device.model_sku}` : ''}
              </p>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span>{formatDeviceCategory(device.device_category)}</span>
                <span>|</span>
                <span>Condition: {device.condition}</span>
                <span>|</span>
                <span>Monthly fee: {formatMoneyCents(device.monthly_fee_cents)}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-2 text-sm text-muted-foreground">
            <div>Merchant: <span className="font-medium text-foreground">{device.merchant_name ?? 'DEXA HQ'}</span></div>
            <div>Location: <span className="font-medium text-foreground">{device.location_name ?? 'N/A'}</span></div>
            <div>Updated: <span className="font-medium text-foreground">{formatDateTime(device.updated_at)}</span></div>
            <div className="pt-2">
              <DeviceStatusTransitionDialog device={device} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>
              Current ownership, software state, warranty, and deployment metadata.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Ownership</div>
              <div className="mt-3 space-y-2 text-sm">
                <div>Merchant: <span className="font-medium">{device.merchant_name ?? 'DEXA HQ'}</span></div>
                <div>Location: <span className="font-medium">{device.location_name ?? 'N/A'}</span></div>
                <div>Purchased: <span className="font-medium">{formatDate(device.purchased_at)}</span></div>
                <div>Warranty: <span className="font-medium">{formatDate(device.warranty_expires_at)}</span></div>
              </div>
            </div>

            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Software</div>
              <div className="mt-3 space-y-2 text-sm">
                <div>Firmware: <span className="font-medium">{device.firmware_version ?? 'N/A'}</span></div>
                <div>App version: <span className="font-medium">{device.app_version ?? 'N/A'}</span></div>
                <div>Last config: <span className="font-medium">{formatDateTime(device.last_config_at)}</span></div>
                <div>MAC: <span className="font-medium">{device.mac_address ?? 'N/A'}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operational linkage</CardTitle>
            <CardDescription>Current bridge into the live operational tables.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-3 rounded-2xl border bg-muted/20 p-4">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Station</div>
                <div className="text-muted-foreground">{device.linked_station_id ?? 'Not linked'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border bg-muted/20 p-4">
              <Package className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Payment terminal</div>
                <div className="text-muted-foreground">
                  {device.linked_payment_terminal_id ?? 'Not linked'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border bg-muted/20 p-4">
              <Boxes className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Printer</div>
                <div className="text-muted-foreground">{device.linked_printer_id ?? 'Not linked'}</div>
              </div>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Procurement
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div>Catalog item: <span className="font-medium">{device.catalog_id}</span></div>
                <div>PO number: <span className="font-medium">{device.purchase_order_number ?? 'N/A'}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity timeline</CardTitle>
          <CardDescription>
            Unified feed of status transitions, configuration changes, and support notes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activityQuery.isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          ) : activityQuery.isError ? (
            <Empty
              icon={Clock3}
              title="Timeline unavailable"
              description={activityQuery.error?.message ?? 'Failed to load device activity.'}
            />
          ) : activity.length === 0 ? (
            <Empty
              icon={Clock3}
              title="No activity yet"
              description="This device has not recorded assignments, config changes, or support notes."
            />
          ) : (
            <div className="space-y-4">
              {activity.map((item) => {
                const TimelineIcon = getTimelineIcon(item)
                return (
                  <div key={`${item.type}-${item.id}`} className="flex gap-4 rounded-2xl border p-4">
                    <div className="mt-1 rounded-full border bg-muted/30 p-2 text-muted-foreground">
                      <TimelineIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="font-medium capitalize">{item.title}</div>
                          {item.subtitle ? (
                            <div className="text-sm text-muted-foreground">{item.subtitle}</div>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(item.occurred_at)}
                        </div>
                      </div>

                      {item.body ? <p className="text-sm text-foreground/90">{item.body}</p> : null}

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {item.actor ? <span>By {item.actor}</span> : null}
                        {'tracking_number' in item && item.tracking_number ? (
                          <span>Tracking {item.tracking_number}</span>
                        ) : null}
                        {'status' in item && item.status ? (
                          <Badge
                            variant="outline"
                            className={cn(getDeviceStatusClasses(item.status))}
                          >
                            {formatDeviceStatus(item.status)}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
