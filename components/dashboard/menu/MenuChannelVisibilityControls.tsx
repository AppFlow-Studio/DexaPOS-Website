'use client'

import { Monitor, ShoppingBag, Tablet } from 'lucide-react'

import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { MenuChannelVisibility } from '@/lib/menu/menu-channel-visibility'

interface MenuChannelVisibilityControlsProps {
  value: MenuChannelVisibility
  onChange: (value: MenuChannelVisibility) => void
  disabled?: boolean
  compact?: boolean
}

const channels = [
  { key: 'is_visible_on_pos', label: 'POS', icon: Monitor },
  { key: 'is_visible_on_kiosk', label: 'Kiosk', icon: Tablet },
  { key: 'is_visible_online', label: 'Online Ordering', icon: ShoppingBag },
] as const

export function MenuChannelVisibilityControls({
  value,
  onChange,
  disabled = false,
  compact = false,
}: MenuChannelVisibilityControlsProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2',
        !compact && 'rounded-xl bg-muted/35 p-4',
      )}
      aria-label="Menu platform visibility"
    >
      {channels.map(({ key, label, icon: Icon }) => (
        <label
          key={key}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'flex cursor-pointer items-center gap-2 text-sm',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className={cn(compact && label === 'Online Ordering' && 'sr-only lg:not-sr-only')}>
            {label}
          </span>
          <Switch
            checked={value[key]}
            disabled={disabled}
            aria-label={`${label} visibility`}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(checked) => onChange({ ...value, [key]: checked })}
          />
        </label>
      ))}
    </div>
  )
}
