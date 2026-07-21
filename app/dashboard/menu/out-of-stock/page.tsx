'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import { CircleSlash, MapPin, AlertTriangle, RotateCcw, Loader2, Layers } from 'lucide-react'
import { useGatedLocationId, useGatedLocation } from '@/stores/location-store'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'
import {
  useActiveSnoozes,
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
  const selectedLocation = useGatedLocation()
  const { data: userInfo } = useUserInfo()
  const clerkOrgId: string | undefined = userInfo?.members?.[0]?.organizations?.id

  const { data, isLoading, isError, error } = useActiveSnoozes(
    clerkOrgId,
    selectedLocationId,
  )

  const restoreItem = useRestoreItem()
  const restoreModifier = useRestoreModifier()
  const restoreModifierGroup = useRestoreModifierGroup()
  const restoreCategory = useRestoreCategory()

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const items = data?.items ?? []
  const modifiers = data?.modifiers ?? []
  const categories = data?.categories ?? []
  const total = items.length + modifiers.length + categories.length

  // Collapse snoozed options under their parent modifier group so a whole-group
  // 86 reads as one block (with a "Restore group" action), not N loose rows.
  const modifierGroups = Array.from(
    modifiers
      .reduce((map, m) => {
        const g = map.get(m.modifier_group_id) ?? {
          groupId: m.modifier_group_id,
          groupName: m.group_name,
          options: [] as typeof modifiers,
        }
        g.options.push(m)
        map.set(m.modifier_group_id, g)
        return map
      }, new Map<string, { groupId: string; groupName: string; options: typeof modifiers }>())
      .values(),
  )

  const isRestoring =
    restoreItem.isPending ||
    restoreModifier.isPending ||
    restoreModifierGroup.isPending ||
    restoreCategory.isPending

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
  }

  if (!mounted) return <PageSkeleton />

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">86&rsquo;d Items</h2>
        <p className="text-muted-foreground">
          Items, modifiers, and categories currently marked out of stock
          {selectedLocation?.name ? (
            <>
              {' '}at <span className="font-medium">{selectedLocation.name}</span>
            </>
          ) : null}
          . 86ing hides them from the POS, your online store, and connected delivery apps.
        </p>
      </div>
      {total > 0 && (
        <Button variant="outline" onClick={handleRestoreAll} disabled={isRestoring}>
          {isRestoring ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="mr-2 h-4 w-4" />
          )}
          Restore all
        </Button>
      )}
    </div>
  )

  if (isAllLocations) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MapPin className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">Select a Location</h3>
            <p className="max-w-md text-muted-foreground">
              Out-of-stock status is tracked per location. Pick a location from the top bar
              to see and manage its 86&rsquo;d items.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) return <PageSkeleton />

  if (isError) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
            <h3 className="mb-2 text-lg font-semibold">Failed to load 86&rsquo;d items</h3>
            <p className="max-w-md text-muted-foreground">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      {total === 0 ? (
        <Empty
          icon={CircleSlash}
          title="Nothing is 86'd"
          description="When you or the POS marks an item or modifier out of stock, it will show up here."
        />
      ) : (
        <div className="space-y-6">
          {categories.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Categories ({categories.length})
              </h3>
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
            </section>
          )}

          {items.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Items ({items.length})
              </h3>
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
            </section>
          )}

          {modifiers.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Modifiers ({modifiers.length})
              </h3>
              {modifierGroups.map((grp) => (
                <div
                  key={grp.groupId}
                  className="space-y-2 rounded-lg border bg-muted/30 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Layers className="h-4 w-4 shrink-0 text-purple-600" />
                      <span className="truncate font-medium">{grp.groupName}</span>
                      <Badge variant="secondary" className="shrink-0">
                        {grp.options.length} out of stock
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestoreGroup(grp.groupId)}
                      disabled={isRestoring}
                      className="shrink-0"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restore group
                    </Button>
                  </div>
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
                </div>
              ))}
            </section>
          )}
        </div>
      )}
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
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{title}</p>
            <Badge variant="secondary" className="shrink-0">
              <CircleSlash className="mr-1 h-3 w-3" />
              {snoozeLabel(snoozedUntil)}
            </Badge>
          </div>
          {subtitle && (
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRestore}
          disabled={disabled}
          className="shrink-0"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Restore
        </Button>
      </CardContent>
    </Card>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  )
}
