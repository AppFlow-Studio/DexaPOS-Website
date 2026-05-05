/**
 * Canonical phone number helpers.
 *
 * Storage format: strict E.164 — `+1XXXXXXXXXX` (US/CA only, 11 digits with +).
 * This is the format Telnyx expects and the format we use to dedupe contacts.
 *
 * UI display: `(XXX) XXX-XXXX` (no country code prefix shown).
 */

/** Strip everything except digits. */
function digitsOnly(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

/**
 * Normalize free-text phone input to strict E.164 (US/CA).
 *
 * Returns `null` if the input doesn't have exactly 10 (or 11 with leading 1) digits.
 *
 * Accepts: "5550000000", "(555) 000-0000", "+1 555 000 0000", "1-555-000-0000",
 * "555.000.0000", "+15550000000". All normalize to "+15550000000".
 */
export function normalizeToE164(
  input: string | null | undefined
): string | null {
  if (!input) return null;
  const digits = digitsOnly(input);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** Same as `normalizeToE164` but returns the input unchanged if not normalizable. */
export function normalizeToE164OrInput(
  input: string | null | undefined
): string | null {
  if (!input) return null;
  const e164 = normalizeToE164(input);
  return e164 ?? input;
}

/** True when the input would normalize to a complete E.164 number. */
export function isValidPhone(input: string | null | undefined): boolean {
  return normalizeToE164(input) !== null;
}

/**
 * Format a stored phone (E.164 or anything normalizable) for human display:
 * `(555) 000-0000`. Falls back to the raw input when not normalizable.
 */
export function formatPhoneDisplay(
  input: string | null | undefined
): string {
  if (!input) return "";
  const e164 = normalizeToE164(input);
  if (!e164) return input;
  const ten = e164.slice(2); // drop "+1"
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * Progressive format for input fields as the user types.
 * Accepts partial digits and pads layout. Returns the user-facing display string.
 *
 * Examples (US assumed, no `+1` shown to the user):
 *   ""               -> ""
 *   "5"              -> "(5"
 *   "555"            -> "(555) "
 *   "5550"           -> "(555) 0"
 *   "555000"         -> "(555) 000-"
 *   "5550000000"     -> "(555) 000-0000"
 *   "+15550000000"   -> "(555) 000-0000"
 */
export function formatPhoneAsTyping(input: string): string {
  const raw = digitsOnly(input);
  // Drop leading country code "1" if present so the display is the 10 NSN digits.
  const ten = raw.length === 11 && raw.startsWith("1") ? raw.slice(1) : raw.slice(0, 10);
  if (ten.length === 0) return "";
  if (ten.length < 4) return `(${ten}`;
  if (ten.length < 7) return `(${ten.slice(0, 3)}) ${ten.slice(3)}`;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6, 10)}`;
}

/** Returns just the 10 NSN digits ("XXXXXXXXXX") from any input. */
export function tenDigits(input: string | null | undefined): string {
  if (!input) return "";
  const raw = digitsOnly(input);
  if (raw.length === 11 && raw.startsWith("1")) return raw.slice(1);
  return raw.slice(-10);
}
