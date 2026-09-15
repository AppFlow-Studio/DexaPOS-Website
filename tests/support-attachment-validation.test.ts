import { describe, expect, it } from "vitest";
import { validateMerchantSupportAttachments } from "@/lib/support/attachment-validation";

const MERCHANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_MERCHANT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const FILE_ID = "44444444-4444-4444-8444-444444444444";

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    file_name: "register-screen.png",
    file_path: `${MERCHANT_ID}/tickets/${SESSION_ID}/${FILE_ID}_register-screen.png`,
    file_size: 1024,
    file_type: "image/png",
    ...overrides,
  };
}

describe("merchant support attachment validation", () => {
  it("accepts canonical metadata for allowed image, PDF, and video uploads", () => {
    const attachments = [
      attachment(),
      attachment({
        file_name: "invoice.pdf",
        file_path: `${MERCHANT_ID}/tickets/${SESSION_ID}/${FILE_ID}_invoice.pdf`,
        file_type: "application/pdf",
      }),
      attachment({
        file_name: "iOS recording.mov",
        file_path:
          `https://cdn.test/merchants/${MERCHANT_ID}/support/` +
          `${SESSION_ID}_${FILE_ID}_iOS_recording.mov`,
        file_type: "video/quicktime",
      }),
    ];

    expect(
      validateMerchantSupportAttachments(attachments, MERCHANT_ID, "cdn.test"),
    ).toEqual({ data: attachments });
  });

  it("rejects client metadata that exceeds the count or size limits", () => {
    expect(
      validateMerchantSupportAttachments(
        [attachment(), attachment(), attachment(), attachment()],
        MERCHANT_ID,
      ).error,
    ).toContain("maximum of 3");

    expect(
      validateMerchantSupportAttachments(
        [attachment({ file_size: 5 * 1024 * 1024 + 1 })],
        MERCHANT_ID,
      ).error,
    ).toBeDefined();

    expect(
      validateMerchantSupportAttachments(
        [
          attachment({
            file_name: "repro.mp4",
            file_path:
              `https://cdn.test/merchants/${MERCHANT_ID}/support/` +
              `${SESSION_ID}_${FILE_ID}_repro.mp4`,
            file_size: 100 * 1024 * 1024 + 1,
            file_type: "video/mp4",
          }),
        ],
        MERCHANT_ID,
        "cdn.test",
      ).error,
    ).toBeDefined();
  });

  it("rejects unsupported and mismatched MIME metadata", () => {
    expect(
      validateMerchantSupportAttachments(
        [attachment({ file_name: "payload.exe", file_type: "image/png" })],
        MERCHANT_ID,
      ).error,
    ).toBe("Unsupported attachment type");

    expect(
      validateMerchantSupportAttachments(
        [attachment({ file_type: "application/pdf" })],
        MERCHANT_ID,
      ).error,
    ).toBe("Attachment type does not match its filename");
  });

  it("rejects paths outside the authenticated merchant namespace", () => {
    expect(
      validateMerchantSupportAttachments(
        [
          attachment({
            file_path: `${OTHER_MERCHANT_ID}/tickets/${SESSION_ID}/${FILE_ID}_register-screen.png`,
          }),
        ],
        MERCHANT_ID,
      ).error,
    ).toBe("One or more attachment paths are invalid");
  });

  it("rejects video URLs on an unconfigured CDN host", () => {
    expect(
      validateMerchantSupportAttachments(
        [
          attachment({
            file_name: "repro.mp4",
            file_path:
              `https://attacker.test/merchants/${MERCHANT_ID}/support/` +
              `${SESSION_ID}_${FILE_ID}_repro.mp4`,
            file_type: "video/mp4",
          }),
        ],
        MERCHANT_ID,
        "cdn.test",
      ).error,
    ).toBe("One or more attachment paths are invalid");
  });

  it("rejects non-canonical paths and path/filename mismatches", () => {
    expect(
      validateMerchantSupportAttachments(
        [
          attachment({
            file_path: `${MERCHANT_ID}/tickets/not-a-session/${FILE_ID}_register-screen.png`,
          }),
        ],
        MERCHANT_ID,
      ).error,
    ).toBe("One or more attachment paths are invalid");

    expect(
      validateMerchantSupportAttachments(
        [attachment({ file_name: "different.png" })],
        MERCHANT_ID,
      ).error,
    ).toBe("One or more attachment paths are invalid");
  });
});
