import { describe, it, expect } from "vitest";
import {
  isBot,
  text,
  email,
  isValid,
  HONEYPOT_FIELD,
  type FieldErrors,
} from "@/lib/cms/form-security";

describe("isBot", () => {
  it("flags a submission with the honeypot filled", () => {
    expect(isBot({ [HONEYPOT_FIELD]: "http://spam.example", elapsed_ms: 9000 })).toBe(true);
  });

  it("flags a submission faster than the minimum fill time", () => {
    expect(isBot({ [HONEYPOT_FIELD]: "", elapsed_ms: 500 })).toBe(true);
  });

  it("allows a normal human-paced submission", () => {
    expect(isBot({ [HONEYPOT_FIELD]: "", elapsed_ms: 9000 })).toBe(false);
  });

  it("ignores whitespace-only honeypot values", () => {
    expect(isBot({ [HONEYPOT_FIELD]: "   ", elapsed_ms: 9000 })).toBe(false);
  });

  it("does not flag when timing is absent (spoof-tolerant)", () => {
    expect(isBot({ [HONEYPOT_FIELD]: "" })).toBe(false);
  });
});

describe("text", () => {
  it("returns the trimmed value when valid", () => {
    const errors: FieldErrors = {};
    expect(text("  hello  ", "business", errors, { max: 200, required: true })).toBe("hello");
    expect(isValid(errors)).toBe(true);
  });

  it("errors when a required field is empty or missing", () => {
    const errors: FieldErrors = {};
    text("   ", "business", errors, { max: 200, required: true });
    text(undefined, "phone", errors, { max: 40, required: true });
    expect(errors.business).toBeDefined();
    expect(errors.phone).toBeDefined();
    expect(isValid(errors)).toBe(false);
  });

  it("truncates and errors when over the max length", () => {
    const errors: FieldErrors = {};
    const out = text("a".repeat(50), "concept", errors, { max: 10 });
    expect(out).toHaveLength(10);
    expect(errors.concept).toBeDefined();
  });

  it("treats a missing optional field as empty without error", () => {
    const errors: FieldErrors = {};
    expect(text(undefined, "message", errors, { max: 4000 })).toBe("");
    expect(isValid(errors)).toBe(true);
  });

  it("rejects non-string required values", () => {
    const errors: FieldErrors = {};
    text({ evil: true }, "business", errors, { max: 200, required: true });
    expect(errors.business).toBeDefined();
  });
});

describe("email", () => {
  it("accepts a well-formed address", () => {
    const errors: FieldErrors = {};
    expect(email("owner@restaurant.com", "email", errors)).toBe("owner@restaurant.com");
    expect(isValid(errors)).toBe(true);
  });

  it("rejects a malformed address", () => {
    const errors: FieldErrors = {};
    email("not-an-email", "email", errors);
    expect(errors.email).toBeDefined();
  });

  it("rejects an empty address", () => {
    const errors: FieldErrors = {};
    email("", "email", errors);
    expect(errors.email).toBeDefined();
  });
});
