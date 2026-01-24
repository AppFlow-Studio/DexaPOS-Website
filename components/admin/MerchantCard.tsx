'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, MapPin, Users, ShoppingCart, DollarSign } from 'lucide-react'
import type { MerchantSummary } from '@/types/merchant'
import { formatDistanceToNow } from 'date-fns'
import Image from 'next/image'

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
  active: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  inactive: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  onboarding: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
}

export function MerchantCard({ merchant, onClick }: MerchantCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Image src={merchant} className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{merchant.name}</h3>
              {merchant.type && (
                <p className="text-sm text-muted-foreground capitalize">{merchant.type}</p>
              )}
            </div>
          </div>
          <Badge className={statusColors[merchant.derived_status] || statusColors.onboarding}>
            {merchant.derived_status}
          </Badge>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <Stat
            icon={<MapPin className="h-4 w-4" />}
            label="Locations"
            value={`${merchant.active_locations} / ${merchant.total_locations}`}
          />
          <Stat
            icon={<Users className="h-4 w-4" />}
            label="Staff"
            value={merchant.active_staff_count}
          />
          <Stat
            icon={<ShoppingCart className="h-4 w-4" />}
            label="Orders Today"
            value={merchant.orders_today}
          />
          <Stat
            icon={<DollarSign className="h-4 w-4" />}
            label="Revenue Today"
            value={formatCurrency(merchant.revenue_today)}
          />
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {merchant.last_order_at
              ? `Last order ${formatDistanceToNow(new Date(merchant.last_order_at), { addSuffix: true })}`
              : 'No orders yet'}
          </p>
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
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  )
}
