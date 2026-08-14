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
import {
  deviceLifecycleStatusLabel,
  deviceLifecycleStatusStyle,
} from '@/lib/constants/device-status'

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
  return deviceLifecycleStatusLabel(status)
}

export function getDeviceStatusClasses(status: DeviceLifecycleStatus) {
  const style = deviceLifecycleStatusStyle(status)
  return `${style.bg} ${style.text} border-0`
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
