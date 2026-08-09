'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CircleSlash,
  MapPin,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Layers,
  PowerOff,
  FolderTree,
  UtensilsCrossed,
} from 'lucide-react'
import {
  PageShell,
  PageHeader,
  LocationIndicator,
  Panel,
  PanelSection,
} from '@/components/dashboard/shell'
import { availabilityStatusStyle } from '@/lib/constants/availability-status'
import { cn } from '@/lib/utils'
import {
  useGatedLocationId,
  useGatedLocation,
  useIsSingleLocation,
} from '@/stores/location-store'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import {
  useActiveSnoozes,
  useTurnedOffItems,
  useSetItemAvailability,
  useRestoreItem,
  useRestoreModifier,
  useRestoreModifierGroup,
  useRestoreCategory,
} from '@/lib/queries/use-snoozes'

/** "infinity" (until-manual) vs a real timestamp. */
function snoozeLabel(snoozedUntil: string): string {
  const t = new Date(snoozedUntil).getTime()
  if (!Number.isFinite(t)) return 'Until manually restored'
  return `Back ${formatDistanceToNow(new Date(snoozedUntil), { addSuffix: true })}`
}

export default function OutOfStockPage() {
  const gatedLocationId = useGatedLocationId()
  const selectedLocationId = gatedLocationId ?? 'all'
  const isAllLocations = !gatedLocationId
  const isSingleLocation = useIsSingleLocation()
  const selectedLocation = useGatedLocation()
  const { data: userInfo } = useUserInfo()
  const clerkOrgId: string | undefined = userInfo?.members?.[0]?.organizations?.id

  const { data, isLoading, isError, error } = useActiveSnoozes(
    clerkOrgId,
    selectedLocationId,
  )
  // Items deliberately turned off (is_available=false, no timed snooze). Distinct
  // from 86: the auto-restore cron never clears these, so they must be visible
  // and restorable here — the gap that stranded item 311 at a single-loc store.
  const { data: turnedOffData } = useTurnedOffItems(clerkOrgId, selectedLocationId)

  const restoreItem = useRestoreItem()
  const restoreModifier = useRestoreModifier()
  const restoreModifierGroup = useRestoreModifierGroup()
  const restoreCategory = useRestoreCategory()
  const setAvailability = useSetItemAvailability()

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const items = data?.items ?? []
  const modifiers = data?.modifiers ?? []
  const categories = data?.categories ?? []
  const turnedOff = turnedOffData ?? []
  const total = items.length + modifiers.length + categories.length + turnedOff.length

  // Collapse snoozed options under their parent modifier group so a whole-group
  // 86 reads as one block (with a "Restore group" action), not N loose rows.
  //
  // Optimistic snoozes can land with modifier_group_id === '' (use-snoozes.ts
  // falls back to '' when the mutation can't resolve a group). An empty string
  // is a valid Map key but NOT a valid React key, so bucket those rows under a
  // per-option sentinel: they render as their own single-option group until the
  // refetch supplies the real id, instead of colliding into one keyless block.
  const modifierGroups = Array.from(
    modifiers
      .reduce((map, m) => {
        const bucket = m.modifier_group_id || `ungrouped:${m.modifier_group_item_id}`
        const g = map.get(bucket) ?? {
          bucket,
          groupId: m.modifier_group_id,
          groupName: m.group_name,
          options: [] as typeof modifiers,
        }
        g.options.push(m)
        map.set(bucket, g)
        return map
      }, new Map<
        string,
        { bucket: string; groupId: string; groupName: string; options: typeof modifiers }
      >())
      .values(),
  )

  const isRestoring =
    restoreItem.isPending ||
    restoreModifier.isPending ||
    restoreModifierGroup.isPending ||
    restoreCategory.isPending ||
    setAvailability.isPending

  const handleEnableItem = (menuItemId: string) => {
    if (!clerkOrgId || isAllLocations) return
    setAvailability.mutate({
      clerkOrgId,
      menuItemId,
      isAvailable: true,
      locationId: selectedLocationId,
      normalizeGlobal: isSingleLocation,
    })
  }

  const handleRestoreItem = (menuItemId: string) => {
    if (!clerkOrgId || isAllLocations) return
    restoreItem.mutate({ clerkOrgId, menuItemId, locationId: selectedLocationId })
  }
  const handleRestoreModifier = (modifierGroupItemId: string) => {
    if (!clerkOrgId || isAllLocations) return
    restoreModifier.mutate({ clerkOrgId, modifierGroupItemId, locationId: selectedLocationId })
  }
  const handleRestoreGroup = (modifierGroupId: string) => {
    if (!clerkOrgId || isAllLocations) return
    restoreModifierGroup.mutate({ clerkOrgId, modifierGroupId, locationId: selectedLocationId })
  }
  const handleRestoreCategory = (categoryId: string) => {
    if (!clerkOrgId || isAllLocations) return
    restoreCategory.mutate({ clerkOrgId, categoryId, locationId: selectedLocationId })
  }
  const handleRestoreAll = () => {
    if (!clerkOrgId || isAllLocations) return
    items.forEach((i) =>
      restoreItem.mutate({ clerkOrgId, menuItemId: i.menu_item_id, locationId: selectedLocationId }),
    )
    modifiers.forEach((m) =>
      restoreModifier.mutate({
        clerkOrgId,
        modifierGroupItemId: m.modifier_group_item_id,
        locationId: selectedLocationId,
      }),
    )
    categories.forEach((c) =>
      restoreCategory.mutate({ clerkOrgId, categoryId: c.category_id, locationId: selectedLocationId }),
    )
    turnedOff.forEach((t) => handleEnableItem(t.menu_item_id))
  }

  if (!mounted) return <PageSkeleton />

  const header = (
    <PageHeader
      title="86’d Items"
      subtitle="Items, modifiers, and categories currently marked out of stock. 86ing hides them from the POS, your online store, and connected delivery apps."
      indicator={
        <LocationIndicator
          isAllLocations={isAllLocations}
          locationName={selectedLocation?.name}
        />
      }
      actions={
        total > 0 ? (
          <Button
            variant="outline"
            onClick={handleRestoreAll}
            disabled={isRestoring}
            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
          >
            {isRestoring ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            Restore all
          </Button>
        ) : undefined
      }
    />
  )

  if (isAllLocations) {
    return (
      <PageShell>
        {header}
        <Panel>
          <MessageState
            icon={MapPin}
            title="Select a Location"
            description="Out-of-stock status is tracked per location. Pick a location from the top bar to see and manage its 86’d items."
          />
        </Panel>
      </PageShell>
    )
  }

  if (isLoading) return <PageSkeleton />

  if (isError) {
    return (
      <PageShell>
        {header}
        <Panel>
          <MessageState
            icon={AlertTriangle}
            tone="destructive"
            title="Failed to load 86’d items"
            description={error instanceof Error ? error.message : 'Unknown error'}
          />
        </Panel>
      </PageShell>
    )
  }

  return (
    <PageShell>
      {header}

      {total === 0 ? (
        <Panel>
          <MessageState
            icon={CircleSlash}
            title="Nothing is 86’d"
            description="When you or the POS marks an item or modifier out of stock, it will show up here."
          />
        </Panel>
      ) : (
        <>
          {categories.length > 0 && (
            <Panel>
              <PanelSection
                icon={FolderTree}
                label="Categories"
                value={categories.length}
                caption="Every item inside these is hidden while the category is 86’d."
              >
                <RowList>
                  {categories.map((c) => (
                    <SnoozeRow
                      key={c.category_id}
                      title={c.name}
                      subtitle={c.snooze_reason ?? 'Every item in this category is Sold Out'}
                      snoozedUntil={c.snoozed_until}
                      disabled={isRestoring}
                      onRestore={() => handleRestoreCategory(c.category_id)}
                    />
                  ))}
                </RowList>
              </PanelSection>
            </Panel>
          )}

          {items.length > 0 && (
            <Panel>
              <PanelSection
                icon={UtensilsCrossed}
                label="Items"
                value={items.length}
                caption="Timed 86s. These come back on their own when the snooze expires."
              >
                <RowList>
                  {items.map((i) => (
                    <SnoozeRow
                      key={i.menu_item_id}
                      title={i.name}
                      subtitle={i.snooze_reason}
                      snoozedUntil={i.snoozed_until}
                      disabled={isRestoring}
                      onRestore={() => handleRestoreItem(i.menu_item_id)}
                    />
                  ))}
                </RowList>
              </PanelSection>
            </Panel>
          )}

          {turnedOff.length > 0 && (
            <Panel>
              <PanelSection
                icon={PowerOff}
                label="Turned off"
                value={turnedOff.length}
                caption="Manually turned off at this location (not a timed 86). These stay off until switched back on."
              >
                <RowList>
                  {turnedOff.map((t) => (
                    <Row
                      key={t.menu_item_id}
                      title={t.name}
                      badge={
                        <StatusBadge status="turned_off" icon={PowerOff}>
                          Turned off
                        </StatusBadge>
                      }
                      subtitle={`Off since ${formatDistanceToNow(new Date(t.updated_at), {
                        addSuffix: true,
                      })}`}
                      action={
                        <RowAction
                          label="Turn on"
                          disabled={isRestoring}
                          onClick={() => handleEnableItem(t.menu_item_id)}
                        />
                      }
                    />
                  ))}
                </RowList>
              </PanelSection>
            </Panel>
          )}

          {modifiers.length > 0 && (
            <Panel>
              <PanelSection
                icon={Layers}
                label="Modifiers"
                value={modifiers.length}
                caption="Grouped by modifier group so a whole-group 86 reads as one block."
              >
                <div className="space-y-4">
                  {modifierGroups.map((grp) => (
                    <div
                      key={grp.bucket}
                      // px-3 below `sm`: this card's padding compounds with the
                      // section's own, and 32px of combined inset on a 320px
                      // viewport is what pushes the rows past the edge.
                      className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card px-3 py-4 shadow-none sm:px-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <div className="flex min-w-0 flex-1 basis-56 flex-wrap items-center gap-x-2 gap-y-1">
                          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 break-words text-sm font-medium">
                            {grp.groupName}
                          </span>
                          <StatusBadge status="snoozed">
                            <span className="tabular-nums">{grp.options.length}</span>
                            &nbsp;out of stock
                          </StatusBadge>
                        </div>
                        {/* A sentinel bucket (no resolved group id) always holds
                            exactly one option, so restore it directly rather
                            than firing a group mutation with an empty id. */}
                        <RowAction
                          label={grp.groupId ? 'Restore group' : 'Restore'}
                          disabled={isRestoring}
                          onClick={() =>
                            grp.groupId
                              ? handleRestoreGroup(grp.groupId)
                              : handleRestoreModifier(grp.options[0].modifier_group_item_id)
                          }
                        />
                      </div>

                      <div className="mt-1">
                        <RowList>
                          {grp.options.map((m) => (
                            <SnoozeRow
                              key={m.modifier_group_item_id}
                              title={m.name}
                              subtitle={m.snooze_reason}
                              snoozedUntil={m.snoozed_until}
                              disabled={isRestoring}
                              onRestore={() => handleRestoreModifier(m.modifier_group_item_id)}
                            />
                          ))}
                        </RowList>
                      </div>
                    </div>
                  ))}
                </div>
              </PanelSection>
            </Panel>
          )}
        </>
      )}
    </PageShell>
  )
}

/**
 * Hairline-separated list (§5). Rows are separated by rules rather than each
 * owning a `<Card>` — a stack of bordered cards inside a bordered panel is the
 * "boxes inside boxes" the design language exists to remove.
 */
function RowList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border/60">{children}</div>
}

/** Soft tint + 6px dot, colours from a constants module (DS-CTL-09 / D-11). */
function StatusBadge({
  status,
  icon: Icon,
  children,
  className,
}: {
  status: 'snoozed' | 'turned_off'
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  className?: string
}) {
  const style = availabilityStatusStyle(status)
  return (
    <span
      className={cn(
        // `shrink-0` + `whitespace-nowrap`: the badge keeps its full width and
        // WRAPS to its own line (every caller's row is `flex-wrap`) instead of
        // compressing. Letting it shrink inside a `flex-1` column next to a
        // rigid button ellipsised the label at 320px even with room to spare.
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        style.bg,
        style.text,
        className,
      )}
    >
      {Icon ? (
        <Icon className="h-3 w-3 shrink-0" />
      ) : (
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
      )}
      {children}
    </span>
  )
}

/** The restore control on a row — a pill, quieter than the header CTA. */
function RowAction({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-8 shrink-0 rounded-full px-3.5 text-[0.8125rem] font-medium shadow-sm"
    >
      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
      {label}
    </Button>
  )
}

/**
 * One record in a list. The name and its badge share a `flex-1` row with a
 * spacer so the pair wraps instead of overflowing at 320px, rather than the
 * name truncating while the badge keeps its full width.
 */
function Row({
  title,
  badge,
  subtitle,
  action,
}: {
  title: string
  badge: React.ReactNode
  subtitle?: string | null
  action: React.ReactNode
}) {
  // `basis-56` on the text column: with a bare `flex-1` (basis 0) it is sized
  // by whatever the rigid action button leaves over — ~122px at 320px — and a
  // nowrap badge then spills out from under it and sits beneath the button.
  // A real basis makes the row wrap the button onto its own line instead.
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words text-sm font-medium">{title}</span>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-0.5 break-words text-[0.8125rem] text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

function SnoozeRow({
  title,
  subtitle,
  snoozedUntil,
  disabled,
  onRestore,
}: {
  title: string
  subtitle: string | null
  snoozedUntil: string
  disabled: boolean
  onRestore: () => void
}) {
  return (
    <Row
      title={title}
      badge={
        <StatusBadge status="snoozed">
          {snoozeLabel(snoozedUntil)}
        </StatusBadge>
      }
      subtitle={subtitle}
      action={<RowAction label="Restore" disabled={disabled} onClick={onRestore} />}
    />
  )
}

/**
 * The centred icon + message used for the empty, error and no-location states.
 * One component so all three share a treatment — previously three near-copies
 * with a 48px icon each, which read as an error even when nothing was wrong.
 */
function MessageState({
  icon: Icon,
  title,
  description,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  tone?: 'default' | 'destructive'
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className={cn(
          'mb-4 flex size-11 shrink-0 items-center justify-center rounded-full',
          tone === 'destructive'
            ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
            : 'bg-muted/60 text-muted-foreground',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="text-[1.0625rem] font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function PageSkeleton() {
  return (
    <PageShell>
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      {Array.from({ length: 2 }).map((_, s) => (
        <Panel key={s}>
          <div className="px-6 py-8">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-8 w-12" />
            <div className="mt-5 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </Panel>
      ))}
    </PageShell>
  )
}
