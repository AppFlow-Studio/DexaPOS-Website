'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, HardDrive, Search, ShieldAlert, Truck } from 'lucide-react'

import { useAdminDeviceInventory, useAdminDeviceSummary } from '@/app/manage/hooks/useDeviceRegistry'
import { useDeviceCatalog } from '@/app/manage/hooks/useDeviceCatalog'
import { DeviceRegistryPageHeader } from '@/app/manage/devices/components/DeviceRegistryPageHeader'
import { ManageInLandiConnectButton } from '@/app/manage/devices/components/ManageInLandiConnectButton'
import { InventoryListSkeleton, InventoryPageSkeleton } from '@/app/manage/devices/components/skeletons'
import { RecordLinkCard, RowLink } from '@/app/manage/transactions/components/ledger-primitives'
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
import { cn } from '@/lib/utils'
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
const INVENTORY_HREF = '/manage/devices'

/*
 * Column tiers (§5.3, D-26). Device, status and merchant are the essentials and
 * show from `md`, with the Landi row action; the rest join as the content
 * column widens. The classes sit on both the head and the cell.
 */
const LG_UP = 'hidden lg:table-cell'
const XL_UP = 'hidden xl:table-cell'
const XXL_UP = 'hidden 2xl:table-cell'

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

function modelLabel(device: AdminDeviceInventoryRow) {
  return [`${device.manufacturer} ${device.model_name}`, device.model_sku].filter(Boolean).join(' · ')
}

function parseOption<T extends string>(value: string | null, options: Array<{ value: T }>, fallback: T): T {
  return options.some((option) => option.value === value) ? (value as T) : fallback
}

export default function ManageDevicesPage() {
  // useSearchParams needs a Suspense boundary; the fallback is the route skeleton.
  return (
    <Suspense fallback={<InventoryPageSkeleton />}>
      <ManageDevicesPageInner />
    </Suspense>
  )
}

function ManageDevicesPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Memo on the string: useSearchParams() returns a new object every render.
  const listQuery = searchParams.toString()
  const params = useMemo(() => new URLSearchParams(listQuery), [listQuery])

  /*
   * The list's search, filters and page live in the URL, so Back from a device
   * returns to the same page of 10 (§5.9). A filter change resets the page.
   */
  const updateParams = useCallback(
    (patch: Record<string, string | null>, { resetPage = true }: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(listQuery)
      let changed = false
      for (const [key, value] of Object.entries(patch)) {
        if (value) {
          if (next.get(key) !== value) {
            next.set(key, value)
            changed = true
          }
        } else if (next.has(key)) {
          next.delete(key)
          changed = true
        }
      }
      if (!changed) return
      if (resetPage) next.delete('page')
      const query = next.toString()
      router.replace(query ? `?${query}` : INVENTORY_HREF, { scroll: false })
    },
    [listQuery, router]
  )

  const status = parseOption(params.get('status'), STATUS_OPTIONS, 'all')
  const category = parseOption(params.get('category'), CATEGORY_OPTIONS, 'all')
  const urlPage = Number(params.get('page')) || 1

  // The search types into local state and reaches the URL once typing settles.
  const [search, setSearch] = useState(() => params.get('q') ?? '')
  const debouncedSearch = useDebounce(search.trim(), 250)
  useEffect(() => {
    updateParams({ q: debouncedSearch || null })
  }, [debouncedSearch, updateParams])

  const filters = useMemo(
    () => ({
      search: params.get('q') || null,
      status,
      category,
    }),
    [category, params, status]
  )

  const inventoryQuery = useAdminDeviceInventory(filters)
  const summaryQuery = useAdminDeviceSummary()
  const catalogQuery = useDeviceCatalog()

  const inventory = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data])
  const summary = useMemo(() => summaryQuery.data ?? [], [summaryQuery.data])
  const catalogCount = catalogQuery.data?.length ?? 0
  const hasActiveFilters = Boolean(search.trim()) || status !== 'all' || category !== 'all'

  const { pageRows, pagination, setPage } = useClientPagination(inventory, PAGE_SIZE, urlPage)
  // The URL is the source of truth for the page; the hook clamps it to the rows.
  useEffect(() => {
    setPage(urlPage)
  }, [setPage, urlPage])
  const goToPage = (page: number) => updateParams({ page: page > 1 ? String(page) : null }, { resetPage: false })

  const deviceHref = (id: string) =>
    `${INVENTORY_HREF}/${id}${listQuery ? `?back=${encodeURIComponent(listQuery)}` : ''}`

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
    updateParams({ q: null, status: null, category: null })
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
        showSectionNav={false}
        actions={
          <Button asChild>
            <Link href="/manage/devices/overview">Open overview</Link>
          </Button>
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
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 pl-9"
                placeholder="Search serial, model, merchant, or location"
                aria-label="Search devices"
              />
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Select
                value={status}
                onValueChange={(value) => updateParams({ status: value === 'all' ? null : value })}
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
                onValueChange={(value) => updateParams({ category: value === 'all' ? null : value })}
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
              <>
                <p role="status" className="sr-only">Loading devices</p>
                <InventoryListSkeleton />
              </>
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
                {/* The table from `md`, rows one line tall and paged at 10, with
                    no scroll of its own (§5.3, §5.7). Each row opens the device's
                    page (§5.9). */}
                <Table variant="data" bounded={false} containerClassName="hidden md:block">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead className={LG_UP}>Location</TableHead>
                      <TableHead className={XL_UP}>Updated</TableHead>
                      <TableHead className={cn(XL_UP, 'text-right')}>Monthly fee</TableHead>
                      <TableHead className={XXL_UP}>Model</TableHead>
                      <TableHead className={XXL_UP}>Versions</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((device) => {
                      const CategoryIcon = getDeviceCategoryIcon(device.device_category)
                      const href = deviceHref(device.id)
                      const categoryLabel = formatDeviceCategory(device.device_category)
                      return (
                        <TableRow key={device.id} className="cursor-pointer" onClick={() => router.push(href)}>
                          {/* Takes the remaining width and truncates, so rows stay one line. */}
                          <TableCell className="w-full max-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <CategoryIcon
                                className="h-4 w-4 shrink-0 text-muted-foreground"
                                aria-label={categoryLabel}
                              />
                              <RowLink
                                href={href}
                                title={`${device.serial_number} · ${modelLabel(device)}`}
                                className="block min-w-0 truncate font-medium"
                              >
                                {device.serial_number}
                              </RowLink>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="whitespace-nowrap">
                              {formatDeviceStatus(device.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-36 truncate text-sm">
                            {device.merchant_name ?? 'DEXA HQ'}
                          </TableCell>
                          <TableCell className={cn(LG_UP, 'max-w-36 truncate text-sm text-muted-foreground')}>
                            {device.location_name ?? '—'}
                          </TableCell>
                          <TableCell className={cn(XL_UP, 'whitespace-nowrap text-sm tabular-nums text-muted-foreground')}>
                            {formatDate(device.updated_at)}
                          </TableCell>
                          <TableCell className={cn(XL_UP, 'whitespace-nowrap text-right tabular-nums')}>
                            {formatMoneyDollars(device.monthly_fee)}
                          </TableCell>
                          <TableCell className={cn(XXL_UP, 'max-w-36 truncate text-sm text-muted-foreground')}>
                            {modelLabel(device)}
                          </TableCell>
                          <TableCell className={cn(XXL_UP, 'whitespace-nowrap text-xs tabular-nums text-muted-foreground')}>
                            FW {device.firmware_version ?? '—'} · App {device.app_version ?? '—'}
                          </TableCell>
                          {/* The row opens the device; the Landi action must not. */}
                          <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                            <ManageInLandiConnectButton
                              serialNumber={device.serial_number}
                              variant="ghost"
                              iconOnly
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {/* Phones (§5.3): serial and status, then who owns it and where.
                    The card opens the device's page, where everything else lives. */}
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
                  {pageRows.map((device) => (
                    <RecordLinkCard
                      key={device.id}
                      href={deviceHref(device.id)}
                      title={device.serial_number}
                      figure={formatDeviceStatus(device.status)}
                      subtitle={[device.merchant_name ?? 'DEXA HQ', device.location_name].filter(Boolean).join(' · ')}
                    />
                  ))}
                </div>

                <PaginationBar pagination={pagination} onPageChange={goToPage} itemLabel="devices" />
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
