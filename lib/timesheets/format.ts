/**
 * Formatting for timesheet figures and times.
 *
 * Two rules keep the screen and both CSVs identical:
 * - hours are formatted from integer MINUTES with integer maths, and
 * - money is formatted from integer CENTS with string maths,
 * so no binary float ever decides a digit.
 *
 * Times are always rendered in the LOCATION's zone (`meta.timezone`), never the
 * browser's — a manager in another state must see the times staff clocked.
 */

import { zonedDateTimeParts } from '@/lib/reservations/local-time'

/** 555 → "9.25"; 440 → "7.33". minutes·100/60 never lands on .5, so rounding is unambiguous. */
export function formatHours(minutes: number): string {
  const hundredths = Math.round((minutes * 100) / 60)
  const sign = hundredths < 0 ? '-' : ''
  const abs = Math.abs(hundredths)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${whole.toLocaleString('en-US')}.${frac}`
}

/** Plain, spreadsheet-safe hours: no thousands separator. */
export function formatHoursPlain(minutes: number): string {
  return formatHours(minutes).replace(/,/g, '')
}

/** 101649 → "$1,016.49". */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(cents))
  const dollars = Math.floor(abs / 100).toLocaleString('en-US')
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`
}

/** 101649 → "1016.49" — for CSV cells. */
export function formatMoneyPlain(cents: number): string {
  return formatMoney(cents).replace(/[$,]/g, '')
}

export function formatRate(rate: number): string {
  return formatMoney(Math.round(rate * 100))
}

/** "30 min", "1 hr 5 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>()
const dayFormatters = new Map<string, Intl.DateTimeFormat>()

function cached(map: Map<string, Intl.DateTimeFormat>, zone: string, options: Intl.DateTimeFormatOptions) {
  let formatter = map.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, ...options })
    map.set(zone, formatter)
  }
  return formatter
}

/** "5:02 PM" at the location. */
export function formatTimeAt(iso: string, timeZone: string): string {
  // Newer ICU puts U+202F before AM/PM; a plain space keeps CSVs and tests stable.
  return cached(timeFormatters, timeZone, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso))
    .replace(/ /g, ' ')
}

/** "Tue, Sep 8" at the location. */
export function formatDayAt(iso: string, timeZone: string): string {
  return cached(dayFormatters, timeZone, { weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(iso)
  )
}

/** "Tue, Sep 8 · 5:02 PM" — every clock-out carries its date (ticket AC). */
export function formatStampAt(iso: string, timeZone: string): string {
  return `${formatDayAt(iso, timeZone)} · ${formatTimeAt(iso, timeZone)}`
}

/** "Tuesday, Sep 8, 2026" for a bare local date. */
export function formatLongDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** Short zone name for footnotes: "EDT" / "MST". */
export function zoneAbbreviation(timeZone: string, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? timeZone
}

// --- zone offsets -----------------------------------------------------------

/** Minutes east of UTC for `timeZone` at `instant` (New York in summer → -240). */
export function zoneOffsetMinutes(timeZone: string, instant: Date): number {
  const { date, time } = zonedDateTimeParts(timeZone, instant)
  const seconds = instant.getUTCSeconds()
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, seconds)
  return Math.round((asUtc - (instant.getTime() - instant.getUTCMilliseconds())) / 60_000)
}

/** "2026-09-08T17:02:00-04:00" — the Shift detail CSV's unambiguous timestamp. */
export function isoWithOffset(iso: string, timeZone: string): string {
  const instant = new Date(iso)
  const { date, time } = zonedDateTimeParts(timeZone, instant)
  const offset = zoneOffsetMinutes(timeZone, instant)
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  const ss = String(instant.getUTCSeconds()).padStart(2, '0')
  return `${date}T${time}:${ss}${sign}${hh}:${mm}`
}

/** ISO instant → "YYYY-MM-DDTHH:mm" wall clock at the location (datetime inputs). */
export function toZonedInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return ''
  const { date, time } = zonedDateTimeParts(timeZone, instant)
  return `${date}T${time}`
}

/**
 * "YYYY-MM-DDTHH:mm" wall clock at the location → ISO instant.
 *
 * Two passes: the first offset guess can be an hour off when the wall time sits
 * on the other side of a DST switch from its UTC reading.
 */
export function fromZonedInput(value: string, timeZone: string): string {
  const [date, time] = value.split('T')
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  let instant = guess - zoneOffsetMinutes(timeZone, new Date(guess)) * 60_000
  const corrected = guess - zoneOffsetMinutes(timeZone, new Date(instant)) * 60_000
  if (corrected !== instant) instant = corrected
  return new Date(instant).toISOString()
}
