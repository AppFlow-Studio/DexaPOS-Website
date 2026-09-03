export interface PassageBillingDetails {
  address1: string;
  zip: string;
}

function readFormValue(formData: FormData, keys: string[]): string {
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

/**
 * Passage.js v2 supplies billing fields through its form-submit callback after
 * card tokenization. Accept the documented names plus harmless aliases so an
 * SDK naming adjustment does not silently strip AVS data from a sale.
 */
export function readPassageBillingDetails(
  formData: FormData
): PassageBillingDetails {
  return {
    address1: readFormValue(formData, [
      "billing_address1",
      "billing_address_1",
      "address1",
    ]),
    zip: readFormValue(formData, [
      "billing_zip",
      "billing_postal_code",
      "zip",
    ]),
  };
}
