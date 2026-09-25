/**
 * Per-station kiosk ordering settings — pure helpers shared by the station
 * editor's Kiosk tab, the updateStation server action and their tests.
 *
 * Stored in `stations.kiosk_settings` (jsonb). The POS kiosk mirrors this
 * normaliser in `types/kiosk.ts` (normalizeKioskOrderingSettings) — keep the
 * shape and defaults in sync.
 */

export type KioskOrderTypes = 'both' | 'dine_in_only' | 'takeout_only'

/**
 * How a dine-in order gets its seat:
 * - off:   no seat
 * - ask:   the guest picks from `seat_options`
 * - fixed: this kiosk always sends `fixed_seat_label` (no prompt)
 */
export type KioskSeatMode = 'off' | 'ask' | 'fixed'

export interface KioskSeatOption {
  id: string
  label: string
}

export interface StationKioskSettings {
  order_types: KioskOrderTypes
  /** Dine-In only: start as Dine-In without asking (false = single button). */
  dine_in_only_skip_prompt: boolean
  /** Fixed table for every dine-in order from this kiosk (null = none). */
  table_label: string | null
  seat_mode: KioskSeatMode
  /** Used when seat_mode === 'fixed'. */
  fixed_seat_label: string | null
  /**
   * Legacy flag read by older kiosk builds. Always derived as
   * `seat_mode === 'ask'`; never edit directly.
   */
  seat_selection_enabled: boolean
  seat_options: KioskSeatOption[]
}

export const KIOSK_SEAT_LABEL_MAX = 40
export const KIOSK_SEAT_OPTIONS_MAX = 200

export const DEFAULT_STATION_KIOSK_SETTINGS: StationKioskSettings = {
  order_types: 'both',
  dine_in_only_skip_prompt: true,
  table_label: null,
  seat_mode: 'off',
  fixed_seat_label: null,
  seat_selection_enabled: false,
  seat_options: [],
}

const SEAT_MODES: readonly KioskSeatMode[] = ['off', 'ask', 'fixed']

const ORDER_TYPES: readonly KioskOrderTypes[] = [
  'both',
  'dine_in_only',
  'takeout_only',
]

function newSeatId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `seat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Trim, collapse whitespace and clamp; empty → null. */
export function normalizeKioskLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const label = raw.trim().replace(/\s+/g, ' ').slice(0, KIOSK_SEAT_LABEL_MAX)
  return label || null
}

/**
 * Trim, drop empties, clamp length, de-duplicate (case-insensitive, first
 * wins) and cap the list. Missing ids are minted so the editor has stable keys.
 */
export function normalizeSeatOptions(raw: unknown): KioskSeatOption[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: KioskSeatOption[] = []
  for (const entry of raw) {
    const rawLabel =
      typeof entry === 'string'
        ? entry
        : entry && typeof entry === 'object' && 'label' in entry
          ? (entry as { label?: unknown }).label
          : null
    if (typeof rawLabel !== 'string') continue
    const label = normalizeKioskLabel(rawLabel)
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const rawId =
      entry && typeof entry === 'object' && 'id' in entry
        ? (entry as { id?: unknown }).id
        : null
    out.push({
      id: typeof rawId === 'string' && rawId ? rawId : newSeatId(),
      label,
    })
    if (out.length >= KIOSK_SEAT_OPTIONS_MAX) break
  }
  return out
}

/** Tolerant read of `stations.kiosk_settings`; anything unknown → defaults. */
export function normalizeStationKioskSettings(raw: unknown): StationKioskSettings {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  const orderTypes = ORDER_TYPES.includes(obj.order_types as KioskOrderTypes)
    ? (obj.order_types as KioskOrderTypes)
    : DEFAULT_STATION_KIOSK_SETTINGS.order_types
  const fixedSeatLabel = normalizeKioskLabel(obj.fixed_seat_label)
  // Rows saved before seat_mode existed only carry the boolean.
  let seatMode: KioskSeatMode = SEAT_MODES.includes(obj.seat_mode as KioskSeatMode)
    ? (obj.seat_mode as KioskSeatMode)
    : obj.seat_selection_enabled === true
      ? 'ask'
      : 'off'
  if (seatMode === 'fixed' && !fixedSeatLabel) seatMode = 'off'
  return {
    order_types: orderTypes,
    dine_in_only_skip_prompt:
      typeof obj.dine_in_only_skip_prompt === 'boolean'
        ? obj.dine_in_only_skip_prompt
        : DEFAULT_STATION_KIOSK_SETTINGS.dine_in_only_skip_prompt,
    table_label: normalizeKioskLabel(obj.table_label),
    seat_mode: seatMode,
    fixed_seat_label: fixedSeatLabel,
    seat_selection_enabled: seatMode === 'ask',
    seat_options: normalizeSeatOptions(obj.seat_options),
  }
}

/** "1" / "12B" → "Table 1" / "Table 12B"; named labels ("Counter") stay as-is. */
function withPrefix(label: string | null | undefined, prefix: string): string {
  const value = (label ?? '').trim()
  if (!value) return ''
  return /^\d\S*$/.test(value) ? `${prefix}${value}` : value
}

/**
 * Where a dine-in order goes, e.g. "Table 1, Seat 3". Mirrors
 * `composeKioskLocationLabel` in the POS (`lib/formatTableLabel.ts`).
 */
export function composeKioskLocationLabel(
  table: string | null | undefined,
  seat: string | null | undefined,
): string {
  return [withPrefix(table, 'Table '), withPrefix(seat, 'Seat ')]
    .filter(Boolean)
    .join(', ')
}

/**
 * Build "Table 1" … "Table 20". Returns [] for an invalid or oversized range
 * so the editor can show a validation message instead of adding junk.
 */
export function buildSeatRange(prefix: string, from: number, to: number): string[] {
  if (!Number.isInteger(from) || !Number.isInteger(to)) return []
  if (from < 0 || to < from || to - from + 1 > KIOSK_SEAT_OPTIONS_MAX) return []
  const p = prefix.trim().replace(/\s+/g, ' ')
  const labels: string[] = []
  for (let n = from; n <= to; n++) labels.push(p ? `${p} ${n}` : String(n))
  return labels
}

export function isStationKioskSettingsDirty(
  a: StationKioskSettings,
  b: StationKioskSettings,
): boolean {
  if (
    a.order_types !== b.order_types ||
    a.dine_in_only_skip_prompt !== b.dine_in_only_skip_prompt ||
    a.table_label !== b.table_label ||
    a.seat_mode !== b.seat_mode ||
    a.fixed_seat_label !== b.fixed_seat_label ||
    a.seat_options.length !== b.seat_options.length
  ) {
    return true
  }
  return a.seat_options.some((s, i) => s.label !== b.seat_options[i].label)
}
