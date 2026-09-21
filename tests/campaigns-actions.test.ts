import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(),
  ilike: vi.fn(), or: vi.fn(), gte: vi.fn(), order: vi.fn(), range: vi.fn(),
  rpc: vi.fn(), service: vi.fn(), serviceFrom: vi.fn(),
}));

vi.mock("@/lib/admin/merchant-context", () => ({ getEffectiveMerchantContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: mocks.service,
}));

import { getCampaigns, getMessages } from "@/app/dashboard/campaigns/actions";

describe("Campaigns page merchant-scoped reads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ merchantId: "merchant-from-session" });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.service.mockReturnValue({ from: mocks.serviceFrom });
    const chain = { select: mocks.select, eq: mocks.eq, ilike: mocks.ilike, or: mocks.or, gte: mocks.gte, order: mocks.order, range: mocks.range };
    for (const method of [mocks.from, mocks.serviceFrom, mocks.select, mocks.eq, mocks.ilike, mocks.or, mocks.gte, mocks.order]) method.mockReturnValue(chain);
    mocks.range.mockResolvedValue({ data: [], count: 0, error: null });
  });

  it.each([getCampaigns, getMessages])("refuses an unauthorized organization before querying messages or campaigns", async (read) => {
    mocks.context.mockRejectedValue(new Error("User is not a member of the supplied clerk_org_id"));
    await expect(read("org-other")).rejects.toThrow("not a member");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each([
    { data: false, error: null },
    { data: null, error: null },
    { data: true, error: { message: "Permission check unavailable" } },
  ])("fails closed before privileged campaign reads when the permission check fails: %j", async (result) => {
    mocks.rpc.mockResolvedValue(result);
    await expect(getCampaigns("org-one")).rejects.toThrow("permission");
    expect(mocks.service).not.toHaveBeenCalled();
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });

  it("reads campaign history despite the legacy auth.uid policy, only after checking the caller's merchant permission", async () => {
    mocks.from.mockImplementation(() => { throw new Error('invalid input syntax for type uuid: "user_clerk"'); });
    mocks.range.mockResolvedValue({ data: [{ id: "campaign", name: "Lunch special" }], count: 1, error: null });
    const result = await getCampaigns("org-one");
    expect(mocks.rpc).toHaveBeenCalledWith("is_merchant_admin", { p_merchant_id: "merchant-from-session" });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.service.mock.invocationCallOrder[0]);
    expect(mocks.serviceFrom).toHaveBeenCalledWith("marketing_campaigns");
    expect(mocks.eq).toHaveBeenCalledWith("merchant_id", "merchant-from-session");
    expect(result.data[0].name).toBe("Lunch special");
  });

  it("keeps message reads on the authenticated client with RLS", async () => {
    await getMessages("org-one");
    expect(mocks.from).toHaveBeenCalledWith("message_log");
    expect(mocks.service).not.toHaveBeenCalled();
    const fields = mocks.select.mock.calls[0][0].split(",");
    for (const field of ["raw", "messaging_profile_id", "telnyx_message_id", "cost"]) {
      expect(fields).not.toContain(field);
    }
  });

  it.each([getCampaigns, getMessages])("uses the resolved merchant, including impersonation, instead of a browser merchant ID", async (read) => {
    await read("org-requested");
    expect(mocks.context).toHaveBeenCalledWith("org-requested");
    expect(mocks.eq).toHaveBeenCalledWith("merchant_id", "merchant-from-session");
  });

  it("keeps the merchant filter when viewing a campaign and paginates on the server", async () => {
    const campaignId = "11111111-1111-4111-8111-111111111111";
    mocks.range.mockResolvedValue({ data: [{ id: "message", status: "sent", cost: null }], count: 53, error: null });
    const result = await getMessages("org-one", { campaignId, page: 2, status: "sent", direction: "outbound" });
    expect(mocks.eq.mock.calls).toEqual(expect.arrayContaining([
      ["merchant_id", "merchant-from-session"], ["channel", "sms"],
      ["campaign_id", campaignId], ["status", "sent"], ["direction", "outbound"],
    ]));
    expect(mocks.range).toHaveBeenCalledWith(25, 49);
    expect(result.pagination).toMatchObject({ page: 2, total: 53, totalPages: 3 });
    expect(result.data[0]).toMatchObject({ status: "sent", cost: null });
    // Do not fetch raw provider payloads (which can include verification codes)
    // or reinterpret submission as delivery.
    expect(mocks.select.mock.calls[0][0].split(",")).not.toContain("raw");
  });

  it("does not turn database errors into a misleading empty history", async () => {
    mocks.range.mockResolvedValue({ data: null, count: null, error: { message: "permission denied" } });
    await expect(getMessages("org-one")).rejects.toThrow("Unable to load SMS messages");
    await expect(getCampaigns("org-one")).rejects.toThrow("Unable to load campaigns");
  });

  it("treats phone numbers as literal search text and strips filter control characters", async () => {
    await getMessages("org-one", { search: '+15551234567,%_("' });
    expect(mocks.or).toHaveBeenCalledWith("to_number.ilike.%+15551234567%,from_number.ilike.%+15551234567%,body.ilike.%+15551234567%");
    expect(mocks.eq).toHaveBeenCalledWith("merchant_id", "merchant-from-session");
  });

  it("applies the requested rolling time period", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-20T12:00:00Z"));
    await getMessages("org-one", { days: 7 });
    expect(mocks.gte).toHaveBeenCalledWith("created_at", "2026-09-13T12:00:00.000Z");
    now.mockRestore();
  });

  it.each([{ campaignId: "bad-id" }, { direction: "sideways" }, { status: "bogus" }, { days: -7 }])("rejects invalid message filters: %j", async (filters) => {
    await expect(getMessages("org-one", filters)).rejects.toThrow("Invalid");
    expect(mocks.range).not.toHaveBeenCalled();
  });
});
