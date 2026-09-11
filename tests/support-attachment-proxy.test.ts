/**
 * Tests for the authenticated support-attachment proxy
 * (`/api/support/attachments/[attachmentId]`).
 *
 * This route is the only read path for support attachments: the Bunny CDN URL
 * and the Supabase object path are both withheld from clients, so every byte a
 * viewer sees passes through here. That makes it the enforcement point for
 * tenant isolation, and the place HTTP Range support has to work for video
 * seeking. Neither had any coverage.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const HQ_ORG_ID = "org_hq_internal";
const MERCHANT_ID = "11111111-1111-4111-8111-111111111111";
const MERCHANT_ORG_ID = "org_merchant_owner";
const OTHER_MERCHANT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_MERCHANT_ORG_ID = "org_merchant_other";
const CARRIER_ID = "33333333-3333-4333-8333-333333333333";
const CARRIER_ORG_ID = "org_carrier_owner";

const CDN_HOST = "cdn.example.test";
const VIDEO_SIZE = 2_545_397;
const VIDEO_PATH = `https://${CDN_HOST}/merchants/${MERCHANT_ID}/support/abc_def_clip.mp4`;

// The route reads DEXA_POS_INTERNAL_TEAM_ID and BUNNY_CDN_HOSTNAME at module
// load, so they must be set before the import below — `vi.stubEnv` inside a
// hook runs too late and every HQ check would silently fall through to 403.
process.env.DEXA_POS_INTERNAL_TEAM_ID = HQ_ORG_ID;
process.env.BUNNY_CDN_HOSTNAME = CDN_HOST;

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  audit: vi.fn(),
  attachmentRow: null as Record<string, unknown> | null,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: async () => ({
    id: "user-1",
    emailAddresses: [{ emailAddress: "viewer@example.com" }],
  }),
}));

vi.mock("@/app/dashboard/actions/audit-logs", () => ({
  LogAuditEvent: mocks.audit,
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (_column: string, value: string) => {
          chain.__value = value;
          return chain;
        },
        single: async () => {
          if (table === "support_ticket_attachments") {
            return mocks.attachmentRow
              ? { data: mocks.attachmentRow, error: null }
              : { data: null, error: { message: "not found" } };
          }
          if (table === "merchants") {
            // Resolve the caller's org to a merchant id. Only the owning org
            // maps to the ticket's merchant.
            const orgId = chain.__value as string;
            if (orgId === MERCHANT_ORG_ID) {
              return { data: { id: MERCHANT_ID }, error: null };
            }
            if (orgId === OTHER_MERCHANT_ORG_ID) {
              return { data: { id: OTHER_MERCHANT_ID }, error: null };
            }
            return { data: null, error: { message: "no merchant" } };
          }
          if (table === "carriers") {
            const orgId = chain.__value as string;
            return orgId === CARRIER_ORG_ID
              ? { data: { id: CARRIER_ID }, error: null }
              : { data: null, error: { message: "no carrier" } };
          }
          return { data: null, error: { message: "unexpected table" } };
        },
      };
      return chain;
    },
  }),
}));

// Imported dynamically, not with a static `import`: ESM hoists static imports
// above the `process.env` assignments above, so the route would capture an
// empty HQ_ORG_ID at module load and every HQ check would fall through to 403.
type RouteGet = typeof import(
  "@/app/api/support/attachments/[attachmentId]/route"
)["GET"];
let GET: RouteGet;

beforeAll(async () => {
  ({ GET } = await import(
    "@/app/api/support/attachments/[attachmentId]/route"
  ));
});

function videoAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: "attachment-1",
    ticket_id: "ticket-1",
    file_name: "clip.mp4",
    file_path: VIDEO_PATH,
    file_size: VIDEO_SIZE,
    file_type: "video/mp4",
    support_tickets: {
      id: "ticket-1",
      merchant_id: MERCHANT_ID,
      carrier_id: CARRIER_ID,
    },
    ...overrides,
  };
}

/**
 * The route reads `req.nextUrl.searchParams` (a NextRequest member), so a plain
 * Request is not enough — attach a parsed URL alongside the real headers.
 */
function request(
  headers: Record<string, string> = {},
  url = "https://app.test/api/support/attachments/attachment-1",
) {
  const base = new Request(url, { headers });
  Object.defineProperty(base, "nextUrl", {
    configurable: true,
    value: new URL(url),
  });
  return base as unknown as Parameters<RouteGet>[0];
}

const context = {
  params: Promise.resolve({ attachmentId: "attachment-1" }),
};

/** Upstream (Bunny or Supabase Storage) responding to a ranged fetch. */
function stubUpstream(options: { status: number; headers?: Record<string, string> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(new ReadableStream({ start: (c) => c.close() }), {
        status: options.status,
        headers: options.headers ?? {},
      }),
    ),
  );
}

describe("support attachment proxy", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mocks.audit.mockReset();
    mocks.attachmentRow = videoAttachment();
    stubUpstream({
      status: 200,
      headers: { "content-length": String(VIDEO_SIZE) },
    });
  });

  describe("tenant isolation", () => {
    it("refuses an unauthenticated caller", async () => {
      mocks.auth.mockResolvedValue({ userId: null, orgId: null });
      const res = await GET(request(), context);
      expect(res.status).toBe(401);
    });

    it("refuses a merchant from a different tenant", async () => {
      // The core security property: another merchant must not be able to read
      // this merchant's support evidence by guessing an attachment id.
      mocks.auth.mockResolvedValue({
        userId: "user-other",
        orgId: OTHER_MERCHANT_ORG_ID,
      });
      const res = await GET(request(), context);
      expect(res.status).toBe(403);
      expect(mocks.audit).not.toHaveBeenCalled();
    });

    it("refuses an org that matches neither a merchant nor a carrier", async () => {
      mocks.auth.mockResolvedValue({ userId: "user-x", orgId: "org_unknown" });
      const res = await GET(request(), context);
      expect(res.status).toBe(403);
    });

    it("allows the owning merchant", async () => {
      mocks.auth.mockResolvedValue({
        userId: "user-owner",
        orgId: MERCHANT_ORG_ID,
      });
      const res = await GET(request(), context);
      expect(res.status).toBe(200);
    });

    it("allows an HQ admin", async () => {
      mocks.auth.mockResolvedValue({ userId: "user-hq", orgId: HQ_ORG_ID });
      const res = await GET(request(), context);
      expect(res.status).toBe(200);
    });

    it("allows the carrier that owns the ticket", async () => {
      mocks.auth.mockResolvedValue({
        userId: "user-carrier",
        orgId: CARRIER_ORG_ID,
      });
      const res = await GET(request(), context);
      expect(res.status).toBe(200);
    });

    it("refuses a carrier when the ticket belongs to no carrier", async () => {
      mocks.attachmentRow = videoAttachment({
        support_tickets: {
          id: "ticket-1",
          merchant_id: MERCHANT_ID,
          carrier_id: null,
        },
      });
      mocks.auth.mockResolvedValue({
        userId: "user-carrier",
        orgId: CARRIER_ORG_ID,
      });
      const res = await GET(request(), context);
      expect(res.status).toBe(403);
    });

    it("returns 404 for an unknown attachment", async () => {
      mocks.attachmentRow = null;
      mocks.auth.mockResolvedValue({ userId: "user-hq", orgId: HQ_ORG_ID });
      const res = await GET(request(), context);
      expect(res.status).toBe(404);
    });
  });

  describe("audit logging", () => {
    it("flags a cross-tenant read as PII for HQ and carrier, but not the owner", async () => {
      mocks.auth.mockResolvedValue({ userId: "user-hq", orgId: HQ_ORG_ID });
      await GET(request(), context);
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "admin_viewed_attachment",
          piiAccessType: "attachment_view",
        }),
      );

      mocks.audit.mockReset();
      mocks.auth.mockResolvedValue({
        userId: "user-carrier",
        orgId: CARRIER_ORG_ID,
      });
      await GET(request(), context);
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "carrier_viewed_attachment",
          piiAccessType: "attachment_view",
        }),
      );

      mocks.audit.mockReset();
      mocks.auth.mockResolvedValue({
        userId: "user-owner",
        orgId: MERCHANT_ORG_ID,
      });
      await GET(request(), context);
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "viewed_own_attachment",
          piiAccessType: undefined,
        }),
      );
    });

    it("logs the opener but not continuation ranges", async () => {
      // Seeking fires a burst of ranged requests; logging each would flood
      // audit_logs and overstate access in PII reporting.
      mocks.auth.mockResolvedValue({ userId: "user-hq", orgId: HQ_ORG_ID });

      stubUpstream({
        status: 206,
        headers: {
          "content-range": `bytes 0-1023/${VIDEO_SIZE}`,
          "content-length": "1024",
        },
      });
      await GET(request({ range: "bytes=0-1023" }), context);
      expect(mocks.audit).toHaveBeenCalledTimes(1);

      mocks.audit.mockReset();
      stubUpstream({
        status: 206,
        headers: {
          "content-range": `bytes 1024-2047/${VIDEO_SIZE}`,
          "content-length": "1024",
        },
      });
      await GET(request({ range: "bytes=1024-2047" }), context);
      expect(mocks.audit).not.toHaveBeenCalled();
    });
  });

  describe("range requests (video seeking)", () => {
    beforeEach(() => {
      mocks.auth.mockResolvedValue({ userId: "user-hq", orgId: HQ_ORG_ID });
    });

    it("advertises Accept-Ranges on a full response", async () => {
      const res = await GET(request(), context);
      expect(res.headers.get("accept-ranges")).toBe("bytes");
      expect(res.headers.get("cache-control")).toContain("no-store");
    });

    it("returns 206 with Content-Range for a ranged request", async () => {
      stubUpstream({
        status: 206,
        headers: {
          "content-range": `bytes 100-199/${VIDEO_SIZE}`,
          "content-length": "100",
        },
      });
      const res = await GET(request({ range: "bytes=100-199" }), context);
      expect(res.status).toBe(206);
      expect(res.headers.get("content-range")).toBe(
        `bytes 100-199/${VIDEO_SIZE}`,
      );
      expect(res.headers.get("content-length")).toBe("100");
    });

    it("serves an open-ended range to the end of the object", async () => {
      stubUpstream({
        status: 206,
        headers: {
          "content-range": `bytes 500-${VIDEO_SIZE - 1}/${VIDEO_SIZE}`,
          "content-length": String(VIDEO_SIZE - 500),
        },
      });
      const res = await GET(request({ range: "bytes=500-" }), context);
      expect(res.status).toBe(206);
    });

    it("rejects an unsatisfiable range with 416 and the real size", async () => {
      const res = await GET(
        request({ range: `bytes=${VIDEO_SIZE + 10}-${VIDEO_SIZE + 20}` }),
        context,
      );
      expect(res.status).toBe(416);
      expect(res.headers.get("content-range")).toBe(`bytes */${VIDEO_SIZE}`);
    });

    it("falls back to 200 when upstream ignores the Range header", async () => {
      // Claiming 206 while streaming a whole object would misdescribe the body
      // and corrupt playback.
      stubUpstream({
        status: 200,
        headers: { "content-length": String(VIDEO_SIZE) },
      });
      const res = await GET(request({ range: "bytes=100-199" }), context);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-range")).toBeNull();
    });

    it("ignores a malformed Range header and serves the full object", async () => {
      const res = await GET(request({ range: "bytes=abc-def" }), context);
      expect(res.status).toBe(200);
    });
  });

  describe("CDN URL validation", () => {
    beforeEach(() => {
      mocks.auth.mockResolvedValue({ userId: "user-hq", orgId: HQ_ORG_ID });
    });

    it("refuses a CDN URL on an unexpected host", async () => {
      mocks.attachmentRow = videoAttachment({
        file_path: `https://evil.example.com/merchants/${MERCHANT_ID}/support/clip.mp4`,
      });
      const res = await GET(request(), context);
      expect(res.status).toBe(500);
    });

    it("refuses a CDN URL outside the ticket owner's prefix", async () => {
      mocks.attachmentRow = videoAttachment({
        file_path: `https://${CDN_HOST}/merchants/${OTHER_MERCHANT_ID}/support/clip.mp4`,
      });
      const res = await GET(request(), context);
      expect(res.status).toBe(500);
    });

    it("refuses a non-video attachment stored as a CDN URL", async () => {
      mocks.attachmentRow = videoAttachment({ file_type: "image/png" });
      const res = await GET(request(), context);
      expect(res.status).toBe(500);
    });
  });

  describe("content disposition", () => {
    beforeEach(() => {
      mocks.auth.mockResolvedValue({ userId: "user-hq", orgId: HQ_ORG_ID });
    });

    it("serves inline by default so <video> can play it", async () => {
      const res = await GET(request(), context);
      expect(res.headers.get("content-disposition")).toContain("inline");
      expect(res.headers.get("content-type")).toBe("video/mp4");
    });

    it("forces a download with ?download=1", async () => {
      const res = await GET(
        request({}, "https://app.test/api/support/attachments/attachment-1?download=1"),
        context,
      );
      expect(res.headers.get("content-disposition")).toContain("attachment");
    });
  });
});
