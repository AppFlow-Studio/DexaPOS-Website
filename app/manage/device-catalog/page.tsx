'use client'

import Link from 'next/link'
import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import Image from 'next/image'
import {
  Boxes,
  Factory,
  Monitor,
  Tablet,
  CreditCard,
  Printer,
  SquareStack,
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Tv,
  UtensilsCrossed,
  ImageIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { DeviceRegistryPageHeader } from '@/app/manage/devices/components/DeviceRegistryPageHeader'
import {
  CardField,
  CardFields,
  FilterSelect,
  LoadError,
  RecordCard,
  RecordCardSkeletons,
} from '@/app/manage/transactions/components/ledger-primitives'
import { PageShell, Panel, PanelSection, StatRow, StatTile } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { cn } from '@/lib/utils'

import {
  useDeviceCatalog,
  useCreateDevice,
  useUpdateDevice,
  useToggleDeviceStatus,
  useDeleteDevice,
} from '../hooks/useDeviceCatalog'
import type {
  DeviceCatalogItem,
  DeviceCategory,
  CreateDeviceCatalogInput,
} from '../actions/device-catalog'

// ============================================================================
// Constants
// ============================================================================

const DEVICE_CATEGORIES: { value: DeviceCategory; label: string; icon: LucideIcon }[] = [
  { value: 'pos_tablet', label: 'POS Tablets', icon: Tablet },
  { value: 'cfd', label: 'Customer Displays', icon: Tv },
  { value: 'kds', label: 'Kitchen Displays', icon: UtensilsCrossed },
  { value: 'payment_terminal', label: 'Payment Terminals', icon: CreditCard },
  { value: 'receipt_printer', label: 'Receipt Printers', icon: Printer },
  { value: 'kitchen_printer', label: 'Kitchen Printers', icon: Printer },
  { value: 'cash_drawer', label: 'Cash Drawers', icon: SquareStack },
]

const CATEGORY_MAP = Object.fromEntries(
  DEVICE_CATEGORIES.map((c) => [c.value, c])
) as Record<DeviceCategory, (typeof DEVICE_CATEGORIES)[number]>

/** Position of each category in the list, so rows read in category order. */
const CATEGORY_ORDER = Object.fromEntries(
  DEVICE_CATEGORIES.map((c, index) => [c.value, index])
) as Record<DeviceCategory, number>

// Singular labels for the form dialog
const CATEGORY_SINGULAR: Record<DeviceCategory, string> = {
  pos_tablet: 'POS Tablet',
  cfd: 'Customer Display',
  kds: 'Kitchen Display',
  payment_terminal: 'Payment Terminal',
  receipt_printer: 'Receipt Printer',
  kitchen_printer: 'Kitchen Printer',
  cash_drawer: 'Cash Drawer',
}

const CATEGORY_FILTER_OPTIONS = DEVICE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))

const STATUS_FILTER_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'discontinued', label: 'Discontinued' },
]

const PAGE_SIZE = 10

// ============================================================================
// Spec field configuration per category
// ============================================================================

type SpecFieldType = 'text' | 'number' | 'switch' | 'select' | 'multi-check'

interface SpecFieldDef {
  key: string
  label: string
  type: SpecFieldType
  placeholder?: string
  options?: string[]
  suffix?: string
}

const CATEGORY_SPEC_FIELDS: Record<DeviceCategory, SpecFieldDef[]> = {
  pos_tablet: [
    { key: 'screen_size', label: 'Screen Size', type: 'text', placeholder: '15.6', suffix: '"' },
    { key: 'resolution', label: 'Resolution', type: 'text', placeholder: '1920x1080' },
    { key: 'ram_gb', label: 'RAM', type: 'number', placeholder: '8', suffix: 'GB' },
    { key: 'os', label: 'Operating System', type: 'text', placeholder: 'Android' },
    { key: 'has_builtin_printer', label: 'Built-in Printer', type: 'switch' },
    { key: 'has_builtin_cfd', label: 'Built-in CFD', type: 'switch' },
    { key: 'has_nfc', label: 'NFC', type: 'switch' },
  ],
  cfd: [
    { key: 'screen_size', label: 'Screen Size', type: 'text', placeholder: '11', suffix: '"' },
    { key: 'resolution', label: 'Resolution', type: 'text', placeholder: '1280x800' },
    { key: 'orientation', label: 'Orientation', type: 'select', options: ['landscape', 'portrait'] },
    { key: 'os', label: 'Operating System', type: 'text', placeholder: 'Android' },
  ],
  kds: [
    { key: 'screen_size', label: 'Screen Size', type: 'text', placeholder: '15.6', suffix: '"' },
    { key: 'resolution', label: 'Resolution', type: 'text', placeholder: '1920x1080' },
    { key: 'os', label: 'Operating System', type: 'text', placeholder: 'Android' },
    { key: 'purpose', label: 'Purpose', type: 'text', placeholder: 'kitchen_display' },
  ],
  payment_terminal: [
    { key: 'form_factor', label: 'Form Factor', type: 'select', options: ['countertop', 'mobile', 'pin-pad'] },
    { key: 'connection', label: 'Connection', type: 'text', placeholder: 'spinapi' },
    { key: 'supports_contactless', label: 'Contactless (NFC)', type: 'switch' },
    { key: 'supports_emv', label: 'EMV Chip', type: 'switch' },
    { key: 'supports_debit', label: 'Debit', type: 'switch' },
    { key: 'supports_ebt', label: 'EBT', type: 'switch' },
    { key: 'cradle', label: 'Cradle Model', type: 'text', placeholder: 'S1F2' },
  ],
  receipt_printer: [
    { key: 'paper_width_mm', label: 'Paper Width', type: 'number', placeholder: '80', suffix: 'mm' },
    { key: 'dpi', label: 'DPI', type: 'number', placeholder: '203' },
    { key: 'interface', label: 'Interfaces', type: 'multi-check', options: ['usb', 'network', 'bluetooth'] },
    { key: 'supports_auto_cut', label: 'Auto-Cut', type: 'switch' },
    { key: 'supports_cash_drawer_kick', label: 'Cash Drawer Kick', type: 'switch' },
  ],
  kitchen_printer: [
    { key: 'paper_width_mm', label: 'Paper Width', type: 'number', placeholder: '76', suffix: 'mm' },
    { key: 'interface', label: 'Interfaces', type: 'multi-check', options: ['usb', 'network', 'bluetooth'] },
    { key: 'supports_auto_cut', label: 'Auto-Cut', type: 'switch' },
    { key: 'impact_printer', label: 'Impact Printer', type: 'switch' },
  ],
  cash_drawer: [
    { key: 'slots_bills', label: 'Bill Slots', type: 'number', placeholder: '5' },
    { key: 'slots_coins', label: 'Coin Slots', type: 'number', placeholder: '8' },
    { key: 'connection', label: 'Connection', type: 'text', placeholder: 'rj11_printer_kick' },
    { key: 'dimensions', label: 'Dimensions', type: 'text', placeholder: '16x16' },
  ],
}

// ============================================================================
// Helpers
// ============================================================================

/** An unset price is unknown, not zero: it renders `—` (§4.9). */
function formatDollars(dollars: number | null): string {
  if (dollars === null || dollars === undefined) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(dollars))
}

function formatCount(value: number) {
  return value.toLocaleString('en-US')
}

function renderSpecsSummary(specs: Record<string, unknown>, category: DeviceCategory): string {
  const parts: string[] = []
  if (category === 'pos_tablet' || category === 'cfd' || category === 'kds') {
    if (specs.screen_size) parts.push(`${specs.screen_size}"`)
    if (specs.resolution) parts.push(specs.resolution as string)
    if (specs.ram_gb) parts.push(`${specs.ram_gb}GB RAM`)
    if (specs.os) parts.push(specs.os as string)
  } else if (category === 'payment_terminal') {
    if (specs.form_factor) parts.push(specs.form_factor as string)
    if (specs.connection) parts.push(specs.connection as string)
    const features: string[] = []
    if (specs.supports_contactless) features.push('NFC')
    if (specs.supports_emv) features.push('EMV')
    if (specs.supports_ebt) features.push('EBT')
    if (features.length) parts.push(features.join('/'))
  } else if (category === 'receipt_printer' || category === 'kitchen_printer') {
    if (specs.paper_width_mm) parts.push(`${specs.paper_width_mm}mm`)
    if (specs.dpi) parts.push(`${specs.dpi}dpi`)
    if (Array.isArray(specs.interface)) parts.push((specs.interface as string[]).join(', '))
  } else if (category === 'cash_drawer') {
    if (specs.slots_bills) parts.push(`${specs.slots_bills} bill slots`)
    if (specs.slots_coins) parts.push(`${specs.slots_coins} coin slots`)
    if (specs.dimensions) parts.push(`${specs.dimensions}"`)
  }
  return parts.join(' · ') || ''
}

function modelSubline(device: DeviceCatalogItem) {
  return [device.manufacturer, device.model_sku].filter(Boolean).join(' · ')
}

function specsFromDevice(specs: Record<string, unknown>): Record<string, string | number | boolean | string[]> {
  const result: Record<string, string | number | boolean | string[]> = {}
  for (const [k, v] of Object.entries(specs)) {
    if (Array.isArray(v)) {
      result[k] = v as string[]
    } else if (typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') {
      result[k] = v
    }
  }
  return result
}

function specsToRecord(state: Record<string, string | number | boolean | string[]>, category: DeviceCategory): Record<string, unknown> {
  const fields = CATEGORY_SPEC_FIELDS[category]
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    const val = state[field.key]
    if (val === undefined || val === '' || val === null) continue
    if (field.type === 'switch' && val === false) continue
    if (field.type === 'multi-check' && Array.isArray(val) && val.length === 0) continue
    if (field.type === 'number' && typeof val === 'string') {
      const num = parseFloat(val)
      if (!isNaN(num)) result[field.key] = num
      continue
    }
    result[field.key] = val
  }
  return result
}

// ============================================================================
// Page
// ============================================================================

export default function DeviceCatalogPage() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState<DeviceCatalogItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeviceCatalogItem | null>(null)

  const catalogQuery = useDeviceCatalog()
  const { data: devices, isLoading, isError } = catalogQuery
  const createMutation = useCreateDevice()
  const updateMutation = useUpdateDevice()
  const toggleMutation = useToggleDeviceStatus()
  const deleteMutation = useDeleteDevice()

  const hasActiveFilters = Boolean(search.trim()) || categoryFilter !== 'all' || statusFilter !== 'all'

  // Rows read in category order, so the table keeps the grouping the old
  // collapsible list gave. `sort` is stable: the server's manufacturer/model
  // order survives inside each category.
  const filtered = useMemo(() => {
    if (!devices) return []
    const q = search.trim().toLowerCase()
    return devices
      .filter((d) => {
        if (categoryFilter !== 'all' && d.device_category !== categoryFilter) return false
        if (statusFilter === 'active' && !d.is_active) return false
        if (statusFilter === 'discontinued' && d.is_active) return false
        if (q) {
          const match =
            d.model_name.toLowerCase().includes(q) ||
            d.manufacturer.toLowerCase().includes(q) ||
            (d.model_sku?.toLowerCase().includes(q) ?? false)
          if (!match) return false
        }
        return true
      })
      .sort(
        (a, b) =>
          (CATEGORY_ORDER[a.device_category as DeviceCategory] ?? 99) -
          (CATEGORY_ORDER[b.device_category as DeviceCategory] ?? 99)
      )
  }, [devices, categoryFilter, statusFilter, search])

  const { pageRows, pagination, setPage } = useClientPagination(filtered, PAGE_SIZE)

  const stats = useMemo(() => {
    if (!devices) return { total: 0, active: 0, discontinued: 0 }
    return {
      total: devices.length,
      active: devices.filter((d) => d.is_active).length,
      discontinued: devices.filter((d) => !d.is_active).length,
    }
  }, [devices])

  const manufacturers = useMemo(() => {
    if (!devices) return []
    return [...new Set(devices.map((d) => d.manufacturer))].sort()
  }, [devices])

  // A catalog that failed to load is unknown, not empty (§4.9).
  const figure = (value: number) => (isError ? '—' : formatCount(value))
  const statMeta = (meta: string) => (isError ? 'Catalog unavailable' : meta)

  function clearFilters() {
    setSearch('')
    setCategoryFilter('all')
    setStatusFilter('all')
    setPage(1)
  }

  function openCreate() {
    setEditingDevice(null)
    setDialogOpen(true)
  }

  function openEdit(device: DeviceCatalogItem) {
    setEditingDevice(device)
    setDialogOpen(true)
  }

  async function handleToggle(device: DeviceCatalogItem) {
    try {
      await toggleMutation.mutateAsync(device.id)
      toast.success(device.is_active ? 'Device discontinued' : 'Device reactivated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle status')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      toast.success(`${deleteTarget.model_name} deleted`)
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete device')
    }
  }

  const rowActions = (device: DeviceCatalogItem) => (
    <DeviceActionsMenu
      device={device}
      onEdit={() => openEdit(device)}
      onToggle={() => handleToggle(device)}
      onDelete={() => setDeleteTarget(device)}
    />
  )

  return (
    <PageShell as="div">
      <DeviceRegistryPageHeader
        title="Device catalog"
        description="Supported hardware models, pricing defaults, and reusable specs for future inventory rows."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/manage/devices">Open inventory</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/manage/devices/overview">Open overview</Link>
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add device
            </Button>
          </>
        }
      />

      <Panel padded>
        <StatRow columns={4}>
          <StatTile
            label="Total models"
            icon={<Boxes />}
            value={figure(stats.total)}
            meta={statMeta('Catalog entries across all categories')}
            showMetaOnMobile={isError}
            isLoading={isLoading}
          />
          <StatTile
            label="Active"
            icon={<ToggleRight />}
            value={figure(stats.active)}
            meta={statMeta('Available for procurement and assignment')}
            showMetaOnMobile={isError}
            isLoading={isLoading}
          />
          <StatTile
            label="Discontinued"
            icon={<ToggleLeft />}
            value={figure(stats.discontinued)}
            meta={statMeta('Hidden from new rollouts, kept for history')}
            showMetaOnMobile={isError}
            isLoading={isLoading}
          />
          <StatTile
            label="Manufacturers"
            icon={<Factory />}
            value={figure(manufacturers.length)}
            meta={statMeta('Distinct vendors represented')}
            showMetaOnMobile={isError}
            isLoading={isLoading}
          />
        </StatRow>
      </Panel>

      {/* A neutral callout, not a dashed card (§3.5). */}
      <div className="flex flex-col gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p className="min-w-0">
          Catalog models do not create registry rows. The catalog defines supported hardware; the registry only fills after manual entry or a later bulk import.
        </p>
        <Button asChild size="sm" variant="outline" className="h-9 shrink-0 self-start px-4 md:self-auto">
          <Link href="/manage/devices">Go to registry</Link>
        </Button>
      </div>

      <Panel>
        <PanelSection
          label="Catalog models"
          caption="Every supported model with its default pricing and the specs new inventory rows inherit."
        >
          {/* Toolbar: search left, borderless filter pills right (§5.2). */}
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <div className="relative min-w-0 flex-1 md:min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="h-10 pl-9"
                placeholder="Search model, manufacturer, or SKU"
                aria-label="Search catalog"
              />
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <FilterSelect
                value={categoryFilter}
                onValueChange={(value) => {
                  setCategoryFilter(value)
                  setPage(1)
                }}
                options={CATEGORY_FILTER_OPTIONS}
                allLabel="All categories"
                ariaLabel="Category"
                className="sm:w-[190px]"
              />
              <FilterSelect
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value)
                  setPage(1)
                }}
                options={STATUS_FILTER_OPTIONS}
                allLabel="All statuses"
                ariaLabel="Status"
                className="sm:w-[150px]"
              />
              {hasActiveFilters ? (
                <Button variant="ghost" size="sm" className="h-9 rounded-full px-3" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 min-w-0">
            {isError ? (
              <LoadError
                title="We hit a snag loading the catalog"
                detail={catalogQuery.error?.message ?? 'The device catalog could not be loaded.'}
                onRetry={() => void catalogQuery.refetch()}
              />
            ) : isLoading ? (
              <CatalogLoading />
            ) : filtered.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/30 px-4 py-10 text-center">
                <p className="text-sm font-medium">
                  {hasActiveFilters ? 'No models match these filters' : 'No models in the catalog yet'}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {hasActiveFilters
                    ? 'Clear the search or filters to widen the results.'
                    : 'Add a hardware model to define its pricing and specs before units reach the registry.'}
                </p>
                <div className="mt-2">
                  {hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={openCreate}>
                      <Plus className="h-4 w-4" />
                      Add device
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* 900px of columns fits the content column from `xl` (§5.3, D-23). */}
                <Table variant="data" containerClassName="hidden xl:block" className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Specs</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead className="text-right">Monthly fee</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((device) => {
                      const category = device.device_category as DeviceCategory
                      const specsSummary = renderSpecsSummary(device.specs, category)
                      return (
                        <TableRow key={device.id}>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-3">
                              <DeviceThumbnail device={device} />
                              <div className="min-w-0">
                                <p className="truncate font-medium">{device.model_name}</p>
                                <p className="truncate text-sm text-muted-foreground">{modelSubline(device)}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{CATEGORY_SINGULAR[category] ?? category}</TableCell>
                          <TableCell className="max-w-[240px]">
                            <p className="truncate text-sm text-muted-foreground" title={specsSummary || undefined}>
                              {specsSummary || '—'}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatDollars(device.unit_cost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatDollars(device.monthly_fee)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="w-fit px-2.5 text-xs font-medium">
                              {device.is_active ? 'Active' : 'Discontinued'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{rowActions(device)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {/* Below `xl` the records become cards; no sideways scroll (§5.3). */}
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                  {pageRows.map((device) => {
                    const category = device.device_category as DeviceCategory
                    const specsSummary = renderSpecsSummary(device.specs, category)
                    return (
                      <RecordCard key={device.id}>
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            {/* Product images drop on phones (§13.4). */}
                            <DeviceThumbnail device={device} className="hidden sm:flex" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{device.model_name}</p>
                              <p className="truncate text-sm text-muted-foreground">{modelSubline(device)}</p>
                            </div>
                          </div>
                          {/* On a muted card the status is plain text, not a pill (§3.5). */}
                          <span className="shrink-0 text-sm font-medium">
                            {device.is_active ? 'Active' : 'Discontinued'}
                          </span>
                        </div>
                        <CardFields>
                          <CardField label="Category" value={CATEGORY_SINGULAR[category] ?? category} />
                          <CardField label="Specs" value={specsSummary || '—'} />
                          <CardField label="Unit cost" value={formatDollars(device.unit_cost)} />
                          <CardField label="Monthly fee" value={formatDollars(device.monthly_fee)} />
                        </CardFields>
                        <div className="mt-3 flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 px-3" onClick={() => openEdit(device)}>
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                          {rowActions(device)}
                        </div>
                      </RecordCard>
                    )
                  })}
                </div>

                <PaginationBar pagination={pagination} onPageChange={setPage} itemLabel="models" />
                {pagination.total <= PAGE_SIZE ? (
                  <p className="mt-4 text-xs text-muted-foreground tabular-nums sm:text-sm">
                    {formatCount(pagination.total)} {pagination.total === 1 ? 'model' : 'models'}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </PanelSection>
      </Panel>

      {/* Create / Edit Dialog */}
      <DeviceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        device={editingDevice}
        manufacturers={manufacturers}
        onSave={async (input) => {
          try {
            if (editingDevice) {
              await updateMutation.mutateAsync({ id: editingDevice.id, input })
              toast.success('Device updated')
            } else {
              await createMutation.mutateAsync(input as CreateDeviceCatalogInput)
              toast.success('Device created')
            }
            setDialogOpen(false)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Operation failed')
          }
        }}
        saving={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete confirmation: a question with two buttons stays a centred card (§13.1). */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.model_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this device model from the catalog.
              Any inventory referencing it may be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}

// ============================================================================
// Row pieces
// ============================================================================

/**
 * The model's product image, or its category glyph. A borderless muted plate:
 * it is the record's identity, so it keeps a surface, but no tint (§3.5).
 */
function DeviceThumbnail({ device, className }: { device: DeviceCatalogItem; className?: string }) {
  const CatIcon = CATEGORY_MAP[device.device_category as DeviceCategory]?.icon ?? Monitor
  // `cn` lets a caller's `hidden sm:flex` replace the base `flex` (§13.4).
  return (
    <div
      className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-muted-foreground',
        className
      )}
    >
      {device.image_url ? (
        <Image src={device.image_url} alt={device.model_name} fill className="object-cover" sizes="40px" />
      ) : (
        <CatIcon className="h-4 w-4" />
      )}
    </div>
  )
}

function DeviceActionsMenu({
  device,
  onEdit,
  onToggle,
  onDelete,
}: {
  device: DeviceCatalogItem
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full p-0"
          aria-label={`Actions for ${device.model_name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggle}>
          {device.is_active ? (
            <>
              <ToggleLeft className="mr-2 h-4 w-4" />
              Discontinue
            </>
          ) : (
            <>
              <ToggleRight className="mr-2 h-4 w-4" />
              Reactivate
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Skeletons in the final shape at each width (§5.4). */
function CatalogLoading() {
  return (
    <>
      <Table variant="data" containerClassName="hidden xl:block" className="min-w-[900px]">
        <TableBody>
          <TableRow>
            <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
              Loading catalog…
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
        <RecordCardSkeletons />
      </div>
    </>
  )
}

// ============================================================================
// Form Dialog
// ============================================================================

function DeviceFormDialog({
  open,
  onOpenChange,
  device,
  manufacturers,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  device: DeviceCatalogItem | null
  manufacturers: string[]
  onSave: (input: CreateDeviceCatalogInput) => Promise<void>
  saving: boolean
}) {
  const isEdit = !!device

  const [category, setCategory] = useState<DeviceCategory>('pos_tablet')
  const [manufacturer, setManufacturer] = useState('')
  const [modelName, setModelName] = useState('')
  const [modelSku, setModelSku] = useState('')
  const [hardwareRevision, setHardwareRevision] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [monthlyFee, setMonthlyFee] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [specsState, setSpecsState] = useState<Record<string, string | number | boolean | string[]>>({})

  function updateSpec(key: string, value: string | number | boolean | string[]) {
    setSpecsState((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    if (!open) return
    if (device) {
      setCategory(device.device_category as DeviceCategory)
      setManufacturer(device.manufacturer)
      setModelName(device.model_name)
      setModelSku(device.model_sku ?? '')
      setHardwareRevision(device.hardware_revision ?? '')
      setUnitCost(device.unit_cost !== null ? String(Number(device.unit_cost)) : '')
      setMonthlyFee(device.monthly_fee !== null ? String(Number(device.monthly_fee)) : '')
      setImageUrl(device.image_url ?? '')
      setNotes(device.notes ?? '')
      setIsActive(device.is_active)
      setSpecsState(specsFromDevice(device.specs))
    } else {
      setCategory('pos_tablet')
      setManufacturer('')
      setModelName('')
      setModelSku('')
      setHardwareRevision('')
      setUnitCost('')
      setMonthlyFee('')
      setImageUrl('')
      setNotes('')
      setIsActive(true)
      setSpecsState({})
    }
  }, [open, device])

  function handleCategoryChange(newCat: DeviceCategory) {
    setCategory(newCat)
    if (!isEdit) setSpecsState({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const specs = specsToRecord(specsState, category)

    const input: CreateDeviceCatalogInput = {
      device_category: category,
      manufacturer: manufacturer.trim(),
      model_name: modelName.trim(),
      model_sku: modelSku.trim() || null,
      hardware_revision: hardwareRevision.trim() || null,
      specs,
      unit_cost_cents: unitCost ? Math.round(parseFloat(unitCost) * 100) : null,
      monthly_fee_cents: monthlyFee ? Math.round(parseFloat(monthlyFee) * 100) : null,
      unit_cost: unitCost ? parseFloat(unitCost) : null,
      monthly_fee: monthlyFee ? parseFloat(monthlyFee) : null,
      is_active: isActive,
      image_url: imageUrl.trim() || null,
      notes: notes.trim() || null,
    }

    await onSave(input)
  }

  const catDef = CATEGORY_MAP[category]
  const CatIcon = catDef?.icon ?? Monitor
  const specFields = CATEGORY_SPEC_FIELDS[category] ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* §12/§13.1: a form, so full-screen below `sm`. The content clips and
          the body scrolls; header and footer carry no rule (§5.5). */}
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-2xl sm:rounded-3xl">
        <DialogHeader className="shrink-0 px-6 pb-2 pr-14 pt-6 text-left">
          <DialogTitle className="text-xl">{isEdit ? 'Edit device' : 'Add device'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update ${device?.model_name} details`
              : 'Add a new hardware model to the catalog'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* Sections are separated by spacing, not rules (§5.5). */}
          <div className="thin-scrollbar min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-4">
            <section className="space-y-4">
              <h3 className="font-medium">Device info</h3>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={(v) => handleCategoryChange(v as DeviceCategory)}>
                  <SelectTrigger id="category" className="w-full border-0 bg-muted/60 shadow-none dark:bg-muted/60">
                    <div className="flex items-center gap-2">
                      <CatIcon className="h-4 w-4 text-muted-foreground" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {DEVICE_CATEGORIES.map((c) => {
                      const Icon = c.icon
                      return (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            {CATEGORY_SINGULAR[c.value]}
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Input
                    id="manufacturer"
                    required
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    placeholder="e.g. Landi, Dejavoo"
                    list="mfr-list"
                  />
                  {manufacturers.length > 0 && (
                    <datalist id="mfr-list">
                      {manufacturers.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model_name">Model Name</Label>
                  <Input
                    id="model_name"
                    required
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g. C20 PRO"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model_sku">SKU</Label>
                  <Input
                    id="model_sku"
                    value={modelSku}
                    onChange={(e) => setModelSku(e.target.value)}
                    placeholder="e.g. LANDI-C20PRO"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hw_rev">Hardware Revision</Label>
                  <Input
                    id="hw_rev"
                    value={hardwareRevision}
                    onChange={(e) => setHardwareRevision(e.target.value)}
                    placeholder="e.g. Rev A"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="font-medium">{CATEGORY_SINGULAR[category]} specifications</h3>
              {specFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">No specification fields for this category.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {specFields.map((field) => (
                    <SpecField
                      key={field.key}
                      field={field}
                      value={specsState[field.key]}
                      onChange={(val) => updateSpec(field.key, val)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <h3 className="font-medium">Pricing and status</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="unit_cost">Unit Cost</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <Input
                      id="unit_cost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      placeholder="0.00"
                      className="pl-8 tabular-nums"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthly_fee">Monthly Fee</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <Input
                      id="monthly_fee"
                      type="number"
                      step="0.01"
                      min="0"
                      value={monthlyFee}
                      onChange={(e) => setMonthlyFee(e.target.value)}
                      placeholder="0.00"
                      className="pl-8 tabular-nums"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="is_active" checked={isActive} onCheckedChange={setIsActive} />
                <Label htmlFor="is_active" className="text-sm font-normal">Active in catalog</Label>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="font-medium">Media and notes</h3>
              <div className="space-y-2">
                <Label htmlFor="image_url">Image URL</Label>
                <div className="flex items-center gap-3">
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-muted-foreground">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt="Preview"
                        fill
                        className="object-cover"
                        sizes="56px"
                        onError={() => {}}
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5" />
                    )}
                  </div>
                  <Input
                    id="image_url"
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/device.jpg"
                    className="min-w-0 flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes about this device..."
                  className="resize-none"
                />
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 px-6 pb-6 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Add device'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Dynamic Spec Field Renderer
// ============================================================================

function SpecField({
  field,
  value,
  onChange,
}: {
  field: SpecFieldDef
  value: string | number | boolean | string[] | undefined
  onChange: (val: string | number | boolean | string[]) => void
}) {
  if (field.type === 'switch') {
    return (
      <div className="flex items-center justify-between py-1">
        <Label htmlFor={field.key} className="text-sm font-normal">{field.label}</Label>
        <Switch
          id={field.key}
          checked={!!value}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.key}>{field.label}</Label>
        <Select value={(value as string) || ''} onValueChange={(v) => onChange(v)}>
          <SelectTrigger id={field.key} className="w-full border-0 bg-muted/60 shadow-none dark:bg-muted/60">
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt.charAt(0).toUpperCase() + opt.slice(1).replace(/-/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (field.type === 'multi-check') {
    const selected = Array.isArray(value) ? value : []
    return (
      <div className="space-y-2 sm:col-span-2">
        <Label>{field.label}</Label>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {field.options?.map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onChange([...selected, opt])
                  } else {
                    onChange(selected.filter((s) => s !== opt))
                  }
                }}
              />
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </label>
          ))}
        </div>
      </div>
    )
  }

  // text / number
  return (
    <div className="space-y-2">
      <Label htmlFor={field.key}>{field.label}</Label>
      <div className="relative">
        <Input
          id={field.key}
          type={field.type === 'number' ? 'number' : 'text'}
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={field.suffix ? 'pr-12' : undefined}
        />
        {field.suffix && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {field.suffix}
          </span>
        )}
      </div>
    </div>
  )
}
