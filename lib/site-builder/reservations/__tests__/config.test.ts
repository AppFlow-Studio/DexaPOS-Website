import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ rpc }),
}));

const { loadReservationsConfig } = await import("../config");

/**
 * `loadReservationsConfig` runs inside the render of a merchant's home page.
 * Everything here is really one assertion said five ways: **it must not be able
 * to break a restaurant's website.** A reservations outage degrades the booking
 * section to a phone number; it never throws, and it never returns a branch the
 * guest cannot actually book.
 */

function row(over: Record<string, unknown> = {}) {
  return {
    location_id: "11111111-1111-1111-1111-111111111111",
    location_name: "Joes Downtown",
    address: "1 Main St · Brooklyn, NY",
    timezone: "America/New_York",
    phone: "(555) 010-0100",
    booking_policy: "Cancel at least 2 hours ahead.",
    collect_birthday: false,
    large_party_phone: null,
    cancellation_cutoff_min: 120,
    min_party_size: 1,
    max_party_size: 8,
    max_advance_days: 60,
    ...over,
  };
}

beforeEach(() => {
  rpc.mockReset();
});

describe("loadReservationsConfig", () => {
  it("maps a row to a bookable branch", async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });

    const { locations } = await loadReservationsConfig("site-1");

    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      name: "Joes Downtown",
      timezone: "America/New_York",
      bookingPolicy: "Cancel at least 2 hours ahead.",
      collectBirthday: false,
      minPartySize: 1,
      maxPartySize: 8,
      maxAdvanceDays: 60,
    });
  });

  it("passes the site id through to the RPC", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await loadReservationsConfig("site-42");

    expect(rpc).toHaveBeenCalledWith("get_public_reservation_config", {
      p_site_id: "site-42",
    });
  });

  /**
   * The failure that matters. An error here must not propagate into the page
   * render — a merchant's whole site would 500 because their booking settings
   * could not be read.
   */
  it("returns an empty list rather than throwing when the RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(loadReservationsConfig("site-1")).resolves.toEqual({ locations: [] });
  });

  it("returns an empty list rather than throwing when the client throws", async () => {
    rpc.mockRejectedValue(new Error("network down"));
    await expect(loadReservationsConfig("site-1")).resolves.toEqual({ locations: [] });
  });

  it("returns an empty list when the RPC answers with a non-array", async () => {
    rpc.mockResolvedValue({ data: { nope: true }, error: null });
    await expect(loadReservationsConfig("site-1")).resolves.toEqual({ locations: [] });
  });

  /**
   * A branch whose party bounds came back unusable cannot be booked: the guest
   * would face a party-size control with no valid values. Dropping it sends them
   * to the phone number instead, which is the honest outcome.
   */
  it("drops a branch whose party bounds are unusable", async () => {
    rpc.mockResolvedValue({
      data: [
        row({ location_id: "a", max_party_size: 0 }),
        row({ location_id: "b", min_party_size: 6, max_party_size: 2 }),
        row({ location_id: "c" }),
      ],
      error: null,
    });

    const { locations } = await loadReservationsConfig("site-1");
    expect(locations.map((l) => l.id)).toEqual(["c"]);
  });

  it("drops a row with no location id", async () => {
    rpc.mockResolvedValue({ data: [row({ location_id: null })], error: null });
    await expect(loadReservationsConfig("site-1")).resolves.toEqual({ locations: [] });
  });

  /**
   * Nulls are what the database actually returns for an unconfigured branch, and
   * every one of these has a defined meaning rather than being passed through to
   * blow up in the widget.
   */
  it("fills sane defaults for the columns a merchant may never have set", async () => {
    rpc.mockResolvedValue({
      data: [
        row({
          location_name: null,
          address: "   ",
          timezone: null,
          phone: null,
          booking_policy: "  ",
          collect_birthday: null,
          cancellation_cutoff_min: null,
          min_party_size: null,
          max_party_size: 8,
          max_advance_days: null,
        }),
      ],
      error: null,
    });

    const [branch] = (await loadReservationsConfig("site-1")).locations;

    expect(branch.name).toBe("Restaurant");
    expect(branch.address).toBeNull();
    expect(branch.timezone).toBe("America/New_York");
    expect(branch.bookingPolicy).toBeNull();
    expect(branch.collectBirthday).toBe(false);
    expect(branch.cancellationCutoffMin).toBe(120);
    expect(branch.minPartySize).toBe(1);
    expect(branch.maxAdvanceDays).toBe(60);
  });

  it("never reports a minimum party of zero", async () => {
    rpc.mockResolvedValue({ data: [row({ min_party_size: 0 })], error: null });
    const [branch] = (await loadReservationsConfig("site-1")).locations;
    expect(branch.minPartySize).toBe(1);
  });

  it("keeps every bookable branch, in the order the RPC returned them", async () => {
    rpc.mockResolvedValue({
      data: [row({ location_id: "a", location_name: "Alpha" }), row({ location_id: "b", location_name: "Beta" })],
      error: null,
    });

    const { locations } = await loadReservationsConfig("site-1");
    expect(locations.map((l) => l.name)).toEqual(["Alpha", "Beta"]);
  });
});
