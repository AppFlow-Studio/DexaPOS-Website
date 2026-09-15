'use client'

import Link from 'next/link'
import { Building2, DollarSign, ShoppingCart, Users, MapPin, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { Panel } from '@/components/dashboard/shell/Panel'
import { Skeleton } from '@/components/ui/skeleton'
import type { MerchantSpotlightRow } from '../actions/get-merchant-spotlight'

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  onboarding: 'Onboarding',
  inactive: 'Inactive',
}

/**
 * One neutral pill for every state (`DS-CTL-09`). The word carries the meaning;
 * the previous emerald/blue/grey triple made the card a colour key.
 */
const BADGE_SHELL =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border-0 bg-muted/60 px-2.5 py-0.5 text-xs font-medium'

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
  const statusLabel = STATUS_LABELS[status] ?? status

  return (
    <Link
      href={`/manage/merchants/${merchant.id}`}
      className="group block min-w-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* `nested`: tier 2, because this sits inside the section's own Panel. */}
      <Panel nested className="h-full p-4 transition-colors hover:bg-muted/40">
        <div className="mb-3 flex items-start gap-3">
          {merchant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={merchant.logo_url}
              alt=""
              className="h-10 w-10 shrink-0 rounded-xl bg-muted object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              {merchant.name ?? 'Unnamed merchant'}
            </p>
            <span className={`mt-1 ${BADGE_SHELL}`}>{statusLabel}</span>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <Stat icon={DollarSign} label="Today" value={formatCurrency(merchant.revenue_today)} />
          <Stat
            icon={ShoppingCart}
            label="Orders"
            value={(merchant.orders_today ?? 0).toLocaleString()}
          />
          <Stat
            icon={Users}
            label="Staff"
            value={(merchant.active_staff_count ?? 0).toLocaleString()}
          />
          <Stat
            icon={MapPin}
            label="Locations"
            value={`${merchant.active_locations ?? 0}/${merchant.total_locations ?? 0}`}
          />
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">Last order {formatLastOrder(merchant.last_order_at)}</span>
        </div>
      </Panel>
    </Link>
  )
}

/**
 * A figure inside the card. The icon is a quiet muted glyph rather than a
 * tinted plate: the old emerald/blue/indigo/violet tones encoded nothing, and
 * violet is the framework `--primary`, not the DEXA brand (§C5).
 */
function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] leading-none text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold leading-tight tabular-nums">{value}</p>
      </div>
    </div>
  )
}

export function MerchantSpotlightCardSkeleton() {
  return (
    <Panel nested className="h-full p-4">
      <div className="mb-3 flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
            <div className="min-w-0 flex-1 space-y-1">
              <Skeleton className="h-2 w-10" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-3 w-32" />
    </Panel>
  )
}
