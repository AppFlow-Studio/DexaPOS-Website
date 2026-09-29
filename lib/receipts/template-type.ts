// Receipt template types, and the one place the Website's names are mapped to
// the receipt_templates.template_type values stored in the database.
//
// The Website calls the customer's receipt "sale". The POS prints it from the
// row with template_type 'receipt', so that is the row the Website reads and
// writes too — otherwise Sale Receipt settings never reach the tablet. Every
// other type is stored under the Website's own name.
//
// A database row still typed 'sale' is a leftover the POS ignores (and
// 'sale_retired' is one the unify migration parked). Neither is the Sale
// Receipt, so neither maps back to a Website type.

export const TEMPLATE_TYPE_IDS = [
  "sale",
  "kitchen",
  "void_refund",
  "no_sale",
  "end_of_day",
  "cash_drawer",
  "online_order",
] as const;

export type TemplateType = (typeof TEMPLATE_TYPE_IDS)[number];

const SALE_RECEIPT_DB_TYPE = "receipt";

export function toDbTemplateType(templateType: TemplateType): string {
  return templateType === "sale" ? SALE_RECEIPT_DB_TYPE : templateType;
}

/** Website type for a stored template_type, or null when the row isn't one the Website manages. */
export function fromDbTemplateType(dbType: string): TemplateType | null {
  if (dbType === SALE_RECEIPT_DB_TYPE) return "sale";
  if (dbType === "sale") return null;
  return (TEMPLATE_TYPE_IDS as readonly string[]).includes(dbType)
    ? (dbType as TemplateType)
    : null;
}

/** Every stored template_type the Website manages, for filtering reads. */
export const DB_TEMPLATE_TYPES: string[] = TEMPLATE_TYPE_IDS.map(toDbTemplateType);
