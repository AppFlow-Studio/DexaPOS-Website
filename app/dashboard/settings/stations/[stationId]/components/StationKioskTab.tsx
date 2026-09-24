'use client'

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { Station } from '@/app/dashboard/actions/stations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import {
  KIOSK_SEAT_LABEL_MAX,
  KIOSK_SEAT_OPTIONS_MAX,
  buildSeatRange,
  isStationKioskSettingsDirty,
  normalizeSeatOptions,
  normalizeStationKioskSettings,
  type KioskOrderTypes,
  type StationKioskSettings,
} from '@/lib/stations/station-kiosk-settings'
import { cn } from '@/lib/utils'

import { useUpdateStation } from '../../hooks/useStations'
import {
  StationPanel,
  StationPanelContent,
  StationPanelDescription,
  StationPanelHeader,
  StationPanelTitle,
} from './StationPanel'

interface StationKioskTabProps {
  station: Station
}

const ORDER_TYPE_CHOICES: {
  value: KioskOrderTypes
  title: string
  description: string
}[] = [
  {
    value: 'both',
    title: 'Dine-In + Takeaway',
    description: 'Customers are asked "How would you like your order?" before the menu.',
  },
  {
    value: 'dine_in_only',
    title: 'Dine-In only',
    description: 'Every kiosk order is Dine-In.',
  },
  {
    value: 'takeout_only',
    title: 'Takeaway only',
    description: 'Every kiosk order is Takeaway. Customers go straight to the menu.',
  },
]

/**
 * Kiosk ordering settings for a self-service station: which order types the
 * kiosk offers, and the optional dine-in "Where are you sitting?" step.
 *
 * Explicit Save (same contract as the Menus tab): the whole settings object is
 * written at once, and the kiosk only applies new config while idle, so a
 * customer mid-order never sees the flow change under them.
 */
export function StationKioskTab({ station }: StationKioskTabProps) {
  const save = useUpdateStation()

  const saved = useMemo(
    () => normalizeStationKioskSettings(station.kiosk_settings),
    [station.kiosk_settings],
  )
  // `null` = no local edits; the form shows the saved state.
  const [draft, setDraft] = useState<StationKioskSettings | null>(null)
  const current = draft ?? saved
  const isDirty = draft !== null && isStationKioskSettingsDirty(saved, draft)
  const disabled = save.isPending

  const [newLabel, setNewLabel] = useState('')
  const [rangePrefix, setRangePrefix] = useState('Table')
  const [rangeFrom, setRangeFrom] = useState('1')
  const [rangeTo, setRangeTo] = useState('10')
  const [showRange, setShowRange] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const update = (patch: Partial<StationKioskSettings>) =>
    setDraft({ ...current, ...patch })

  const addLabels = (labels: string[]) => {
    const merged = normalizeSeatOptions([...current.seat_options, ...labels])
    const added = merged.length - current.seat_options.length
    if (added === 0) {
      setListError('Those locations are already in the list.')
      return false
    }
    if (merged.length >= KIOSK_SEAT_OPTIONS_MAX && added < labels.length) {
      setListError(`Up to ${KIOSK_SEAT_OPTIONS_MAX} locations per kiosk.`)
    } else {
      setListError(null)
    }
    update({ seat_options: merged })
    return true
  }

  const handleAddOne = () => {
    if (!newLabel.trim()) return
    if (addLabels([newLabel])) setNewLabel('')
  }

  const handleAddRange = () => {
    const labels = buildSeatRange(rangePrefix, Number(rangeFrom), Number(rangeTo))
    if (labels.length === 0) {
      setListError(
        `Enter a whole-number range (at most ${KIOSK_SEAT_OPTIONS_MAX} locations).`,
      )
      return
    }
    if (addLabels(labels)) setShowRange(false)
  }

  const move = (index: number, delta: -1 | 1) => {
    const next = [...current.seat_options]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    update({ seat_options: next })
  }

  const remove = (index: number) => {
    update({ seat_options: current.seat_options.filter((_, i) => i !== index) })
    setListError(null)
  }

  const handleSave = async () => {
    if (!isDirty) return
    try {
      await save.mutateAsync({
        stationId: station.id,
        input: { kiosk_settings: current },
      })
      setDraft(null)
    } catch {
      // Toast raised by the mutation; keep the draft so nothing is lost.
    }
  }

  if (station.station_type !== 'self_service') return null

  const seatStepUnused = current.order_types === 'takeout_only'
  const seatStepEmpty =
    current.seat_selection_enabled && current.seat_options.length === 0

  return (
    <div className="space-y-6">
      <StationPanel>
        <StationPanelHeader>
          <StationPanelTitle>Order types</StationPanelTitle>
          <StationPanelDescription>
            What customers can choose when they tap Order on this kiosk.
          </StationPanelDescription>
        </StationPanelHeader>
        <StationPanelContent>
          <RadioGroup
            value={current.order_types}
            onValueChange={(value) => update({ order_types: value as KioskOrderTypes })}
            disabled={disabled}
            aria-label="Available order types"
            className="gap-4"
          >
            {ORDER_TYPE_CHOICES.map((choice) => (
              <div key={choice.value} className="rounded-2xl bg-muted/40 p-4">
                <label
                  className={cn(
                    'flex cursor-pointer items-start gap-3',
                    disabled && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <RadioGroupItem
                    value={choice.value}
                    id={`kiosk-order-types-${choice.value}`}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{choice.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {choice.description}
                    </span>
                  </span>
                </label>

                {choice.value === 'dine_in_only' &&
                  current.order_types === 'dine_in_only' && (
                    <div className="mt-3 flex min-w-0 items-start gap-3 pl-7">
                      <Switch
                        id="kiosk-dine-in-skip"
                        checked={current.dine_in_only_skip_prompt}
                        onCheckedChange={(v) => update({ dine_in_only_skip_prompt: v })}
                        disabled={disabled}
                      />
                      <Label htmlFor="kiosk-dine-in-skip" className="min-w-0 font-normal">
                        <span className="block font-medium">
                          Skip the question and start as Dine-In
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          Off: customers see a single Dine-In button first.
                        </span>
                      </Label>
                    </div>
                  )}
              </div>
            ))}
          </RadioGroup>
        </StationPanelContent>
      </StationPanel>

      <StationPanel>
        <StationPanelHeader className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <StationPanelTitle>
              <MapPin className="h-4 w-4" />
              Seat selection (Dine-In)
            </StationPanelTitle>
            <StationPanelDescription>
              Ask dine-in customers where they are sitting so staff know where to
              deliver the order. The location shows on the KDS, kitchen tickets,
              receipts and order details.
            </StationPanelDescription>
          </div>
          <Switch
            aria-label="Ask dine-in customers where they are sitting"
            checked={current.seat_selection_enabled}
            onCheckedChange={(v) => update({ seat_selection_enabled: v })}
            disabled={disabled}
          />
        </StationPanelHeader>

        <StationPanelContent className="space-y-4">
          {seatStepUnused && current.seat_selection_enabled && (
            <div role="status" className="flex min-w-0 items-start gap-3 rounded-2xl bg-muted/60 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <p className="text-sm">
                This kiosk is set to Takeaway only, so customers will not be asked
                for a seat.
              </p>
            </div>
          )}
          {seatStepEmpty && (
            <div role="status" className="flex min-w-0 items-start gap-3 rounded-2xl bg-muted/60 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <p className="text-sm">
                Add at least one location — with an empty list the kiosk skips this
                step.
              </p>
            </div>
          )}

          {current.seat_options.length > 0 && (
            <ul className="space-y-1" data-testid="kiosk-seat-options">
              {current.seat_options.map((seat, index) => (
                <li
                  key={seat.id}
                  className="flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2 hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{seat.label}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => move(index, -1)}
                    disabled={disabled || index === 0}
                    aria-label={`Move ${seat.label} up`}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => move(index, 1)}
                    disabled={disabled || index === current.seat_options.length - 1}
                    aria-label={`Move ${seat.label} down`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
                    onClick={() => remove(index)}
                    disabled={disabled}
                    aria-label={`Remove ${seat.label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Input
              placeholder='e.g. "Table 6 — Seat 2" or "Patio Table 4"'
              className="h-9 w-full rounded-full sm:max-w-[320px]"
              value={newLabel}
              maxLength={KIOSK_SEAT_LABEL_MAX}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddOne()
                }
              }}
              disabled={disabled}
              aria-label="New seating location"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-full"
              onClick={handleAddOne}
              disabled={disabled || !newLabel.trim()}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add location
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full"
              onClick={() => setShowRange((v) => !v)}
              disabled={disabled}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add range…
            </Button>
          </div>

          {showRange && (
            <div className="flex min-w-0 flex-wrap items-end gap-2 rounded-2xl bg-muted/40 p-4">
              <div className="space-y-1">
                <Label htmlFor="kiosk-range-prefix" className="text-xs">Prefix</Label>
                <Input
                  id="kiosk-range-prefix"
                  className="h-9 w-32 rounded-full"
                  value={rangePrefix}
                  onChange={(e) => setRangePrefix(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="kiosk-range-from" className="text-xs">From</Label>
                <Input
                  id="kiosk-range-from"
                  type="number"
                  className="h-9 w-20 rounded-full"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="kiosk-range-to" className="text-xs">To</Label>
                <Input
                  id="kiosk-range-to"
                  type="number"
                  className="h-9 w-20 rounded-full"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                />
              </div>
              <Button size="sm" className="h-9 rounded-full" onClick={handleAddRange}>
                Add {rangePrefix.trim() ? `${rangePrefix.trim()} ` : ''}
                {rangeFrom}–{rangeTo}
              </Button>
            </div>
          )}

          {listError && (
            <p role="alert" className="text-sm text-destructive">
              {listError}
            </p>
          )}
        </StationPanelContent>
      </StationPanel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isDirty ? (
            'Unsaved changes.'
          ) : (
            <>
              The kiosk applies changes the next time it is idle, within a few
              minutes. Branding and checkout options live in the{' '}
              <Link
                href={`/dashboard/kiosk/${station.location_id}`}
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
              >
                Kiosk editor
                <ExternalLink className="h-3 w-3" />
              </Link>
              .
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="h-9 rounded-full px-4 text-[0.8125rem] font-medium"
            onClick={() => {
              setDraft(null)
              setListError(null)
            }}
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
              'Save kiosk settings'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
