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
   *
   * Called one at a time: a toggle made while a write is still running waits
   * for it rather than racing it, and a burst of toggles collapses so only the
   * user's latest intent is sent. See the write queue below for why.
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
  // The optimistic override: what the user asked for (`intent`), and which
  // server values that intent is allowed to sit on top of (`over`).
  //
  // The round trip is a server action plus four query invalidations — the best
  // part of a second — and a switch that waits for all of that before moving
  // reads as broken. So the switch moves now and the write catches up.
  //
  // `over: null` means writes are still outstanding, and the user's intent wins
  // outright: every value the server can report mid-burst is either one of our
  // own writes landing or a state the user has already moved past, and
  // deferring to either would bounce the switch under their finger. Once the
  // burst drains, `over` narrows to the two values that still mean "our own
  // write": the one the burst started from (a caller that does not refetch
  // leaves the server showing it) and the one we last wrote.
  const [pending, setPending] = useState<{
    intent: MenuChannelVisibility
    over: MenuChannelVisibility[] | null
  } | null>(null)

  // The write queue.
  //
  // Writes carry the whole visibility object, so they MUST be serialised. Two
  // in flight at once and the slower one lands last, overwriting the field the
  // faster one just set with the stale value it was still carrying — the
  // user's second toggle silently reverts on the server while the switch goes
  // on showing it as applied.
  //
  // `queued` holds the newest intent not yet sent, so a burst of toggles
  // collapses into a single follow-up write; `draining` says a loop is already
  // running and will pick that intent up.
  const queuedRef = useRef<MenuChannelVisibility | null>(null)
  const drainingRef = useRef(false)
  // The server value the current burst started from — see `over`.
  const burstBaseRef = useRef<MenuChannelVisibility>(value)

  // Derived, not synchronised: the override lapses on its own once the server
  // shows something that is not ours — someone editing in another tab, say.
  // Clearing it in an effect instead would both cascade a render and briefly
  // expose the stale query value, making the switch visibly bounce.
  const shown =
    pending &&
    (pending.over === null ||
      pending.over.some((seen) => sameVisibility(seen, value)))
      ? pending.intent
      : value

  const drain = async () => {
    drainingRef.current = true
    try {
      while (queuedRef.current) {
        const intent = queuedRef.current
        queuedRef.current = null

        let committed = true
        try {
          committed = (await onChange(intent)) !== false
        } catch {
          committed = false
        }

        if (!committed) {
          // The failed write and anything queued behind it go together: each
          // was built on top of the one before, so replaying the tail against
          // the server's rolled-back value would persist states the user never
          // asked for.
          queuedRef.current = null
          setPending(null)
          return
        }

        // Last write of the burst: hand the override a concrete base again so
        // a later edit from elsewhere can supersede it.
        if (!queuedRef.current) {
          setPending({ intent, over: [burstBaseRef.current, intent] })
        }
      }
    } finally {
      drainingRef.current = false
    }
  }

  const handleToggle = (
    key: (typeof channels)[number]['key'],
    checked: boolean,
  ) => {
    // `queued` takes precedence: two toggles inside one tick share a render, so
    // `shown` has not caught up with the first of them yet.
    const next = { ...(queuedRef.current ?? shown), [key]: checked }
    const starting = !drainingRef.current

    if (starting) burstBaseRef.current = value
    setPending({ intent: next, over: null })
    queuedRef.current = next
    if (starting) void drain()
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
              handleToggle(key, checked)
            }}
          />
        </label>
      ))}
    </div>
  )
}
