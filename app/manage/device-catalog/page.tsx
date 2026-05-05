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
  ChevronDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { DeviceRegistryMetricCard } from '@/app/manage/devices/components/DeviceRegistryMetricCard'
import { DeviceRegistryPageHeader } from '@/app/manage/devices/components/DeviceRegistryPageHeader'
import { Card, CardContent } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

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

function formatCents(cents: number | null): string {
  if (cents === null || cents === undefined) return 'N/A'
  return `$${(cents / 100).toFixed(2)}`
}

function formatDollars(dollars: number | null): string {
  if (dollars === null || dollars === undefined) return 'N/A'
  return `$${Number(dollars).toFixed(2)}`
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
  return parts.join(' / ') || ''
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const { data: devices, isLoading, error } = useDeviceCatalog()
  const createMutation = useCreateDevice()
  const updateMutation = useUpdateDevice()
  const toggleMutation = useToggleDeviceStatus()
  const deleteMutation = useDeleteDevice()

  const filtered = useMemo(() => {
    if (!devices) return []
    return devices.filter((d) => {
      if (categoryFilter !== 'all' && d.device_category !== categoryFilter) return false
      if (statusFilter === 'active' && !d.is_active) return false
      if (statusFilter === 'discontinued' && d.is_active) return false
      if (search) {
        const q = search.toLowerCase()
        const match =
          d.model_name.toLowerCase().includes(q) ||
          d.manufacturer.toLowerCase().includes(q) ||
          (d.model_sku?.toLowerCase().includes(q) ?? false)
        if (!match) return false
      }
      return true
    })
  }, [devices, categoryFilter, statusFilter, search])

  const grouped = useMemo(() => {
    const groups: { category: DeviceCategory; items: DeviceCatalogItem[] }[] = []
    const map = new Map<DeviceCategory, DeviceCatalogItem[]>()
    for (const d of filtered) {
      const cat = d.device_category as DeviceCategory
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(d)
    }
    for (const catDef of DEVICE_CATEGORIES) {
      const items = map.get(catDef.value)
      if (items && items.length > 0) {
        groups.push({ category: catDef.value, items })
      }
    }
    return groups
  }, [filtered])

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

  function toggleGroup(category: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
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

  return (
    <div className="space-y-6">
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
            <Plus className="mr-2 h-4 w-4" />
            Add device
          </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Total models',
            value: stats.total,
            detail: 'Catalog entries across all categories',
            icon: Boxes,
          },
          {
            label: 'Active',
            value: stats.active,
            detail: 'Available for procurement and assignment',
            icon: ToggleRight,
          },
          {
            label: 'Discontinued',
            value: stats.discontinued,
            detail: 'Hidden from new rollouts but kept for history',
            icon: ToggleLeft,
          },
          {
            label: 'Manufacturers',
            value: manufacturers.length,
            detail: 'Distinct vendors currently represented',
            icon: Factory,
          },
        ].map((card) => (
          <DeviceRegistryMetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            detail={card.detail}
            icon={card.icon}
          />
        ))}
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-col gap-2 p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>
            Catalog models do not create registry rows. The catalog defines supported hardware; the registry only fills after manual entry or a later bulk import.
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/manage/devices">Go to registry</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 md:min-w-[280px] xl:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search models..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[170px] h-9">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {DEVICE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="discontinued">Discontinued</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Grouped list */}
      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-12 text-center text-destructive text-sm">
            Failed to load device catalog
          </div>
        ) : grouped.length === 0 ? (
          <div className="p-16 text-center">
            <Monitor className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {devices?.length ? 'No devices match your filters' : 'No devices in catalog yet'}
            </p>
            {!devices?.length && (
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Add your first device
              </Button>
            )}
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto overscroll-contain">
            <div>
              {grouped.map((group, gi) => {
                const catDef = CATEGORY_MAP[group.category]
                const CatIcon = catDef?.icon ?? Monitor
                const isOpen = !collapsedGroups.has(group.category)
                return (
                  <Collapsible
                    key={group.category}
                    open={isOpen}
                    onOpenChange={() => toggleGroup(group.category)}
                  >
                    {gi > 0 && <Separator />}
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full sticky top-0 z-10 bg-muted/50 backdrop-blur-sm border-b px-5 py-3 flex items-center gap-2 hover:bg-muted/70 transition-colors cursor-pointer"
                      >
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                        <CatIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {catDef?.label ?? group.category}
                        </span>
                        <span className="text-xs text-muted-foreground/60">
                          - {group.items.length}
                        </span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {group.items.map((device, di) => {
                        const specsSummary = renderSpecsSummary(device.specs, device.device_category as DeviceCategory)
                        return (
                          <div key={device.id}>
                            {di > 0 && <Separator className="mx-5" />}
                            <div className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
                              {/* Thumbnail */}
                              <div className="shrink-0">
                                {device.image_url ? (
                                  <div className="relative h-12 w-12 rounded-lg overflow-hidden border bg-muted">
                                    <Image
                                      src={device.image_url}
                                      alt={device.model_name}
                                      fill
                                      className="object-cover"
                                      sizes="48px"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-muted/50">
                                    <CatIcon className="h-5 w-5 text-muted-foreground/60" />
                                  </div>
                                )}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium truncate">{device.model_name}</p>
                                  {!device.is_active && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                                      Discontinued
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {device.manufacturer}
                                  {device.model_sku && (
                                    <span className="ml-2 font-mono text-muted-foreground/60">{device.model_sku}</span>
                                  )}
                                </p>
                                {specsSummary && (
                                  <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">{specsSummary}</p>
                                )}
                              </div>

                              {/* Pricing */}
                              <div className="hidden md:flex flex-col items-end text-right shrink-0">
                                {device.unit_cost !== null && (
                                  <span className="text-sm font-medium">{formatDollars(device.unit_cost)}</span>
                                )}
                                {device.monthly_fee !== null && (
                                  <span className="text-[11px] text-muted-foreground">{formatDollars(device.monthly_fee)}/mo</span>
                                )}
                              </div>

                              {/* Actions */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEdit(device)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleToggle(device)}>
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
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteTarget(device)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          </div>
        )}
      </Card>

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

      {/* Delete Confirmation */}
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
    </div>
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{isEdit ? 'Edit device' : 'Add device'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update ${device?.model_name} details`
              : 'Add a new hardware model to the catalog'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {/* Section: Device Info */}
          <div className="px-6 pt-5 pb-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              Device Info
            </p>

            {/* Category selector with icon */}
            <div className="space-y-2 mb-4">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={(v) => handleCategoryChange(v as DeviceCategory)}>
                <SelectTrigger id="category" className="h-10">
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
                  className="h-9"
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
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model_sku">SKU</Label>
                <Input
                  id="model_sku"
                  value={modelSku}
                  onChange={(e) => setModelSku(e.target.value)}
                  placeholder="e.g. LANDI-C20PRO"
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hw_rev">Hardware Revision</Label>
                <Input
                  id="hw_rev"
                  value={hardwareRevision}
                  onChange={(e) => setHardwareRevision(e.target.value)}
                  placeholder="e.g. Rev A"
                  className="h-9"
                />
              </div>
            </div>
          </div>

          <div className="px-6 py-2"><Separator /></div>

          {/* Section: Specifications */}
          <div className="px-6 py-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              {CATEGORY_SINGULAR[category]} Specifications
            </p>
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
            {specFields.length === 0 && (
              <p className="text-sm text-muted-foreground">No specification fields for this category.</p>
            )}
          </div>

          <div className="px-6 py-2"><Separator /></div>

          {/* Section: Pricing & Status */}
          <div className="px-6 py-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              Pricing & Status
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="unit_cost">Unit Cost</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    id="unit_cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    placeholder="0.00"
                    className="pl-7 h-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthly_fee">Monthly Fee</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    id="monthly_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    value={monthlyFee}
                    onChange={(e) => setMonthlyFee(e.target.value)}
                    placeholder="0.00"
                    className="pl-7 h-9"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <Switch id="is_active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="is_active" className="text-sm font-normal">Active in catalog</Label>
            </div>
          </div>

          <div className="px-6 py-2"><Separator /></div>

          {/* Section: Media & Notes */}
          <div className="px-6 py-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              Media & Notes
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image_url">Image URL</Label>
                <div className="flex items-start gap-3">
                  {imageUrl ? (
                    <div className="relative h-14 w-14 rounded-lg overflow-hidden border bg-muted shrink-0">
                      <Image
                        src={imageUrl}
                        alt="Preview"
                        fill
                        className="object-cover"
                        sizes="56px"
                        onError={() => {}}
                      />
                    </div>
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg border bg-muted/50 shrink-0">
                      <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  )}
                  <Input
                    id="image_url"
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/device.jpg"
                    className="h-9 flex-1"
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
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t mt-4 flex justify-end gap-2 bg-muted/30">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Add device'}
            </Button>
          </div>
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
      <div className="flex items-center justify-between sm:col-span-1 py-1">
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
          <SelectTrigger id={field.key} className="h-9">
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
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
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
          onChange={(e) => {
            const raw = e.target.value
            if (field.type === 'number') {
              onChange(raw === '' ? '' : raw)
            } else {
              onChange(raw)
            }
          }}
          placeholder={field.placeholder}
          className={`h-9 ${field.suffix ? 'pr-10' : ''}`}
        />
        {field.suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {field.suffix}
          </span>
        )}
      </div>
    </div>
  )
}
