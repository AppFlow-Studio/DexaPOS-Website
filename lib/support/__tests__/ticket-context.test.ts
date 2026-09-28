import { describe, expect, it } from "vitest";

import { buildSupportTicketContext } from "../ticket-context";

describe("buildSupportTicketContext", () => {
  it("returns nothing without metadata", () => {
    expect(buildSupportTicketContext(null)).toEqual([]);
    expect(buildSupportTicketContext(undefined)).toEqual([]);
    expect(buildSupportTicketContext({})).toEqual([]);
  });

  it("leads with the hardware a report was filed against", () => {
    const context = buildSupportTicketContext({
      device_serial: "TEST-PRN-0002",
      device_model: "Star Micronics TSP100III",
      device_location_name: "Uptown Branch",
      device_status: "In Repair",
      device_warranty: "Warranty expired",
      device_firmware_version: "1.0.4",
      device_mac_address: "00:11:62:3A:9F:04",
      userAgent: "Mozilla/5.0 (Macintosh)",
    });

    expect(context[0]).toEqual({
      label: "Device",
      value: "TEST-PRN-0002 · Star Micronics TSP100III",
    });
    expect(context.map((item) => item.label)).toEqual([
      "Device",
      "Installed at",
      "Registry status",
      "Warranty",
      "Firmware",
      "MAC",
      "Submitted from",
    ]);
  });

  it("falls back to the serial alone when no model was captured", () => {
    const context = buildSupportTicketContext({
      device_serial: "TEST-POS-0001",
    });

    expect(context).toEqual([{ label: "Device", value: "TEST-POS-0001" }]);
  });

  it("skips the device block entirely for a ticket with no device", () => {
    const context = buildSupportTicketContext({
      userAgent: "Mozilla/5.0 (iPhone)",
      submittedAt: "2026-09-26T10:41:00.000Z",
    });

    expect(context).toEqual([
      {
        label: "Submitted from",
        value: "iOS",
        title: "Mozilla/5.0 (iPhone)",
      },
      { label: "Submitted", value: "2026-09-26T10:41:00.000Z" },
    ]);
  });
});
