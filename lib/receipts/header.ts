// Deterministic receipt header resolution.
//
// There are multiple header sources in the schema (receipt_templates.header_text,
// printers.receipt_header, the locations record). For web receipts there must be
// exactly ONE rendered header block with a documented precedence:
//
//   1. Active "sale" receipt_templates.header_text (location-scoped, non-empty)
//      → use it verbatim. It is free-form, store-authored text.
//   2. Else → build from the locations record: name + one address + one phone.
//
// Renderers display ONLY the returned block — never location fields AND
// header_text together (that was the duplicate-header bug).
//
// (printers.receipt_header is the thermal-print surface and is intentionally
//  out of scope here — see the POS print parity follow-up ticket.)

import { formatPhone } from "./format";

export interface ResolvedReceiptHeader {
  /** Where the header came from, for debugging/tests. */
  source: "template" | "location";
  /** Store display name (location record). Always present as the title. */
  name: string | null;
  /** Address, one line per array entry. Empty when sourced from template text. */
  addressLines: string[];
  /** Formatted phone, e.g. "(718) 887-0100". Empty when sourced from template text. */
  phone: string | null;
  /** Verbatim template header_text when source === "template". */
  rawText: string | null;
}

interface HeaderLocationInput {
  name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
}

function buildAddressLines(loc: HeaderLocationInput): string[] {
  const cityStateZip = [
    loc.city ? `${loc.city},` : "",
    loc.state ?? "",
    loc.postal_code ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return [loc.address_line1, loc.address_line2, cityStateZip]
    .map((l) => (l ?? "").trim())
    .filter(Boolean);
}

/**
 * Resolve the single header block for a receipt.
 *
 * @param location     locations record fields (fallback source; also supplies the name)
 * @param templateHeaderText  receipt_templates.header_text for the active sale template, if any
 */
export function resolveReceiptHeader(
  location: HeaderLocationInput | null,
  templateHeaderText: string | null | undefined
): ResolvedReceiptHeader {
  const name = location?.name ?? null;
  const trimmedTemplate = templateHeaderText?.trim();

  if (trimmedTemplate) {
    return {
      source: "template",
      name,
      addressLines: [],
      phone: null,
      rawText: trimmedTemplate,
    };
  }

  return {
    source: "location",
    name,
    addressLines: location ? buildAddressLines(location) : [],
    phone: formatPhone(location?.phone),
    rawText: null,
  };
}
