import { describe, expect, it } from "vitest";
import { getTicketStatusLabel } from "@/types/support-ticket";

describe("support ticket scope labels", () => {
  it("keeps merchant waiting status wording", () => {
    expect(getTicketStatusLabel("waiting_on_merchant", "merchant")).toBe(
      "Waiting on Merchant",
    );
  });

  it("uses reporter wording for HQ internal tickets", () => {
    expect(getTicketStatusLabel("waiting_on_merchant", "hq_internal")).toBe(
      "Waiting on Reporter",
    );
  });

  it("keeps shared status wording unchanged", () => {
    expect(getTicketStatusLabel("in_progress", "merchant")).toBe("In Progress");
    expect(getTicketStatusLabel("in_progress", "hq_internal")).toBe(
      "In Progress",
    );
  });
});
