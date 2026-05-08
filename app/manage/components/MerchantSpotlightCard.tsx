'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Building2, DollarSign, ShoppingCart, Users, MapPin, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { MerchantSpotlightRow } from '../actions/get-merchant-spotlight'

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  onboarding: 'bg-blue-50 text-blue-700 border-blue-200',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  onboarding: 'Onboarding',
  inactive: 'Inactive',
}

function formatCurrency(value: number | null | undefined): string {
  const n = value ?? 0
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function formatLastOrder(iso: string | null | undefined): string {
  if (!iso) return 'No orders yet'
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return '—'
  }
}

export function MerchantSpotlightCard({ merchant }: { merchant: MerchantSpotlightRow }) {
  const status = merchant.derived_status ?? 'inactive'
  const statusClass = STATUS_STYLES[status] ?? STATUS_STYLES.inactive
  const statusLabel = STATUS_LABELS[status] ?? status

  return (
    <Link
      href={`/manage/merchants/${merchant.id}`}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl"
    >
      <Card className="p-4 h-full transition-all duration-200 border-blue-100/50 hover:border-blue-300 hover:shadow-md group-focus-visible:border-blue-300">
        <div className="flex items-start gap-3 mb-3">
          {merchant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={merchant.logo_url}
              alt=""
              className="h-10 w-10 rounded-lg object-cover bg-muted shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm leading-tight truncate group-hover:text-blue-700 transition-colors">
              {merchant.name ?? 'Unnamed merchant'}
            </p>
            <Badge
              variant="outline"
              className={cn('mt-1 text-[10px] px-1.5 py-0 h-4 font-medium', statusClass)}
            >
              {statusLabel}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <Stat
            icon={DollarSign}
            label="Today"
            value={formatCurrency(merchant.revenue_today)}
            tone="emerald"
          />
          <Stat
            icon={ShoppingCart}
            label="Orders"
            value={(merchant.orders_today ?? 0).toLocaleString()}
            tone="blue"
          />
          <Stat
            icon={Users}
            label="Staff"
            value={(merchant.active_staff_count ?? 0).toLocaleString()}
            tone="indigo"
          />
          <Stat
            icon={MapPin}
            label="Locations"
            value={`${merchant.active_locations ?? 0}/${merchant.total_locations ?? 0}`}
            tone="violet"
          />
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border-t pt-2">
          <Clock className="h-3 w-3" />
          <span className="truncate">Last order {formatLastOrder(merchant.last_order_at)}</span>
        </div>
      </Card>
    </Link>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone: 'emerald' | 'blue' | 'indigo' | 'violet'
}) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    indigo: 'text-indigo-600 bg-indigo-50',
    violet: 'text-violet-600 bg-violet-50',
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={cn('h-7 w-7 rounded-md flex items-center justify-center shrink-0', toneClasses[tone])}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground leading-none">{label}</p>
        <p className="text-sm font-semibold leading-tight truncate">{value}</p>
      </div>
    </div>
  )
}

export function MerchantSpotlightCardSkeleton() {
  return (
    <Card className="p-4 h-full border-blue-100/50">
      <div className="flex items-start gap-3 mb-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-md" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-2 w-10" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-3 w-32" />
    </Card>
  )
}
