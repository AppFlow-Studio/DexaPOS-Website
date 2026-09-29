// Cardholder signature block on the sale receipt.
//
// The POS prints the block; the Website only stores the setting and previews
// it. Keep the rule and the default text in step with the POS.

/** Printed under the signature line when the merchant leaves the disclaimer blank. */
export const DEFAULT_SIGNATURE_DISCLAIMER =
  "I agree to pay the above total according to my card issuer agreement.";

export type ReceiptCopy = "merchant" | "customer";
export type ReceiptTender = "card" | "cash";

/**
 * The block prints only when all three hold: the signature line is on, the
 * copy is the merchant's, and the receipt has a card payment.
 */
export function printsSignatureBlock({
  printSignatureLine,
  copy,
  tender,
}: {
  printSignatureLine: boolean;
  copy: ReceiptCopy;
  tender: ReceiptTender;
}): boolean {
  return printSignatureLine && copy === "merchant" && tender === "card";
}

/** The disclaimer that prints: the merchant's text, or the default when blank. */
export function resolveSignatureDisclaimer(
  disclaimer: string | null | undefined,
): string {
  return disclaimer?.trim() || DEFAULT_SIGNATURE_DISCLAIMER;
}
