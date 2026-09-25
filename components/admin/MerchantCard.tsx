'use client'

import { Badge } from '@/components/ui/badge'
import { Building2, MapPin, Users, ShoppingCart, DollarSign, MessageSquare } from 'lucide-react'
import type { MerchantSummary } from '@/types/merchant'
import { formatDistanceToNow } from 'date-fns'
import Image from 'next/image'
import { ImpersonateMerchantButton } from '@/components/admin/ImpersonateMerchantButton'

interface MerchantCardProps {
  merchant: MerchantSummary
  onClick: () => void
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function MerchantCard({ merchant, onClick }: MerchantCardProps) {
  const merchantStatus = merchant.onboarding_status || merchant.derived_status

  const ownerName = `${merchant.owner_first_name || ''} ${merchant.owner_last_name || ''}`.trim()
  const subtitle = [ownerName, merchant.type ? merchant.type.charAt(0).toUpperCase() + merchant.type.slice(1) : '']
    .filter(Boolean)
    .join(' · ')

  return (
    /* §5.3 record card: borderless `bg-muted/45`, and the hover state is a ring
       rather than a shadow — the design system draws no frames. */
    <div
      className="flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border-0 bg-muted/45 p-4 transition-colors hover:bg-muted"
      onClick={onClick}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {/* Logo is `sm`-and-up only: at phone width it cost ~52px of a 375px
              card, which is what pushed the merchant name into an ellipsis. */}
          <div className="relative hidden h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 sm:flex">
            {merchant.logo_url ? (
              <Image src={merchant.logo_url} alt={merchant.name} fill className="object-cover" />
            ) : (
              <Building2 className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-foreground">{merchant.name}</h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {subtitle || <span className="opacity-0">—</span>}
            </p>
          </div>
        </div>
        {/* One neutral badge for every state (D-03): colour is reserved for real
            severity, and an onboarding status is not an alarm. */}
        <Badge
          variant="secondary"
          className="w-fit shrink-0 rounded-full border-0 px-2.5 text-xs font-medium capitalize"
        >
          {merchantStatus.replace('_', ' ')}
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat icon={<MapPin className="h-3.5 w-3.5" />} label="Locations" value={`${merchant.active_locations} / ${merchant.total_locations}`} />
        <Stat icon={<Users className="h-3.5 w-3.5" />} label="Staff" value={merchant.active_staff_count} />
        <Stat icon={<ShoppingCart className="h-3.5 w-3.5" />} label="Orders Today" value={merchant.orders_today} />
        <Stat icon={<DollarSign className="h-3.5 w-3.5" />} label="Revenue Today" value={formatCurrency(merchant.revenue_today)} />
      </div>

      {/* Footer — no `border-t` (§5.5): spacing separates it, not a rule. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="truncate text-xs text-muted-foreground">
          {merchant.last_order_at
            ? `Last order ${formatDistanceToNow(new Date(merchant.last_order_at), { addSuffix: true })}`
            : 'No orders yet'}
        </p>
        {(merchant.notes_count || 0) > 0 && (
          <div className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            {merchant.notes_count}
          </div>
        )}
      </div>

      <div className="mt-3 flex justify-center">
        <ImpersonateMerchantButton
          merchantId={merchant.id}
          merchantName={merchant.name}
          variant="card"
        />
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  )
}
