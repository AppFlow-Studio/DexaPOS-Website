'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, Boxes, HardDrive, Search, Settings2, ShieldAlert, Truck } from 'lucide-react'

import { useAdminDeviceInventory, useAdminDeviceSummary } from '@/app/manage/hooks/useDeviceRegistry'
import { useDeviceCatalog } from '@/app/manage/hooks/useDeviceCatalog'
import { DeviceRegistryMetricCard } from '@/app/manage/devices/components/DeviceRegistryMetricCard'
import { DeviceRegistryPageHeader } from '@/app/manage/devices/components/DeviceRegistryPageHeader'
import { Button } from '@/components/ui/button'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { cn } from '@/lib/utils'
import {
  formatDeviceCategory,
  formatDeviceStatus,
  formatMoneyCents,
  getDeviceCategoryIcon,
  getDeviceStatusClasses,
} from '@/lib/device-registry/presentation'
import type { DeviceCategory, DeviceLifecycleStatus } from '@/types/device-registry'

const STATUS_OPTIONS: Array<{ value: DeviceLifecycleStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'in_warehouse', label: 'In Warehouse' },
  { value: 'allocated', label: 'Allocated' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'provisioning', label: 'Provisioning' },
  { value: 'deployed', label: 'Deployed' },
  { value: 'in_repair', label: 'In Repair' },
  { value: 'decommissioned', label: 'Decommissioned' },
  { value: 'lost', label: 'Lost' },
  { value: 'rma', label: 'RMA' },
]

const CATEGORY_OPTIONS: Array<{ value: DeviceCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All categories' },
  { value: 'pos_tablet', label: 'POS Tablet' },
  { value: 'cfd', label: 'Customer-Facing Display' },
  { value: 'kds', label: 'KDS Display' },
  { value: 'payment_terminal', label: 'Payment Terminal' },
  { value: 'receipt_printer', label: 'Receipt Printer' },
  { value: 'kitchen_printer', label: 'Kitchen Printer' },
  { value: 'cash_drawer', label: 'Cash Drawer' },
]

function formatDate(date: string | null) {
  if (!date) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function countStatuses(
  summary: Array<{ status: DeviceLifecycleStatus; device_count: number }>,
  targets: DeviceLifecycleStatus[]
) {
  return summary
    .filter((row) => targets.includes(row.status))
    .reduce((total, row) => total + Number(row.device_count), 0)
}

export default function ManageDevicesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<DeviceLifecycleStatus | 'all'>('all')
  const [category, setCategory] = useState<DeviceCategory | 'all'>('all')
  const debouncedSearch = useDebounce(search, 250)

  const filters = useMemo(
    () => ({
      search: debouncedSearch || null,
      status,
      category,
    }),
    [category, debouncedSearch, status]
  )

  const inventoryQuery = useAdminDeviceInventory(filters)
  const summaryQuery = useAdminDeviceSummary()
  const catalogQuery = useDeviceCatalog()

  const inventory = inventoryQuery.data ?? []
  const summary = summaryQuery.data ?? []
  const catalogCount = catalogQuery.data?.length ?? 0
  const hasActiveFilters = Boolean(search.trim()) || status !== 'all' || category !== 'all'

  const stats = useMemo(() => {
    const total = summary.reduce((count, row) => count + Number(row.device_count), 0)
    return {
      total,
      deployed: countStatuses(summary, ['deployed']),
      warehouse: countStatuses(summary, ['in_warehouse']),
      shipped: countStatuses(summary, ['shipped', 'allocated', 'provisioning']),
      risk: countStatuses(summary, ['in_repair', 'lost', 'rma']),
    }
  }, [summary])

  const isLoading = inventoryQuery.isLoading || summaryQuery.isLoading
  const hasError = inventoryQuery.isError || summaryQuery.isError
  const errorMessage =
    inventoryQuery.error?.message ?? summaryQuery.error?.message ?? 'Failed to load device registry'

  return (
    <div className="space-y-6">
      <DeviceRegistryPageHeader
        title="Fleet inventory"
        description="Track warehouse stock, merchant assignments, and deployment status from one HQ view."
        actions={
          <>
          <Button asChild>
            <Link href="/manage/devices/overview">Open overview</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/manage/device-catalog">Open catalog</Link>
          </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Total devices',
            value: stats.total,
            detail: 'All tracked units',
            icon: Boxes,
          },
          {
            label: 'Deployed',
            value: stats.deployed,
            detail: 'Active in production',
            icon: HardDrive,
          },
          {
            label: 'Warehouse / transit',
            value: stats.warehouse + stats.shipped,
            detail: `${stats.warehouse} warehoused, ${stats.shipped} moving`,
            icon: Truck,
          },
          {
            label: 'Needs attention',
            value: stats.risk,
            detail: 'Repair, loss, or RMA',
            icon: ShieldAlert,
          },
        ].map((card, index) => (
          <DeviceRegistryMetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            detail={card.detail}
            icon={card.icon}
            loading={isLoading && index < 4}
          />
        ))}
      </div>

      <Card className="gap-0 overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <CardTitle>Inventory list</CardTitle>
              <CardDescription>
                Dense HQ list view for search, lifecycle state, merchant ownership, and linkage readiness.
              </CardDescription>
            </div>

            <div className="flex w-full min-w-0 flex-col gap-3 md:flex-row md:flex-wrap xl:w-auto xl:flex-nowrap">
              <div className="relative min-w-0 flex-1 md:min-w-[260px] xl:min-w-[340px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Search serial, model, merchant, or location"
                />
              </div>

              <Select value={status} onValueChange={(value) => setStatus(value as DeviceLifecycleStatus | 'all')}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent align="end">
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={category}
                onValueChange={(value) => setCategory(value as DeviceCategory | 'all')}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent align="end">
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0">
          {hasError ? (
            <div className="px-6 py-10">
              <Empty
                icon={Settings2}
                title="Inventory list unavailable"
                description={errorMessage}
              />
            </div>
          ) : isLoading ? (
            <div className="space-y-3 px-6 py-6">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : inventory.length === 0 ? (
            <div className="px-6 py-10">
              <Empty
                icon={Boxes}
                title={
                  hasActiveFilters
                    ? 'No devices match the current filters'
                    : 'No physical units are registered yet'
                }
                description={
                  hasActiveFilters
                    ? 'Clear the search or filter set to widen the results.'
                    : catalogCount > 0
                      ? `Device Catalog has ${catalogCount} model entries, but Device Registry only shows physical units from device_inventory. Add inventory rows before expecting devices here.`
                      : 'The registry is backed by device_inventory. Populate that table to start tracking real hardware.'
                }
                action={
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {hasActiveFilters ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearch('')
                          setStatus('all')
                          setCategory('all')
                        }}
                      >
                        Reset filters
                      </Button>
                    ) : null}
                    <Button asChild variant="outline">
                      <Link href="/manage/device-catalog">Open catalog</Link>
                    </Button>
                  </div>
                }
              />
            </div>
          ) : (
            <Table containerClassName="min-h-[480px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Device</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Versions</TableHead>
                  <TableHead>Monthly Fee</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="pr-6 text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.map((device) => {
                  const CategoryIcon = getDeviceCategoryIcon(device.device_category)
                  return (
                    <TableRow key={device.id}>
                      <TableCell className="pl-6 align-top">
                        <div className="flex items-start gap-3">
                          <div className="rounded-xl border bg-muted/40 p-2 text-muted-foreground">
                            <CategoryIcon className="h-4 w-4" />
                          </div>
                          <div className="space-y-1">
                            <Link
                              href={`/manage/devices/${device.id}`}
                              className="font-medium text-foreground transition-colors hover:text-primary"
                            >
                              {device.serial_number}
                            </Link>
                            <div className="text-sm text-muted-foreground">
                              {device.manufacturer} {device.model_name}
                              {device.model_sku ? ` | ${device.model_sku}` : ''}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDeviceCategory(device.device_category)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant="outline"
                          className={cn('capitalize', getDeviceStatusClasses(device.status))}
                        >
                          {formatDeviceStatus(device.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="text-sm font-medium">{device.merchant_name ?? 'DEXA HQ'}</div>
                        <div className="text-xs text-muted-foreground">
                          {device.merchant_id ? 'Assigned merchant' : 'Warehouse stock'}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="text-sm font-medium">{device.location_name ?? 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">
                          {device.linked_station_id
                            ? 'Linked to station'
                            : device.linked_payment_terminal_id
                              ? 'Linked to terminal'
                              : device.linked_printer_id
                                ? 'Linked to printer'
                                : 'Unlinked'}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="text-sm">FW {device.firmware_version ?? 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">
                          App {device.app_version ?? 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">{formatMoneyCents(device.monthly_fee_cents)}</TableCell>
                      <TableCell className="align-top">
                        <div className="text-sm">{formatDate(device.updated_at)}</div>
                        <div className="text-xs text-muted-foreground">
                          Warranty {formatDate(device.warranty_expires_at)}
                        </div>
                      </TableCell>
                      <TableCell className="pr-6 text-right align-top">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/manage/devices/${device.id}`}>
                            View
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
