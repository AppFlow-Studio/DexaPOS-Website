'use client'

import { Card, CardContent } from '@/components/ui/card'
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

const statusColors: Record<string, string> = {
  created: 'bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  cancelled: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300',
  inactive: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  onboarding: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
}

export function MerchantCard({ merchant, onClick }: MerchantCardProps) {
  const merchantStatus = merchant.onboarding_status || merchant.derived_status

  const ownerName = `${merchant.owner_first_name || ''} ${merchant.owner_last_name || ''}`.trim()
  const subtitle = [ownerName, merchant.type ? merchant.type.charAt(0).toUpperCase() + merchant.type.slice(1) : '']
    .filter(Boolean)
    .join(' · ')

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow flex flex-col"
      onClick={onClick}
    >
      <CardContent className="p-5 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 bg-primary/10 rounded-lg flex items-center justify-center relative overflow-hidden">
              {merchant.logo_url ? (
                <Image src={merchant.logo_url} alt={merchant.name} fill className="object-cover" />
              ) : (
                <Building2 className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">{merchant.name}</h3>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {subtitle || <span className="opacity-0">—</span>}
              </p>
            </div>
          </div>
          <Badge className={`shrink-0 ${statusColors[merchantStatus] || statusColors.onboarding}`}>
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

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {merchant.last_order_at
              ? `Last order ${formatDistanceToNow(new Date(merchant.last_order_at), { addSuffix: true })}`
              : 'No orders yet'}
          </p>
          {(merchant.notes_count || 0) > 0 && (
            <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              {merchant.notes_count}
            </div>
          )}
        </div>

        <div className="mt-3 flex justify-end">
          <ImpersonateMerchantButton
            merchantId={merchant.id}
            merchantName={merchant.name}
            variant="card"
          />
        </div>
      </CardContent>
    </Card>
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
