import { describe, expect, it } from "vitest";
import { buildSupportTicketContext } from "@/lib/support/ticket-context";

describe("support ticket context presentation", () => {
  it("shows useful HQ ticket context", () => {
    expect(
      buildSupportTicketContext({
        created_from: "manage_support",
        source_org_id: "org_internal",
      }),
    ).toEqual([{ label: "Source", value: "DEXA HQ dashboard" }]);
  });

  it("normalizes merchant device and version context", () => {
    expect(
      buildSupportTicketContext({
        userAgent: "Mozilla/5.0 (Linux; Android 14)",
        app_version: "2.1.2",
      }),
    ).toEqual([
      {
        label: "Device",
        value: "Android",
        title: "Mozilla/5.0 (Linux; Android 14)",
      },
      { label: "App version", value: "2.1.2" },
    ]);
  });

  it("does not render an empty panel for unsupported metadata", () => {
    expect(buildSupportTicketContext({ assigned_to_emails: [] })).toEqual([]);
  });
});
