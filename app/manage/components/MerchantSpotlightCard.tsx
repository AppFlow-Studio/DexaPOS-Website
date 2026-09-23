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
          {/* Logo and fallback plate are desktop-only: 40px plus its gap is a
              seventh of the card's width on a phone, and it identifies nothing
              the name beside it does not. */}
          {merchant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={merchant.logo_url}
              alt=""
              className="hidden h-10 w-10 shrink-0 rounded-xl bg-muted object-cover sm:block"
            />
          ) : (
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 sm:flex">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {/* Name and status share a row on a phone and stack from `sm` up,
                where the badge sits under the id line as before. `min-w-0` on
                the name lets it truncate rather than push the badge out. */}
            <div className="flex items-center gap-2 sm:block">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight sm:flex-none">
                {merchant.name ?? 'Unnamed merchant'}
              </p>
              <span className={`${BADGE_SHELL} sm:hidden`}>{statusLabel}</span>
            </div>
            {/* Several merchants legitimately share a name (four "Charcoal
                Gardenia" records ship today), and the spotlight payload carries
                no city or org to separate them. The id prefix is the only
                distinguishing value available without widening the query — so
                it stays on desktop and gives way on a phone, where the row is
                too narrow to carry it beside the status. */}
            <p
              className="hidden truncate font-mono text-[10px] leading-tight text-muted-foreground sm:block"
              title={merchant.id}
            >
              {merchant.id.slice(0, 8)}
            </p>
            {/* Wrapped rather than `hidden` on the badge itself: BADGE_SHELL
                already carries `inline-flex`, and two display utilities on one
                element are decided by CSS source order, not class order — the
                badge stayed visible on phones and the status rendered twice. */}
            <div className="mt-1 hidden sm:block">
              <span className={BADGE_SHELL}>{statusLabel}</span>
            </div>
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
      {/* Desktop-only. Each glyph costs ~22px of a half-card column, and the
          label directly beneath already names the figure — "Today", "Orders",
          "Staff", "Locations" are not ambiguous enough to need a second
          encoding. The currency value keeps its own "$". */}
      <Icon className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
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
        {/* Matches the card: no logo slot on a phone, so the skeleton does not
            promise a plate that never arrives. */}
        <Skeleton className="hidden h-10 w-10 rounded-xl sm:block" />
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
