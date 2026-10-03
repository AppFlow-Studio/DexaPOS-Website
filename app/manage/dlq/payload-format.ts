/*
 * Pure helpers that turn a dead-letter `raw_payload` into labelled fields for
 * the detail panel's Fields view. Payloads come from several writers (OrderOut
 * orders and push_menu, the status relay, Valor, Telnyx), so nothing here
 * knows a shape: it reads whatever object arrives.
 *
 * No class names live in this file — Tailwind does not scan `.ts` (C7).
 */

export type Scalar = string | number | boolean
export type PlainObject = Record<string, unknown>

export interface PayloadField {
  key: string
  label: string
  value: Scalar | Scalar[]
}

export interface PayloadGroup {
  key: string
  label: string
  /** A nested object, or a list of objects (line items, results, …). */
  value: PlainObject | PlainObject[]
}

export interface PayloadNode {
  fields: PayloadField[]
  groups: PayloadGroup[]
  /** Keys whose value is null, blank or an empty list/object. */
  empty: { key: string; label: string }[]
}

/** Dexa's own annotations on a payload are the `_`-prefixed keys. */
export function isAnnotationKey(key: string): boolean {
  return key.startsWith('_')
}

export function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isScalar(value: unknown): value is Scalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) return Object.keys(value).length === 0
  return false
}

const WORDS: Record<string, string> = {
  id: 'ID',
  ids: 'IDs',
  url: 'URL',
  uuid: 'UUID',
  ip: 'IP',
  api: 'API',
  mcc: 'MCC',
  rrn: 'RRN',
  epi: 'EPI',
  eta: 'ETA',
  pos: 'POS',
  sms: 'SMS',
  ods: 'ODS',
  cc: 'Card',
}

/** `externalReferenceId` / `_matched_location_id` → "External reference ID" / "Matched location ID". */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/^_+/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())
  if (words.length === 0) return key
  const out = words.map((word) => WORDS[word] ?? word)
  out[0] = out[0].charAt(0).toUpperCase() + out[0].slice(1)
  return out.join(' ')
}

/**
 * A wrapper object holding one plain value (`{ name: "grubhub" }`) reads as
 * that value, so "Delivery company: grubhub" needs no section of its own.
 */
function unwrapSingleValue(value: unknown): unknown {
  if (!isPlainObject(value)) return value
  const entries = Object.entries(value)
  if (entries.length === 1 && isScalar(entries[0][1])) return entries[0][1]
  return value
}

/** Splits an object into plain fields, nested sections and empty keys, in key order. */
export function partitionObject(obj: PlainObject): PayloadNode {
  const node: PayloadNode = { fields: [], groups: [], empty: [] }
  for (const [key, raw] of Object.entries(obj)) {
    const label = humanizeKey(key)
    const value = unwrapSingleValue(raw)
    if (isEmptyValue(value)) {
      node.empty.push({ key, label })
    } else if (isScalar(value)) {
      node.fields.push({ key, label, value })
    } else if (isPlainObject(value)) {
      node.groups.push({ key, label, value })
    } else if (Array.isArray(value) && value.every(isPlainObject)) {
      node.groups.push({ key, label, value })
    } else if (Array.isArray(value)) {
      // Scalars, or a mix: anything that is not plain reads as compact JSON.
      node.fields.push({
        key,
        label,
        value: value.map((item) => (isScalar(item) ? item : JSON.stringify(item))),
      })
    } else {
      node.fields.push({ key, label, value: String(value) })
    }
  }
  return node
}

const TITLE_KEYS = ['name', 'title', 'label', 'display_name', 'displayName', 'platform', 'id']

/** The name an item in a list goes by: its `name`, `title`, … or nothing. */
export function itemTitle(item: PlainObject): string | null {
  for (const key of TITLE_KEYS) {
    const value = item[key]
    if (isScalar(value) && String(value).trim() !== '') return String(value)
  }
  return null
}

/** An ISO timestamp that carries its own zone, so it can be shown in local time safely. */
const ZONED_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/

export function isZonedTimestamp(value: Scalar): value is string {
  return typeof value === 'string' && ZONED_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Identifiers read better in mono: UUIDs, and any value under an id-named key. */
export function isIdentifier(key: string, value: Scalar): boolean {
  if (typeof value === 'boolean') return false
  if (typeof value === 'string' && UUID.test(value)) return true
  return /(^|_)id$|[a-z]Id$/.test(key)
}
