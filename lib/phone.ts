import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js'
import type { CountryCode } from 'libphonenumber-js'

/** Normalize raw user input to E.164. Returns null if invalid or empty. */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: CountryCode = 'US'
): string | null {
  if (!input?.trim()) return null
  try {
    const parsed = parsePhoneNumber(input, defaultCountry)
    if (parsed?.isValid()) return parsed.format('E.164')
  } catch {
    // Fall through to a permissive US digits-only fallback below.
  }

  // Fallback: handle common user-entered US formats that may not parse
  // cleanly (spaces, dashes, parentheses, leading country code).
  const digits = input.replace(/\D/g, '')
  if (defaultCountry === 'US') {
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  }

  return null
}

export const normalizeToE164 = normalizePhone

/** Format an E.164 string for human display. Falls back to the raw value. */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164) return ''
  try {
    const parsed = parsePhoneNumber(e164)
    if (!parsed) return e164
    return parsed.country === 'US'
      ? parsed.formatNational()
      : parsed.formatInternational()
  } catch {
    return e164
  }
}

export function isValidPhone(
  input: string | null | undefined,
  defaultCountry: CountryCode = 'US'
): boolean {
  if (!input?.trim()) return false
  try {
    return isValidPhoneNumber(input, defaultCountry)
  } catch {
    return false
  }
}

/** Normalize the digits-only representation for partial-match search. */
export function phoneDigits(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/\D/g, '')
}

/**
 * True when the input carries an actual national (subscriber) number, not just
 * a bare dial/country code. A masked PhoneInput left untouched emits "+1" (or
 * "+44", etc.) with no digits typed — that should count as "no phone entered",
 * not an invalid one. Used to keep optional phone fields from silently failing
 * validation on a leftover country code.
 */
export function hasNationalDigits(
  input: string | null | undefined,
  defaultCountry: CountryCode = 'US'
): boolean {
  if (!input?.trim()) return false
  try {
    const parsed = parsePhoneNumber(input, defaultCountry)
    // nationalNumber is the subscriber part (country code stripped).
    if (parsed?.nationalNumber) return parsed.nationalNumber.length > 0
  } catch {
    // Fall through to a permissive digits-only check.
  }
  // Fallback (parse failed): mirror normalizePhone's permissive US check. A bare
  // dial code like "+1" is a single digit here and correctly returns false.
  const digits = input.replace(/\D/g, '')
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
}

/** Return the last 10 digits of a phone value (US national number). */
export function tenDigits(value: string | null | undefined): string {
  return phoneDigits(value).slice(-10)
}
