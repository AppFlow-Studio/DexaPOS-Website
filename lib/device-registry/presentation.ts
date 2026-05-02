import type { LucideIcon } from 'lucide-react'
import {
  ChefHat,
  CreditCard,
  DollarSign,
  LayoutDashboard,
  Monitor,
  Package,
  Printer,
  Tablet,
  Wrench,
  FileText,
  RefreshCcw,
} from 'lucide-react'

import type { DeviceActivityItem, DeviceCategory, DeviceLifecycleStatus } from '@/types/device-registry'

const STATUS_META: Record<
  DeviceLifecycleStatus,
  {
    label: string
    classes: string
  }
> = {
  in_warehouse: {
    label: 'In Warehouse',
    classes: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  allocated: {
    label: 'Allocated',
    classes: 'border-violet-200 bg-violet-50 text-violet-700',
  },
  shipped: {
    label: 'Shipped',
    classes: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  },
  provisioning: {
    label: 'Provisioning',
    classes: 'border-teal-200 bg-teal-50 text-teal-700',
  },
  deployed: {
    label: 'Deployed',
    classes: 'border-green-200 bg-green-50 text-green-700',
  },
  in_repair: {
    label: 'In Repair',
    classes: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  decommissioned: {
    label: 'Decommissioned',
    classes: 'border-zinc-200 bg-zinc-100 text-zinc-700',
  },
  lost: {
    label: 'Lost',
    classes: 'border-red-200 bg-red-50 text-red-700',
  },
  rma: {
    label: 'RMA',
    classes: 'border-orange-200 bg-orange-50 text-orange-700',
  },
}

const CATEGORY_META: Record<
  DeviceCategory,
  {
    label: string
    icon: LucideIcon
  }
> = {
  pos_tablet: { label: 'POS Tablet', icon: Tablet },
  cfd: { label: 'Customer-Facing Display', icon: Monitor },
  kds: { label: 'KDS Display', icon: LayoutDashboard },
  payment_terminal: { label: 'Payment Terminal', icon: CreditCard },
  receipt_printer: { label: 'Receipt Printer', icon: Printer },
  kitchen_printer: { label: 'Kitchen Printer', icon: ChefHat },
  cash_drawer: { label: 'Cash Drawer', icon: DollarSign },
}

export function formatDeviceStatus(status: DeviceLifecycleStatus) {
  return STATUS_META[status]?.label ?? status
}

export function getDeviceStatusClasses(status: DeviceLifecycleStatus) {
  return STATUS_META[status]?.classes ?? 'border-border bg-muted text-muted-foreground'
}

export function formatDeviceCategory(category: DeviceCategory) {
  return CATEGORY_META[category]?.label ?? category
}

export function getDeviceCategoryIcon(category: DeviceCategory) {
  return CATEGORY_META[category]?.icon ?? Package
}

export function formatMoneyCents(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount / 100)
}

export function formatMoneyDollars(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount))
}

export function getTimelineIcon(item: DeviceActivityItem): LucideIcon {
  switch (item.type) {
    case 'assignment':
      return Package
    case 'config':
      return RefreshCcw
    case 'note':
      return item.title.toLowerCase().includes('maintenance') ? Wrench : FileText
    default:
      return FileText
  }
}
