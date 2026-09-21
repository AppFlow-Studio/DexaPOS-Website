import { describe, expect, it } from "vitest";
import { deliveryDescription, deliveryLabel, messagePreviewParts, messagePurpose } from "../message-presentation";

describe("merchant message presentation", () => {
  it("identifies reservation confirmations without changing their content", () => {
    const body = "Joes Downtown Brooklyn Updated\nReservation confirmed for testing awdi\nMon, Aug 31 - 5:30 PM - Party of 2\nConfirmation #RES-HNTJY6";
    expect(messagePurpose({ body, direction: "outbound", campaign_id: null })).toBe("Reservation confirmation");
    expect(messagePreviewParts(body)).toEqual([{ kind: "text", text: body }]);
  });

  it("uses actual direction and campaign linkage before inferring a message's purpose", () => {
    expect(messagePurpose({ body: "reservation", direction: "inbound", campaign_id: "campaign" })).toBe("Customer reply");
    expect(messagePurpose({ body: "reservation", direction: "outbound", campaign_id: "campaign" })).toBe("Campaign message");
    expect(messagePurpose({ body: null, direction: "outbound", campaign_id: null })).toBe("Text message");
  });

  it.each(["joes-coffee-shop.localhost:3000", "127.0.0.1:3000", "10.0.0.1", "172.16.0.1", "192.168.1.2", "[::1]", "localhost.", "store.internal"]) (
    "replaces an unusable customer link to %s with an explanation", (host) => {
      const parts = messagePreviewParts(`View or cancel: http://${host}/r/private-token`);
      expect(parts).toEqual([
        { kind: "text", text: "View or cancel: " },
        { kind: "unavailable-link", text: "Link unavailable to customers" },
      ]);
      expect(JSON.stringify(parts)).not.toContain("private-token");
    },
  );

  it("gives public reservation links a short label while preserving the destination", () => {
    const href = "https://joes.example.com/r/abc?token=123";
    expect(messagePreviewParts(`View or cancel: ${href}. Thanks!`)).toEqual([
      { kind: "text", text: "View or cancel: " },
      { kind: "link", text: "View reservation", href },
      { kind: "text", text: ". Thanks!" },
    ]);
  });

  it("handles multiple links and does not mistake a public hostname containing localhost for a local address", () => {
    const parts = messagePreviewParts("https://localhost.example.com/receipt/123 https://shop.example.com/invoice/456");
    expect(parts.filter((part) => part.kind === "link").map((part) => part.text)).toEqual(["View receipt", "View invoice"]);
  });

  it("does not make non-web protocols clickable or expose embedded URL credentials", () => {
    expect(messagePreviewParts("javascript:alert(1)")).toEqual([{ kind: "text", text: "javascript:alert(1)" }]);
    expect(messagePreviewParts("https://secret:password@shop.example.com/r/abc")[0].kind).toBe("unavailable-link");
    expect(messagePreviewParts(null)).toEqual([]);
  });

  it("explains delivery states without provider terminology or false delivery claims", () => {
    expect(deliveryLabel("failed")).toBe("Not delivered");
    expect(deliveryDescription("sent")).toContain("has not been confirmed");
    expect(deliveryDescription("received")).toContain("reply from a customer");
    expect(deliveryLabel("provider_unknown")).toBe("Status unavailable");
  });
});
