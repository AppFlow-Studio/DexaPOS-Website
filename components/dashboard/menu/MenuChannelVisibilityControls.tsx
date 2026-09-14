'use client'

import { Monitor, ShoppingBag, Tablet } from 'lucide-react'
import { useRef, useState } from 'react'

import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { MenuChannelVisibility } from '@/lib/menu/menu-channel-visibility'

interface MenuChannelVisibilityControlsProps {
  value: MenuChannelVisibility
  /**
   * Persist the change. Return `false` (or reject) to tell the switch the write
   * failed, and it flips itself back. Returning nothing counts as success — a
   * caller that does not report failure simply never gets a rollback.
   */
  onChange: (value: MenuChannelVisibility) => void | Promise<boolean | void>
  /**
   * Whether the control can be used at all — no location selected, say. NOT for
   * "a save is in flight": these switches are optimistic on purpose, and
   * disabling them mid-write is the lag this component exists to avoid.
   */
  disabled?: boolean
  compact?: boolean
}

const channels = [
  { key: 'is_visible_on_pos', label: 'POS', icon: Monitor },
  { key: 'is_visible_on_kiosk', label: 'Kiosk', icon: Tablet },
  { key: 'is_visible_online', label: 'Online Ordering', icon: ShoppingBag },
] as const

const sameVisibility = (
  a: MenuChannelVisibility,
  b: MenuChannelVisibility,
): boolean =>
  a.is_visible_on_pos === b.is_visible_on_pos &&
  a.is_visible_on_kiosk === b.is_visible_on_kiosk &&
  a.is_visible_online === b.is_visible_online

export function MenuChannelVisibilityControls({
  value,
  onChange,
  disabled = false,
  compact = false,
}: MenuChannelVisibilityControlsProps) {
  // What the user asked for (`intent`), plus the server value at the moment
  // they asked (`base`).
  //
  // The round trip is a server action plus four query invalidations — the best
  // part of a second — and a switch that waits for all of that before moving
  // reads as broken. So the switch moves now and the write catches up.
  const [pending, setPending] = useState<{
    intent: MenuChannelVisibility
    base: MenuChannelVisibility
  } | null>(null)

  // Identifies the write currently in flight. A second toggle before the first
  // returns supersedes it: without this, the slower response would roll the
  // switch back to a state the user has already moved past.
  const writeIdRef = useRef(0)

  // Derived, not synchronised: the override holds only while the server still
  // shows what it showed when the switch was flipped. The moment `value` moves
  // — the invalidated query refetching, or someone editing in another tab — the
  // server wins and the override lapses on its own. Clearing it in an effect
  // instead would both cascade a render and briefly expose the stale query
  // value, making the switch visibly bounce.
  const shown =
    pending && sameVisibility(pending.base, value) ? pending.intent : value

  const handleToggle = async (
    key: (typeof channels)[number]['key'],
    checked: boolean,
  ) => {
    const next = { ...shown, [key]: checked }
    const writeId = ++writeIdRef.current
    setPending({ intent: next, base: value })

    let committed = true
    try {
      committed = (await onChange(next)) !== false
    } catch {
      committed = false
    }

    // Only the newest write may roll back, and only to the server's value —
    // which is still the pre-toggle state, since the write failed.
    if (!committed && writeIdRef.current === writeId) setPending(null)
  }

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
            checked={shown[key]}
            disabled={disabled}
            aria-label={`${label} visibility`}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(checked) => {
              void handleToggle(key, checked)
            }}
          />
        </label>
      ))}
    </div>
  )
}
