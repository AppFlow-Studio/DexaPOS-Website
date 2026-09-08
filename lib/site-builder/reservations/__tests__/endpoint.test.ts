import { describe, expect, it } from "vitest";

import {
  bool,
  int,
  looksAutomated,
  looksLikeEmail,
  looksLikePhone,
  str,
  strArray,
} from "../endpoint";
import {
  DATE_RE,
  HONEYPOT_FIELD,
  MIN_FILL_MS,
  RENDERED_AT_FIELD,
  TIME_RE,
  TOKEN_RE,
  UUID_RE,
} from "../protocol";

describe("payload coercion", () => {
  /**
   * Every one of these takes input from a stranger, so the question each test
   * asks is the same: does a hostile or malformed value become something safe,
   * rather than something that reaches Postgres?
   */
  it("trims and caps strings, and refuses non-strings entirely", () => {
    expect(str("  Ali  ")).toBe("Ali");
    expect(str("x".repeat(500), 10)).toHaveLength(10);
    expect(str(null)).toBe("");
    expect(str(42)).toBe("");
    expect(str({ toString: () => "evil" })).toBe("");
  });

  it("keeps only real strings from a tag array, and caps the count", () => {
    expect(strArray(["Birthday", "  Anniversary  ", "", 7, null])).toEqual([
      "Birthday",
      "Anniversary",
    ]);
    expect(strArray(Array.from({ length: 50 }, (_, i) => `t${i}`))).toHaveLength(20);
    expect(strArray("Birthday")).toEqual([]);
    expect(strArray(null)).toEqual([]);
  });

  /**
   * The asymmetry is deliberate and matches the checkout defaults: marketing
   * consent absent means no, transactional SMS absent means yes. A missing
   * value is not the same question in both cases.
   */
  it("defaults a missing boolean to whatever the caller says is safe", () => {
    expect(bool(undefined, false)).toBe(false);
    expect(bool(undefined, true)).toBe(true);
    expect(bool("true", false)).toBe(false); // a string is not a boolean
    expect(bool(1, false)).toBe(false);
    expect(bool(true, false)).toBe(true);
  });

  it("accepts only whole numbers", () => {
    expect(int(4)).toBe(4);
    expect(int("4")).toBe(4);
    expect(int(4.5)).toBeNull();
    expect(int("four")).toBeNull();
    expect(int(null)).toBeNull();
    // Number(null), Number(""), Number([]) and Number(false) are all 0, and 0 is
    // an integer — so each of these would otherwise become a party of zero.
    expect(int("")).toBeNull();
    expect(int([])).toBeNull();
    expect(int(false)).toBeNull();
    expect(int(undefined)).toBeNull();
  });
});

describe("contact validation", () => {
  /**
   * A wrong phone number means the confirmation SMS never arrives and the
   * restaurant cannot call about a late table, so this is the validation with
   * real consequences. Permissive about format on purpose — international
   * numbers are written a dozen ways — but it must plausibly be a number.
   */
  it("accepts phone numbers however they are punctuated", () => {
    expect(looksLikePhone("+1 (555) 123-4567")).toBe(true);
    expect(looksLikePhone("+961 3 123 456")).toBe(true);
    expect(looksLikePhone("5551234567")).toBe(true);
  });

  it("rejects things that cannot be dialled", () => {
    expect(looksLikePhone("call me")).toBe(false);
    expect(looksLikePhone("12345")).toBe(false); // too short
    expect(looksLikePhone("1".repeat(20))).toBe(false); // longer than E.164 allows
    expect(looksLikePhone("")).toBe(false);
  });

  it("accepts ordinary email addresses and rejects the rest", () => {
    expect(looksLikeEmail("ali@example.com")).toBe(true);
    expect(looksLikeEmail("first.last+tag@sub.example.co.uk")).toBe(true);
    expect(looksLikeEmail("ali@example")).toBe(false);
    expect(looksLikeEmail("ali at example.com")).toBe(false);
    expect(looksLikeEmail("a@b.c")).toBe(false); // single-char TLD
    expect(looksLikeEmail(`${"x".repeat(250)}@example.com`)).toBe(false);
  });
});

describe("bot signals", () => {
  it("catches anything that fills the hidden field", () => {
    expect(looksAutomated({ [HONEYPOT_FIELD]: "https://spam.example" })).toBe(true);
    expect(looksAutomated({ [HONEYPOT_FIELD]: "   " })).toBe(false);
    expect(looksAutomated({})).toBe(false);
  });

  it("catches a form completed faster than a human could type", () => {
    expect(looksAutomated({ [RENDERED_AT_FIELD]: Date.now() - 100 })).toBe(true);
    expect(looksAutomated({ [RENDERED_AT_FIELD]: Date.now() - (MIN_FILL_MS + 500) })).toBe(false);
  });

  /**
   * A stamp from the future is clock skew or a forgery, not a fast human. It
   * must not be read as "instant submission" — that would fail honest guests
   * whose device clock runs ahead.
   */
  it("does not punish a clock that is ahead", () => {
    expect(looksAutomated({ [RENDERED_AT_FIELD]: Date.now() + 60_000 })).toBe(false);
  });

  it("ignores a missing or unusable timestamp rather than guessing", () => {
    expect(looksAutomated({ [RENDERED_AT_FIELD]: "nonsense" })).toBe(false);
    expect(looksAutomated({ [RENDERED_AT_FIELD]: 0 })).toBe(false);
  });
});

describe("wire-format guards", () => {
  it("matches the token shape generate_reservation_manage_token produces", () => {
    expect(TOKEN_RE.test("a".repeat(64))).toBe(true);
    expect(TOKEN_RE.test("A".repeat(64))).toBe(false); // lowercase only — it is a URL path segment
    expect(TOKEN_RE.test("a".repeat(63))).toBe(false);
    expect(TOKEN_RE.test(`${"a".repeat(64)}/../admin`)).toBe(false);
  });

  it("accepts only zero-padded 24-hour times", () => {
    expect(TIME_RE.test("07:00")).toBe(true);
    expect(TIME_RE.test("23:45")).toBe(true);
    expect(TIME_RE.test("7:00")).toBe(false);
    expect(TIME_RE.test("24:00")).toBe(false);
    expect(TIME_RE.test("19:60")).toBe(false);
  });

  it("accepts only ISO dates", () => {
    expect(DATE_RE.test("2026-08-29")).toBe(true);
    expect(DATE_RE.test("29-08-2026")).toBe(false);
    expect(DATE_RE.test("2026-8-9")).toBe(false);
  });

  it("accepts only uuids where a uuid is required", () => {
    expect(UUID_RE.test("ff9ce22f-68e6-455f-96c8-48eb43828c52")).toBe(true);
    expect(UUID_RE.test("' OR 1=1 --")).toBe(false);
    expect(UUID_RE.test("")).toBe(false);
  });
});
