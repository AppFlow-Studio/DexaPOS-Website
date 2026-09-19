'use client'

import { AlertTriangle, EyeOff, Loader2, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Station } from '@/app/dashboard/actions/stations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import {
  isMenuHiddenOnStationChannel,
  isStationMenuSelectionDirty,
  stationMenuChannel,
  stationMenuChannelLabel,
  type StationMenuOption,
  type StationMenuSelection,
} from '@/lib/stations/station-menu-scope'
import { cn } from '@/lib/utils'

import {
  useSetStationMenuScope,
  useStationMenuOptions,
  useStationMenuScope,
} from '../../hooks/useStationMenuScope'
import {
  StationPanel,
  StationPanelContent,
  StationPanelDescription,
  StationPanelHeader,
  StationPanelTitle,
} from './StationPanel'

interface StationMenusTabProps {
  station: Station
}

/**
 * Per-station menu scope: "All menus" (today's behaviour — every menu visible
 * on this station's channel) or "Selected menus" with a checklist.
 *
 * Explicit Save rather than optimistic per-toggle writes: the server replaces
 * the whole selection in one RPC so a tablet syncing mid-edit never sees a
 * half-written list, and a manager ticking six boxes should not fire six
 * round trips and six menu rebuilds on every station in the store.
 *
 * The channel toggle (location_menus.is_visible_on_pos / _kiosk) always wins,
 * so a selected menu that is hidden on this station's channel carries an
 * inline warning: it will not render here even though it is ticked.
 *
 * Selected with nothing ticked is allowed and renders NOTHING on the device —
 * that is the fail-closed contract — so it gets a warning, not a block.
 */
export function StationMenusTab({ station }: StationMenusTabProps) {
  const channel = stationMenuChannel(station.station_type)
  const channelLabel = stationMenuChannelLabel(channel)

  const scopeQuery = useStationMenuScope(station.id)
  const optionsQuery = useStationMenuOptions(station.location_id)
  const save = useSetStationMenuScope()

  const saved = useMemo<StationMenuSelection>(
    () => ({
      scope: scopeQuery.data?.scope ?? 'all',
      menuIds: scopeQuery.data?.menuIds ?? [],
    }),
    [scopeQuery.data],
  )

  // `null` = no local edits; the form shows the saved state.
  const [draft, setDraft] = useState<StationMenuSelection | null>(null)
  const current = draft ?? saved
  const isDirty = draft !== null && isStationMenuSelectionDirty(saved, draft)
  const schemaMissing = scopeQuery.data?.schemaMissing === true
  const disabled = schemaMissing || scopeQuery.isLoading || save.isPending

  const options = useMemo<StationMenuOption[]>(
    () => optionsQuery.data ?? [],
    [optionsQuery.data],
  )
  const selectedSet = useMemo(() => new Set(current.menuIds), [current.menuIds])

  // Name filter for the checklist only. Counts, warnings and the save payload
  // still read from the full `options` list so a ticked menu that is filtered
  // out of view is never silently dropped.
  const [search, setSearch] = useState('')
  const visibleOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [options, search])

  // Ids that are ticked but no longer exist at this location (a deleted or
  // moved menu). They are shown so the manager knows why the count is off,
  // and dropped on the next save.
  const orphanIds = useMemo(() => {
    const known = new Set(options.map((o) => o.id))
    return current.menuIds.filter((id) => !known.has(id))
  }, [options, current.menuIds])

  const selectedVisibleCount = options.filter(
    (o) => selectedSet.has(o.id) && !isMenuHiddenOnStationChannel(o, channel),
  ).length
  const showsNothing = current.scope === 'selected' && selectedVisibleCount === 0

  const setScope = (scope: StationMenuSelection['scope']) =>
    setDraft({ scope, menuIds: current.menuIds })

  const toggleMenu = (menuId: string, checked: boolean) => {
    const next = new Set(current.menuIds)
    if (checked) next.add(menuId)
    else next.delete(menuId)
    setDraft({ scope: 'selected', menuIds: Array.from(next) })
  }

  const handleSave = async () => {
    if (!isDirty) return
    try {
      await save.mutateAsync({
        stationId: station.id,
        scope: current.scope,
        menuIds: current.scope === 'selected' ? current.menuIds : [],
      })
      setDraft(null)
    } catch {
      // Toast raised by the mutation; keep the draft so nothing is lost.
    }
  }

  if (station.station_type === 'kds') return null

  return (
    <StationPanel>
      <StationPanelHeader>
        <StationPanelTitle>Menus</StationPanelTitle>
        <StationPanelDescription>
          Choose which menus this station shows. The location&apos;s{' '}
          {channelLabel} visibility switch on each menu still applies — a menu
          hidden on {channelLabel} will not appear here even when selected.
        </StationPanelDescription>
      </StationPanelHeader>

      <StationPanelContent className="space-y-6">
        {scopeQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-48 rounded-full" />
            <Skeleton className="h-6 w-56 rounded-full" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : scopeQuery.isError ? (
          <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-muted/60 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="text-sm">
              Could not load this station&apos;s menus.{' '}
              {scopeQuery.error instanceof Error ? scopeQuery.error.message : ''}
            </p>
          </div>
        ) : (
          <>
            {schemaMissing && (
              <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-muted/60 p-4">
                <AlertTriangle className="h-5 w-5 shrink-0 text-muted-foreground" />
                <p className="text-sm">
                  Per-station menus are not deployed to this environment yet.
                  Every station shows all menus.
                </p>
              </div>
            )}

            <RadioGroup
              value={current.scope}
              onValueChange={(value) =>
                setScope(value === 'selected' ? 'selected' : 'all')
              }
              disabled={disabled}
              aria-label="Menu scope"
              className="gap-4"
            >
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-2xl bg-muted/40 p-4',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <RadioGroupItem value="all" id="menu-scope-all" className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block font-medium">All menus</span>
                  <span className="block text-sm text-muted-foreground">
                    Every menu that is visible on {channelLabel} at this
                    location. This is the default.
                  </span>
                </span>
              </label>

              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-2xl bg-muted/40 p-4',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <RadioGroupItem
                  value="selected"
                  id="menu-scope-selected"
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block font-medium">Selected menus</span>
                  <span className="block text-sm text-muted-foreground">
                    Only the menus ticked below. Nothing else shows on this
                    station.
                  </span>
                </span>
              </label>
            </RadioGroup>

            {current.scope === 'selected' && (
              <div className="space-y-3" data-testid="station-menu-checklist">
                {options.length > 0 && (
                  <div className="relative min-w-0 sm:max-w-[300px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                    <Input
                      placeholder="Search menus..."
                      className="h-10 w-full rounded-full pl-10"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Search menus"
                    />
                  </div>
                )}

                {optionsQuery.isLoading ? (
                  <Skeleton className="h-32 w-full rounded-2xl" />
                ) : optionsQuery.isError ? (
                  <p className="text-sm text-muted-foreground">
                    Could not load this location&apos;s menus.
                  </p>
                ) : options.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This location has no menus yet.
                  </p>
                ) : visibleOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No menus match &ldquo;{search.trim()}&rdquo;.
                  </p>
                ) : (
                  <ul className="divide-y-0 space-y-1">
                    {visibleOptions.map((menu) => {
                      const checked = selectedSet.has(menu.id)
                      const hiddenOnChannel = isMenuHiddenOnStationChannel(
                        menu,
                        channel,
                      )
                      const inactive = !menu.is_active_at_location
                      const inputId = `station-menu-${menu.id}`
                      return (
                        <li key={menu.id}>
                          <label
                            htmlFor={inputId}
                            className={cn(
                              'flex min-w-0 cursor-pointer items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-muted/40',
                              disabled && 'cursor-not-allowed opacity-60',
                            )}
                          >
                            <Checkbox
                              id={inputId}
                              checked={checked}
                              disabled={disabled}
                              onCheckedChange={(value) =>
                                toggleMenu(menu.id, value === true)
                              }
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 flex-wrap items-center gap-2">
                                <span
                                  className={cn(
                                    'font-medium',
                                    inactive && 'text-muted-foreground',
                                  )}
                                >
                                  {menu.name}
                                </span>
                                {inactive && (
                                  <Badge className="rounded-full border-0 bg-muted/60 px-2 text-xs font-medium text-foreground">
                                    Inactive at this location
                                  </Badge>
                                )}
                                {hiddenOnChannel && (
                                  <Badge className="rounded-full border-0 bg-muted/60 px-2 text-xs font-medium text-foreground">
                                    <EyeOff className="mr-1 h-3 w-3" />
                                    Hidden on {channelLabel}
                                  </Badge>
                                )}
                              </span>
                              {checked && hiddenOnChannel && (
                                <span
                                  role="status"
                                  className="mt-1 block text-sm text-muted-foreground"
                                >
                                  This menu is switched off for {channelLabel} at
                                  this location, so it will not show on this
                                  station even though it is selected. Turn it on
                                  under Menu → visibility to use it here.
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {orphanIds.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {orphanIds.length} selected menu
                    {orphanIds.length === 1 ? ' is' : 's are'} no longer available
                    at this location and will be dropped on save.
                  </p>
                )}

                {showsNothing && !optionsQuery.isLoading && (
                  <div
                    role="status"
                    className="flex min-w-0 items-start gap-3 rounded-2xl bg-muted/60 p-4"
                  >
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <p className="text-sm">
                      <span className="font-medium">
                        This station will show no menus.
                      </span>{' '}
                      No selected menu is visible on {channelLabel}. Staff and
                      customers will see &ldquo;No menus assigned to this
                      station&rdquo; until one is selected.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {isDirty
                  ? 'Unsaved changes.'
                  : 'The station picks changes up on its next menu check, within a few minutes — no manual sync needed.'}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="h-9 rounded-full px-4 text-[0.8125rem] font-medium"
                  onClick={() => setDraft(null)}
                  disabled={!isDirty || save.isPending}
                >
                  Discard
                </Button>
                <Button
                  className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                  onClick={handleSave}
                  disabled={!isDirty || disabled}
                >
                  {save.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save menus'
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </StationPanelContent>
    </StationPanel>
  )
}
