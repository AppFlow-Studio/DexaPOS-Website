import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("Valor storefront AVS contract", () => {
  it("collects Passage billing fields and sends them with the order request", () => {
    const checkout = read("app/sites/components/checkout/CheckoutPage.tsx");

    expect(checkout).toContain("showBillingAddress");
    expect(checkout).toContain("onFormSubmit");
    expect(checkout).toContain("billing_address1");
    expect(checkout).toContain("billing_zip");
  });

  it("forwards sanitized AVS values into the Valor sale", () => {
    const createOnlineOrder = read(
      "supabase/functions/create-online-order/index.ts"
    );

    expect(createOnlineOrder).toContain(
      "address1: normalizePaymentText(body.billing_address1, 200)"
    );
    expect(createOnlineOrder).toContain(
      "zip: normalizePaymentText(body.billing_zip, 20)"
    );
  });
});
