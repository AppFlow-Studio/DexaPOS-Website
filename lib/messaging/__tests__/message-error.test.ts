import { describe, expect, it } from "vitest";
import { formatMessageError } from "../message-error";

const invalidNumber = "The recipient's phone number is invalid. Check the number and country code.";
const fallback = "We couldn't complete this message. Contact support if the problem continues.";

describe("readable messaging errors", () => {
  it("translates the legacy HTTP + JSON response shown in the message log", () => {
    const error = '400 {"errors":[{"code":"10002","title":"Invalid phone number","detail":"Invalid destination number","meta":{"url":"https://developers.telnyx.com/docs/overview/errors/10002"},"source":{"pointer":"/to"}}]}';
    expect(formatMessageError(error)).toBe(invalidNumber);
  });

  it.each(["10002", " 10002 ", "10002: Invalid phone number", "Error code: 10002", "Invalid phone number", "Invalid destination number"]) (
    "normalizes a code or plain error: %s", (error) => {
      expect(formatMessageError(error)).toBe(invalidNumber);
    },
  );

  it.each([
    ["40300", "opted out"],
    ["not_opted_in", "not agreed"],
    ["Customer has unsubscribed from all marketing communications", "opted out"],
    ["40306", "sending number"],
    ["40001", "cannot receive"],
    ["40002", "spam or content"],
    ["40329", "approval"],
    ["20100", "balance or spending limit"],
    ["40309", "country"],
    ["40302", "too long"],
    ["40316", "empty"],
    ["40312", "disabled"],
    ["40005", "expired"],
    ["429 Too Many Requests", "sending limit"],
    ["503 Service Unavailable", "temporarily unavailable"],
    ["401", "not set up correctly"],
    ["API key is invalid", "not set up correctly"],
    ["Telnyx not configured: set TELNYX_FROM_NUMBER", "not set up correctly"],
    ["Recipient phone (to) is missing", "phone number is missing"],
    ["Message body is missing", "empty"],
    ["connect ETIMEDOUT 10.0.0.1", "Check the message status before sending again"],
  ])("explains %s without technical details", (error, expected) => {
    expect(formatMessageError(error)).toContain(expected);
  });

  it("distinguishes an invalid sender from an invalid recipient", () => {
    expect(formatMessageError('{"errors":[{"code":"10002","source":{"pointer":"/from"}}]}'))
      .toBe("The sending number needs to be set up or corrected. Contact support.");
  });

  it("uses the provider error before a generic HTTP status", () => {
    expect(formatMessageError('403 {"errors":[{"code":"40300"}]}')).toContain("opted out");
  });

  it("supports numeric codes, direct objects, and error arrays", () => {
    expect(formatMessageError('{"code":10002}')).toBe(invalidNumber);
    expect(formatMessageError('[{"code":"10002"}]')).toBe(invalidNumber);
    expect(formatMessageError('{"error_code":"10002"}')).toBe(invalidNumber);
  });

  it("translates a known description even when the provider code is unfamiliar", () => {
    expect(formatMessageError('{"errors":[{"code":"99999","detail":"Invalid phone number"}]}')).toBe(invalidNumber);
  });

  it("handles truncated JSON without throwing", () => {
    expect(formatMessageError('400 {"errors":[{"code":"10002","title":')).toBe(invalidNumber);
    expect(formatMessageError('400 {"errors":')).toBe(fallback);
  });

  it("deduplicates multiple errors while preserving different explanations", () => {
    const result = formatMessageError('{"errors":[{"code":"10002"},{"code":"10002"},{"code":"40302"}]}');
    expect(result).toBe(`${invalidNumber} The message is too long. Shorten it before sending again.`);
  });

  it.each([
    '400 {"errors":[{"code":"99999","detail":"Private backend details: secret=abc"}]}',
    '{"debug":{"message":"Invalid phone number"},"token":"secret"}',
    '<html>Internal error at /private/api</html>',
    'Error: database query failed\n at handler (server.ts:12)',
    '99999',
    '400 {"errors":null}',
  ])("never exposes unrecognized backend content: %s", (error) => {
    expect(formatMessageError(error)).toBe(fallback);
  });

  it.each([null, undefined, "", "  "])("does not invent an error when none is recorded: %s", (error) => {
    expect(formatMessageError(error)).toBeNull();
    expect(formatMessageError(error, "delivered")).toBeNull();
    expect(formatMessageError(error, "failed")).toBe(fallback);
  });
});
