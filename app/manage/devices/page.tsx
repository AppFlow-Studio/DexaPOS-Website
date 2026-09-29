'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, Boxes, HardDrive, Search, ShieldAlert, Truck } from 'lucide-react'

import { useAdminDeviceInventory, useAdminDeviceSummary } from '@/app/manage/hooks/useDeviceRegistry'
import { useDeviceCatalog } from '@/app/manage/hooks/useDeviceCatalog'
import { DeviceRegistryPageHeader } from '@/app/manage/devices/components/DeviceRegistryPageHeader'
import { ManageInLandiConnectButton } from '@/app/manage/devices/components/ManageInLandiConnectButton'
import { PageShell, Panel, PanelSection, StatRow, StatTile } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { useDebounce } from '@/lib/hooks/useDebounce'
import {
  formatDeviceCategory,
  formatDeviceStatus,
  formatMoneyDollars,
  getDeviceCategoryIcon,
} from '@/lib/device-registry/presentation'
import type { AdminDeviceInventoryRow, DeviceCategory, DeviceLifecycleStatus } from '@/types/device-registry'

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

const PAGE_SIZE = 10

function formatDate(date: string | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

function formatCount(value: number) {
  return value.toLocaleString('en-US')
}

function countStatuses(
  summary: Array<{ status: DeviceLifecycleStatus; device_count: number }>,
  targets: DeviceLifecycleStatus[]
) {
  return summary
    .filter((row) => targets.includes(row.status))
    .reduce((total, row) => total + Number(row.device_count), 0)
}

function linkageLabel(device: AdminDeviceInventoryRow) {
  if (device.linked_station_id) return 'Linked to station'
  if (device.linked_payment_terminal_id) return 'Linked to terminal'
  if (device.linked_printer_id) return 'Linked to printer'
  return 'Unlinked'
}

function modelLabel(device: AdminDeviceInventoryRow) {
  return [`${device.manufacturer} ${device.model_name}`, device.model_sku].filter(Boolean).join(' · ')
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

  const inventory = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data])
  const summary = useMemo(() => summaryQuery.data ?? [], [summaryQuery.data])
  const catalogCount = catalogQuery.data?.length ?? 0
  const hasActiveFilters = Boolean(search.trim()) || status !== 'all' || category !== 'all'

  const { pageRows, pagination, setPage } = useClientPagination(inventory, PAGE_SIZE)

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

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setCategory('all')
    setPage(1)
  }

  // A summary that failed to load is unknown, not zero (§4.9).
  const summaryFailed = summaryQuery.isError
  const figure = (value: number) => (summaryFailed ? '—' : formatCount(value))
  const summaryMeta = (meta: string) => (summaryFailed ? 'Summary unavailable' : meta)

  return (
    <PageShell as="div">
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

      <Panel padded>
        <StatRow columns={4}>
          <StatTile
            label="Total devices"
            icon={<Boxes />}
            value={figure(stats.total)}
            meta={summaryMeta('All tracked units')}
            showMetaOnMobile={summaryFailed}
            isLoading={summaryQuery.isLoading}
          />
          <StatTile
            label="Deployed"
            icon={<HardDrive />}
            value={figure(stats.deployed)}
            meta={summaryMeta('Active in production')}
            showMetaOnMobile={summaryFailed}
            isLoading={summaryQuery.isLoading}
          />
          <StatTile
            label="Warehouse / transit"
            icon={<Truck />}
            value={figure(stats.warehouse + stats.shipped)}
            meta={summaryMeta(
              `${formatCount(stats.warehouse)} warehoused, ${formatCount(stats.shipped)} moving`
            )}
            showMetaOnMobile={summaryFailed}
            isLoading={summaryQuery.isLoading}
          />
          <StatTile
            label="Needs attention"
            icon={<ShieldAlert />}
            value={figure(stats.risk)}
            meta={summaryMeta('Repair, loss, or RMA')}
            showMetaOnMobile={summaryFailed}
            isLoading={summaryQuery.isLoading}
          />
        </StatRow>
      </Panel>

      <Panel>
        <PanelSection
          label="Inventory list"
          caption="Search, lifecycle state, merchant ownership, and linkage readiness for every physical unit."
        >
          {/* Toolbar: search left, borderless filter pills right (§5.2). */}
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <div className="relative min-w-0 flex-1 md:min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                className="h-10 pl-9"
                placeholder="Search serial, model, merchant, or location"
                aria-label="Search devices"
              />
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as DeviceLifecycleStatus | 'all')
                  setPage(1)
                }}
              >
                <SelectTrigger
                  aria-label="Status"
                  className="h-9 w-full min-w-0 rounded-full border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none sm:w-[170px]"
                >
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
                onValueChange={(value) => {
                  setCategory(value as DeviceCategory | 'all')
                  setPage(1)
                }}
              >
                <SelectTrigger
                  aria-label="Category"
                  className="h-9 w-full min-w-0 rounded-full border-0 bg-muted/60 px-3 text-[0.8125rem] shadow-none sm:w-[210px]"
                >
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

              {hasActiveFilters ? (
                <Button variant="ghost" size="sm" className="h-9 rounded-full px-3" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 min-w-0">
            {inventoryQuery.isError ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 px-4 py-20 text-center">
                <p className="text-sm font-medium">We hit a snag loading the inventory</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {inventoryQuery.error?.message ?? 'The device registry could not be loaded.'}
                </p>
                <Button variant="outline" size="sm" onClick={() => void inventoryQuery.refetch()}>
                  Retry
                </Button>
              </div>
            ) : inventoryQuery.isLoading ? (
              <InventoryLoading />
            ) : inventory.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 px-4 py-10 text-center">
                <p className="text-sm font-medium">
                  {hasActiveFilters
                    ? 'No devices match these filters'
                    : 'No physical units are registered yet'}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {hasActiveFilters
                    ? 'Clear the search or filters to widen the results.'
                    : catalogCount > 0
                      ? `The catalog has ${formatCount(catalogCount)} model entries, but the registry only lists physical units. Units will appear here once they are added to inventory.`
                      : 'Units will appear here once hardware is added to inventory.'}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link href="/manage/device-catalog">Open catalog</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* 900px of columns fits the content column from `xl` (§5.3, D-23). */}
                <Table variant="data" containerClassName="hidden xl:block" className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Versions</TableHead>
                      <TableHead className="text-right">Monthly fee</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((device) => {
                      const CategoryIcon = getDeviceCategoryIcon(device.device_category)
                      return (
                        <TableRow key={device.id}>
                          <TableCell className="align-top">
                            <div className="flex items-start gap-3">
                              <CategoryIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 space-y-1">
                                <Link
                                  href={`/manage/devices/${device.id}`}
                                  className="font-medium text-foreground underline-offset-4 hover:underline"
                                >
                                  {device.serial_number}
                                </Link>
                                <div className="text-sm text-muted-foreground">{modelLabel(device)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {formatDeviceCategory(device.device_category)}
                                  {device.pos_id ? ` · POS ID ${device.pos_id}` : ''}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="outline" className="w-fit px-2.5 text-xs font-medium">
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
                            <div className="text-sm font-medium">{device.location_name ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">{linkageLabel(device)}</div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="text-sm tabular-nums">FW {device.firmware_version ?? '—'}</div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                              App {device.app_version ?? '—'}
                            </div>
                          </TableCell>
                          <TableCell className="text-right align-top tabular-nums">
                            {formatMoneyDollars(device.monthly_fee)}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="text-sm tabular-nums">{formatDate(device.updated_at)}</div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                              Warranty {formatDate(device.warranty_expires_at)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right align-top">
                            <div className="flex items-center justify-end gap-1">
                              <ManageInLandiConnectButton
                                serialNumber={device.serial_number}
                                variant="ghost"
                                iconOnly
                              />
                              <Button asChild variant="ghost" size="sm">
                                <Link href={`/manage/devices/${device.id}`}>
                                  View
                                  <ArrowRight className="h-4 w-4" />
                                </Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {/* Below `xl` the records become cards; no sideways scroll (§5.3). */}
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                  {pageRows.map((device) => (
                    <DeviceCard key={device.id} device={device} />
                  ))}
                </div>

                <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="devices" />
                {pagination.total <= PAGE_SIZE ? (
                  <p className="mt-4 text-xs text-muted-foreground tabular-nums sm:text-sm">
                    {formatCount(pagination.total)} {pagination.total === 1 ? 'device' : 'devices'}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </PanelSection>
      </Panel>
    </PageShell>
  )
}

function DeviceCard({ device }: { device: AdminDeviceInventoryRow }) {
  return (
    <div className="relative min-w-0 rounded-2xl border-0 bg-muted/45 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Stretched link: the whole card opens the device (§5.3). */}
          <Link
            href={`/manage/devices/${device.id}`}
            className="block truncate font-medium text-foreground after:absolute after:inset-0 after:rounded-2xl after:content-['']"
          >
            {device.serial_number}
          </Link>
          <p className="truncate text-sm text-muted-foreground">{modelLabel(device)}</p>
        </div>
        {/* On a muted card the status is plain text, not a pill (§3.5). */}
        <span className="shrink-0 text-sm font-medium">{formatDeviceStatus(device.status)}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <CardField label="Category" value={formatDeviceCategory(device.device_category)} />
        <CardField label="Merchant" value={device.merchant_name ?? 'DEXA HQ'} />
        <CardField label="Location" value={device.location_name ?? '—'} />
        <CardField label="Linkage" value={linkageLabel(device)} />
        <CardField
          label="Versions"
          value={`FW ${device.firmware_version ?? '—'} · App ${device.app_version ?? '—'}`}
        />
        <CardField label="Monthly fee" value={formatMoneyDollars(device.monthly_fee)} />
        <CardField label="Updated" value={formatDate(device.updated_at)} />
        <CardField label="Warranty" value={formatDate(device.warranty_expires_at)} />
      </dl>

      {/* `relative z-10` lifts the action above the stretched link. */}
      <div className="relative z-10 mt-3 flex justify-end">
        <ManageInLandiConnectButton serialNumber={device.serial_number} variant="ghost" />
      </div>
    </div>
  )
}

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  )
}

/** Skeletons in the final shape at each width (§5.4). */
function InventoryLoading() {
  return (
    <>
      <Table variant="data" containerClassName="hidden xl:block" className="min-w-[900px]">
        <TableBody>
          <TableRow>
            <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
              Loading devices…
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border-0 bg-muted/45 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-32" />
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
              {Array.from({ length: 6 }).map((__, cell) => (
                <Skeleton key={cell} className="h-8 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
