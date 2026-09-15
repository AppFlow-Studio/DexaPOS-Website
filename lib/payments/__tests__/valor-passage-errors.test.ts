import { describe, expect, it } from "vitest";

import { normalizePassageError } from "../valor/passageErrors";

describe("normalizePassageError", () => {
  it("preserves the string emitted by Passage.js v2", () => {
    expect(normalizePassageError("91: Invalid EPI provided")).toEqual({
      message: "91: Invalid EPI provided",
    });
  });

  it("reads documented nested Valor decline details", () => {
    expect(
      normalizePassageError({
        error_no: "S00",
        error_code: "E98",
        switch_response: {
          error_code: "54",
          msg: "Card expired",
        },
      })
    ).toEqual({
      code: "54",
      message: "54: Card expired",
    });
  });

  it("unwraps Passage event payloads and keeps a safe fallback", () => {
    expect(normalizePassageError({ error: "Failed to fetch" })).toEqual({
      code: "NETWORK",
      message:
        "Unable to reach Valor's secure payment service. Check the network and try again.",
    });
    expect(normalizePassageError(null)).toEqual({
      message: "Payment error. Please try again.",
    });
  });
});
