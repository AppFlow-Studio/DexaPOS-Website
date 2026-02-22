'use client'

import { Badge } from '@/components/ui/badge'
import type { OrderType } from '@/types/order-management'

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  dine_in: 'Dine In',
  takeout: 'Takeout',
  delivery: 'Delivery',
  online: 'Online',
  catering: 'Catering',
}

const ALL_ORDER_TYPES: OrderType[] = [
  'dine_in',
  'takeout',
  'delivery',
  'online',
  'catering',
]

interface OrderTypeFilterProps {
  selected: OrderType[]
  onChange: (types: OrderType[]) => void
  className?: string
}

export function OrderTypeFilter({
  selected,
  onChange,
  className,
}: OrderTypeFilterProps) {
  const isAllSelected = selected.length === 0

  const toggle = (type: OrderType) => {
    if (selected.includes(type)) {
      onChange(selected.filter((t) => t !== type))
    } else {
      onChange([...selected, type])
    }
  }

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className ?? ''}`}>
      <Badge
        variant={isAllSelected ? 'default' : 'outline'}
        className="cursor-pointer select-none"
        onClick={() => onChange([])}
      >
        All
      </Badge>
      {ALL_ORDER_TYPES.map((type) => (
        <Badge
          key={type}
          variant={selected.includes(type) ? 'default' : 'outline'}
          className="cursor-pointer select-none"
          onClick={() => toggle(type)}
        >
          {ORDER_TYPE_LABELS[type]}
        </Badge>
      ))}
    </div>
  )
}
