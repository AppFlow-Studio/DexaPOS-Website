import { describe, expect, it } from "vitest";
import { readPassageBillingDetails } from "../valor/passageBilling";

describe("readPassageBillingDetails", () => {
  it("reads and trims Passage.js billing fields", () => {
    const formData = new FormData();
    formData.set("billing_address1", " 8320 Main Street ");
    formData.set("billing_zip", " 85284 ");

    expect(readPassageBillingDetails(formData)).toEqual({
      address1: "8320 Main Street",
      zip: "85284",
    });
  });

  it("supports compatible aliases and defaults missing values to empty strings", () => {
    const formData = new FormData();
    formData.set("address1", "1 Test Ave");

    expect(readPassageBillingDetails(formData)).toEqual({
      address1: "1 Test Ave",
      zip: "",
    });
  });
});
