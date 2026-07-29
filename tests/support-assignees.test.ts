import { describe, expect, it } from "vitest";
import {
  parseSupportAssigneeEmails,
  validateSupportAssigneeSelection,
} from "@/lib/support/assignees";

describe("support ticket email assignees", () => {
  it("parses configured emails and removes case-insensitive duplicates", () => {
    expect(
      parseSupportAssigneeEmails(
        "ali@example.com; DEV@example.com\nAli@example.com,invalid",
      ),
    ).toEqual(["ali@example.com", "DEV@example.com"]);
  });

  it("accepts only configured assignees and preserves configured casing", () => {
    expect(
      validateSupportAssigneeSelection(
        ["DEV@example.com", "ali@example.com"],
        "ali@example.com,dev@example.com",
      ),
    ).toEqual(["dev@example.com", "ali@example.com"]);
  });

  it("rejects a client-supplied email that is not configured", () => {
    expect(() =>
      validateSupportAssigneeSelection(
        ["outsider@example.com"],
        "ali@example.com,dev@example.com",
      ),
    ).toThrow("is not a configured support assignee");
  });
});
