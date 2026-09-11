import { verifyToken } from "npm:@clerk/backend";
import { createClient } from "npm:@supabase/supabase-js";
import { SignJWT, jwtVerify } from "npm:jose@6";

type MerchantAssetCategory =
  | "logos"
  | "cfd-images"
  | "menu-categories"
  | "menu-items"
  | "menus"
  | "documents"
  // Website builder media (parity plan Phase 3). Uploads reach this category
  // only through `UploadSiteAsset`, which applies a *stricter* gate than the
  // one below — it rejects SVG outright and verifies the file's magic bytes
  // against its declared type. The allowlist here stays as it was so the
  // categories that predate it keep working.
  | "website"
  | "kiosk"
  | "support";

type OrganizationAssetCategory = "logos" | "documents" | "support";

type UploadRequest =
  | {
      scope: "merchant";
      merchantId: string;
      category: MerchantAssetCategory;
      fileName: string;
      fileBase64: string;
      contentType: string;
    }
  | {
      scope: "organization";
      organizationId: string;
      category: OrganizationAssetCategory;
      fileName: string;
      fileBase64: string;
      contentType: string;
    };

type DeleteRequest =
  | {
      scope: "merchant";
      merchantId: string;
      storagePath: string;
    }
  | {
      scope: "organization";
      organizationId: string;
      storagePath: string;
    };

type CdnResponse = {
  success: boolean;
  uploadToken?: string;
  cdnUrl?: string;
  storagePath?: string;
  error?: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY")!;

const STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE_NAME")!;
const API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY")!;
const REGION = Deno.env.get("BUNNY_STORAGE_REGION") || "";
const CDN_HOSTNAME = Deno.env.get("BUNNY_CDN_HOSTNAME")!;

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;
// Kiosk idle-screen videos: a short, muted, looping H.264/MP4 clip. Capped at
// 20MB to keep the base64 payload (~27MB) small enough for a single edge-function
// invoke from both the browser and the POS tablet (memory-safe on Hermes).
const MAX_KIOSK_VIDEO_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_SUPPORT_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;
// Finish before the gateway's idle deadline so failures can carry our CORS
// headers instead of becoming an opaque browser "Network error".
const STORAGE_UPLOAD_TIMEOUT_MS = 120_000;
const STORAGE_DELETE_TIMEOUT_MS = 10_000;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  // The website builder has advertised AVIF since it shipped — in its upload
  // dialog, its `accept` attribute and its own rejection message — while this
  // set did not carry it, so every AVIF cleared the app's gate and was refused
  // here. `lib/site-builder/assets.ts` is the stricter list and a test now
  // asserts it stays a subset of this one.
  "image/avif",
]);

const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// Kiosk clips remain MP4-only. Support recordings also accept MOV and WebM and
// use their own 100 MB ceiling.
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4"]);
const ALLOWED_SUPPORT_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, " +
    "x-cdn-scope, x-cdn-merchant-id, x-cdn-organization-id, x-cdn-category, x-cdn-file-name, x-cdn-content-type, x-cdn-upload-token",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const regionPrefix = REGION ? `${REGION}.` : "";
const STORAGE_BASE = `https://${regionPrefix}storage.bunnycdn.com/${STORAGE_ZONE}`;

function jsonResponse(body: CdnResponse | { error: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders,
    },
  });
}

/**
 * The categories that actually exist, at runtime.
 *
 * **`MerchantAssetCategory` above is a type, and types do not survive to
 * runtime.** `category` was interpolated straight into the storage path with
 * nothing checking it, so an authenticated merchant admin could send
 * `category: "../../organizations/<someone>/logos"` and write outside their own
 * directory — `sanitizeFileName` rejects `..` and slashes, but only in
 * `fileName`. These sets are what makes the union real.
 */
const MERCHANT_CATEGORIES = new Set<string>([
  "logos",
  "cfd-images",
  "menu-categories",
  "menu-items",
  "menus",
  "documents",
  "website",
  "kiosk",
  "support",
]);

const ORGANIZATION_CATEGORIES = new Set<string>([
  "logos",
  "documents",
  "support",
]);

function isValidCategory(scope: string, category: unknown): boolean {
  if (typeof category !== "string") return false;
  return scope === "merchant"
    ? MERCHANT_CATEGORIES.has(category)
    : ORGANIZATION_CATEGORIES.has(category);
}

/**
 * Refuses a path that could climb out of the directory it was scoped to.
 *
 * The delete path checked `storagePath.startsWith("merchants/{id}/")`, which
 * `merchants/{id}/../../elsewhere` satisfies — the prefix matches before the
 * traversal resolves. Checked here as well as by the prefix so that a future
 * caller building a path a different way inherits the guard.
 */
function hasTraversal(path: string): boolean {
  return path.includes("..") || path.includes("\\");
}

function isUploadRequest(body: unknown): body is UploadRequest {
  return typeof body === "object" && body !== null && "fileName" in body;
}

function isDeleteRequest(body: unknown): body is DeleteRequest {
  return typeof body === "object" && body !== null && "storagePath" in body;
}

function sanitizeFileName(fileName: string): string | null {
  if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    return null;
  }
  return fileName;
}

function estimateBase64Size(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

// Kiosk uploads can be either an image or a video, so type/size rules are
// resolved from the content type as well as the category. Video is gated to the
// kiosk category; a video/* content type under any other category falls through
// to the image rules and is rejected.
function isKioskVideoUpload(
  category: MerchantAssetCategory | OrganizationAssetCategory,
  contentType: string,
): boolean {
  return category === "kiosk" && contentType.startsWith("video/");
}

// A session JWT lasts only one minute and may expire while a gateway receives
// the body. Authorize a body-free request first, then grant 15 minutes for ONE
// exact owner/category/filename/type. This token cannot authorize other APIs,
// deletes, or another file. Membership and real byte limits are still checked
// by handleBinaryUpload when the transfer arrives.
function uploadBinding(req: Request): string {
  return JSON.stringify([
    "x-cdn-scope", "x-cdn-merchant-id", "x-cdn-organization-id",
    "x-cdn-category", "x-cdn-file-name", "x-cdn-content-type",
  ].map((name) => req.headers.get(name) ?? ""));
}

async function issueUploadToken(req: Request, userId: string): Promise<string> {
  return await new SignJWT({ upload: uploadBinding(req) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("cdn-upload")
    .setAudience("support-video-upload")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY));
}

async function verifyUploadToken(req: Request, token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY),
      {
        algorithms: ["HS256"], issuer: "cdn-upload",
        audience: "support-video-upload", maxTokenAge: "15m",
        requiredClaims: ["exp", "iat", "sub"],
      },
    );
    return typeof payload.sub === "string" && payload.sub.length > 0 &&
        payload.upload === uploadBinding(req)
      ? payload.sub : null;
  } catch {
    return null;
  }
}

function isSupportVideoUpload(
  category: MerchantAssetCategory | OrganizationAssetCategory,
  contentType: string,
): boolean {
  return category === "support" && contentType.startsWith("video/");
}

function getAllowedTypes(
  category: MerchantAssetCategory | OrganizationAssetCategory,
  contentType: string,
): Set<string> {
  if (isSupportVideoUpload(category, contentType)) {
    return ALLOWED_SUPPORT_VIDEO_TYPES;
  }
  if (isKioskVideoUpload(category, contentType)) return ALLOWED_VIDEO_TYPES;
  return category === "documents" ? ALLOWED_DOCUMENT_TYPES : ALLOWED_IMAGE_TYPES;
}

function getMaxSize(
  category: MerchantAssetCategory | OrganizationAssetCategory,
  contentType: string,
): number {
  if (isSupportVideoUpload(category, contentType)) {
    return MAX_SUPPORT_VIDEO_SIZE_BYTES;
  }
  if (isKioskVideoUpload(category, contentType)) {
    return MAX_KIOSK_VIDEO_SIZE_BYTES;
  }
  return category === "documents" ? MAX_DOCUMENT_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
}

function buildStoragePath(body: UploadRequest): string {
  if (body.scope === "merchant") {
    return `merchants/${body.merchantId}/${body.category}/${body.fileName}`;
  }

  return `organizations/${body.organizationId}/${body.category}/${body.fileName}`;
}

function getExpectedDeletePrefix(body: DeleteRequest): string {
  if (body.scope === "merchant") {
    return `merchants/${body.merchantId}/`;
  }

  return `organizations/${body.organizationId}/`;
}

async function requireAuthenticatedUser(token: string) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const verifiedToken = await verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
    });

    const userId = verifiedToken.sub;
    if (!userId) {
      return { ok: false as const, error: "Unauthorized" };
    }

    return {
      ok: true as const,
      userId,
      admin,
    };
  } catch (error) {
    console.error("[cdn-upload] Clerk token verification failed", error);
    return { ok: false as const, error: "Unauthorized" };
  }
}

async function isDexaHqAdmin(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data: memberRows, error: membersError } = await admin
    .from("members")
    .select("role")
    .eq("user_id", userId);

  if (membersError || !memberRows?.length) {
    return false;
  }

  const roleCodes = Array.from(
    new Set(
      memberRows
        .map((row) => row.role)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  if (roleCodes.length === 0) {
    return false;
  }

  const { data: roles, error: rolesError } = await admin
    .from("roles")
    .select("code")
    .in("code", roleCodes)
    .eq("organization_type", "hq");

  return !rolesError && Boolean(roles?.length);
}

async function verifyMerchantAccess(
  admin: ReturnType<typeof createClient>,
  userId: string,
  merchantId: string,
): Promise<boolean> {
  if (await isDexaHqAdmin(admin, userId)) {
    return true;
  }

  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .select("id, clerk_org_id")
    .eq("id", merchantId)
    .single();

  if (merchantError || !merchant) {
    return false;
  }

  const { data: member, error: memberError } = await admin
    .from("members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("organization_id", merchant.clerk_org_id)
    .limit(1)
    .maybeSingle();

  return !memberError && Boolean(member);
}

async function verifyOrganizationUploadAccess(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  return await isDexaHqAdmin(admin, userId);
}

async function proxyUpload(
  storagePath: string,
  content: BodyInit,
): Promise<Response> {
  return await fetch(`${STORAGE_BASE}/${storagePath}`, {
    method: "PUT",
    headers: {
      AccessKey: API_KEY,
      "Content-Type": "application/octet-stream",
    },
    body: content,
    signal: AbortSignal.timeout(STORAGE_UPLOAD_TIMEOUT_MS),
  });
}

async function proxyDelete(storagePath: string): Promise<Response> {
  return await fetch(`${STORAGE_BASE}/${storagePath}`, {
    method: "DELETE",
    headers: {
      AccessKey: API_KEY,
    },
    signal: AbortSignal.timeout(STORAGE_DELETE_TIMEOUT_MS),
  });
}

/**
 * Streamed upload: file metadata rides in x-cdn-* headers and the raw bytes are
 * the request body (no base64, no JSON). This is what large media (kiosk videos)
 * uses — the base64-in-JSON path holds several multi-MB copies of the file at
 * once and exceeds the worker's memory limit on ~16MB+ files.
 */
async function handleBinaryUpload(
  req: Request,
  auth: { userId: string; admin: ReturnType<typeof createClient> },
  prepareOnly = false,
): Promise<Response> {
  const scope =
    req.headers.get("x-cdn-scope") === "organization" ? "organization" : "merchant";
  const merchantId = req.headers.get("x-cdn-merchant-id") ?? "";
  const organizationId = req.headers.get("x-cdn-organization-id") ?? "";
  const category = (req.headers.get("x-cdn-category") ?? "") as
    | MerchantAssetCategory
    | OrganizationAssetCategory;
  const contentType = req.headers.get("x-cdn-content-type") ?? "application/octet-stream";

  const safeFileName = sanitizeFileName(req.headers.get("x-cdn-file-name") ?? "");
  if (!safeFileName) {
    return jsonResponse({ success: false, error: "Invalid fileName" }, 400);
  }

  if (!isValidCategory(scope, category)) {
    return jsonResponse({ success: false, error: "Invalid category" }, 400);
  }

  const allowedTypes = getAllowedTypes(category, contentType);
  if (!allowedTypes.has(contentType)) {
    return jsonResponse(
      { success: false, error: `Content type ${contentType} not allowed for ${category}` },
      400,
    );
  }

  const maxSize = getMaxSize(category, contentType);
  const declaredLengthHeader = prepareOnly ? null : req.headers.get("content-length");
  let declaredLength: number | null = null;
  if (declaredLengthHeader !== null) {
    const parsedLength = Number(declaredLengthHeader);
    if (
      !/^\d+$/.test(declaredLengthHeader) ||
      !Number.isSafeInteger(parsedLength) ||
      parsedLength <= 0
    ) {
      return jsonResponse(
        { success: false, error: "Invalid Content-Length header" },
        400,
      );
    }
    declaredLength = parsedLength;
  }

  if (prepareOnly && !isSupportVideoUpload(category, contentType)) {
    return jsonResponse({ success: false, error: "Only support videos can be prepared" }, 400);
  }
  if (declaredLength !== null && declaredLength > maxSize) {
    return jsonResponse({ success: false, error: "File exceeds size limit" }, 400);
  }

  if (
    (scope === "merchant" && !merchantId) ||
    (scope === "organization" && !organizationId)
  ) {
    return jsonResponse({ success: false, error: "Upload owner is required" }, 400);
  }

  let hasAccess = false;
  if (scope === "merchant") {
    hasAccess = await verifyMerchantAccess(auth.admin, auth.userId, merchantId);
  } else {
    hasAccess = await verifyOrganizationUploadAccess(auth.admin, auth.userId);
  }
  if (!hasAccess) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 403);
  }

  if (prepareOnly) {
    return jsonResponse({ success: true, uploadToken: await issueUploadToken(req, auth.userId) });
  }

  const ownerPrefix =
    scope === "merchant"
      ? `merchants/${merchantId}`
      : `organizations/${organizationId}`;
  const storagePath = `${ownerPrefix}/${category}/${safeFileName}`;

  if (!req.body) {
    return jsonResponse({ success: false, error: "Upload body is required" }, 400);
  }

  // Stream directly to Bunny while counting the real bytes. Content-Length is
  // useful for an early rejection when the gateway preserves it, but HTTP/2 and
  // proxies may omit it; the transform is the authoritative server-side limit.
  // This also avoids buffering a 100 MB support recording in the Edge isolate.
  let receivedBytes = 0;
  let exceededSizeLimit = false;
  const limitedBody = req.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > maxSize) {
          exceededSizeLimit = true;
          controller.error(new Error("File exceeds size limit"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );

  let uploadRes: Response;
  try {
    uploadRes = await proxyUpload(storagePath, limitedBody);
  } catch (error) {
    // A streaming PUT may have created a partial object before the transform
    // stopped it or the connection failed. Cleanup has its own short deadline.
    await proxyDelete(storagePath).catch((cleanupError) => {
      console.error("[cdn-upload] Failed-upload cleanup failed", cleanupError);
    });
    if (exceededSizeLimit) {
      return jsonResponse({ success: false, error: "File exceeds size limit" }, 400);
    }
    console.error("[cdn-upload] Bunny binary transfer failed", error);
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return jsonResponse({
      success: false,
      error: timedOut
        ? "CDN storage timed out. Please retry the upload."
        : "CDN storage connection failed. Please retry the upload.",
    }, timedOut ? 504 : 502);
  }

  if (exceededSizeLimit || receivedBytes > maxSize) {
    await proxyDelete(storagePath).catch((cleanupError) => {
      console.error("[cdn-upload] Oversize cleanup failed", cleanupError);
    });
    return jsonResponse({ success: false, error: "File exceeds size limit" }, 400);
  }

  // An upstream rejection may arrive before it consumes the request body.
  // Report that status, not a misleading byte-count error. Don't wait for an
  // error response body which could itself stall beyond the upload deadline.
  void uploadRes.body?.cancel().catch(() => {});
  if (!uploadRes.ok) {
    console.error("[cdn-upload] Bunny upload failed (binary)", uploadRes.status);
    return jsonResponse(
      { success: false, error: `Bunny upload failed: ${uploadRes.status}` },
      502,
    );
  }

  if (
    receivedBytes <= 0 ||
    (declaredLength !== null && receivedBytes !== declaredLength)
  ) {
    await proxyDelete(storagePath).catch((cleanupError) => {
      console.error("[cdn-upload] Invalid-length cleanup failed", cleanupError);
    });
    return jsonResponse({ success: false, error: "Invalid upload length" }, 400);
  }

  const cdnUrl = `https://${CDN_HOSTNAME}/${storagePath}`;
  return jsonResponse({ success: true, cdnUrl, storagePath }, 201);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  // Include authentication setup and binary uploads in the same boundary as
  // JSON uploads. Uncaught exceptions are returned by the runtime without our
  // CORS headers, hiding the real failure from the browser.
  try {
    const uploadToken = req.headers.get("x-cdn-upload-token");
    if (req.method === "POST" && uploadToken) {
      const userId = await verifyUploadToken(req, uploadToken);
      if (!userId) {
        return jsonResponse({ success: false, error: "Upload permission expired or invalid. Please select the file again." }, 401);
      }
      return await handleBinaryUpload(req, {
        userId, admin: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
      });
    }

    if (!token) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
    const authResult = await requireAuthenticatedUser(token);
    if (!authResult.ok) {
      return jsonResponse({ success: false, error: authResult.error }, 401);
    }

    if (req.method === "GET") {
      return await handleBinaryUpload(req, authResult, true);
    }

    // Raw media must be routed before req.json() consumes the body.
    if (req.method === "POST" && req.headers.get("x-cdn-file-name")) {
      return await handleBinaryUpload(req, authResult);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    if (req.method === "POST") {
      if (!isUploadRequest(body)) {
        return jsonResponse({ success: false, error: "Invalid upload payload" }, 400);
      }

      const safeFileName = sanitizeFileName(body.fileName);
      if (!safeFileName) {
        return jsonResponse({ success: false, error: "Invalid fileName" }, 400);
      }

      // Before `buildStoragePath`, which interpolates this directly.
      if (!isValidCategory(body.scope, body.category)) {
        return jsonResponse({ success: false, error: "Invalid category" }, 400);
      }

      if (body.category === "support") {
        return jsonResponse(
          {
            success: false,
            error: "Support videos must use the binary upload endpoint",
          },
          400,
        );
      }

      const allowedTypes = getAllowedTypes(body.category, body.contentType);
      if (!allowedTypes.has(body.contentType)) {
        return jsonResponse(
          { success: false, error: `Content type ${body.contentType} not allowed for ${body.category}` },
          400,
        );
      }

      const sizeBytes = estimateBase64Size(body.fileBase64);
      if (sizeBytes > getMaxSize(body.category, body.contentType)) {
        return jsonResponse({ success: false, error: "File exceeds size limit" }, 400);
      }

      let hasAccess = false;
      if (body.scope === "merchant") {
        hasAccess = await verifyMerchantAccess(authResult.admin, authResult.userId, body.merchantId);
      } else {
        hasAccess = await verifyOrganizationUploadAccess(authResult.admin, authResult.userId);
      }

      if (!hasAccess) {
        return jsonResponse({ success: false, error: "Unauthorized" }, 403);
      }

      const storagePath = buildStoragePath({
        ...body,
        fileName: safeFileName,
      });

      const content = Uint8Array.from(atob(body.fileBase64), (char) => char.charCodeAt(0));
      const uploadRes = await proxyUpload(storagePath, content);

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error("[cdn-upload] Bunny upload failed", uploadRes.status, errorText);
        return jsonResponse(
          { success: false, error: `Bunny upload failed: ${uploadRes.status}` },
          502,
        );
      }

      const cdnUrl = `https://${CDN_HOSTNAME}/${storagePath}`;
      return jsonResponse({ success: true, cdnUrl, storagePath }, 201);
    }

    if (!isDeleteRequest(body)) {
      return jsonResponse({ success: false, error: "Invalid delete payload" }, 400);
    }

    const expectedPrefix = getExpectedDeletePrefix(body);
    if (!body.storagePath.startsWith(expectedPrefix) || hasTraversal(body.storagePath)) {
      return jsonResponse({ success: false, error: "Cannot delete outside allowed scope" }, 403);
    }

    let hasAccess = false;
    if (body.scope === "merchant") {
      hasAccess = await verifyMerchantAccess(authResult.admin, authResult.userId, body.merchantId);
    } else {
      hasAccess = await verifyOrganizationUploadAccess(authResult.admin, authResult.userId);
    }

    if (!hasAccess) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 403);
    }

    const deleteRes = await proxyDelete(body.storagePath);
    if (!deleteRes.ok) {
      const errorText = await deleteRes.text();
      console.error("[cdn-upload] Bunny delete failed", deleteRes.status, errorText);
      return jsonResponse(
        { success: false, error: `Bunny delete failed: ${deleteRes.status}` },
        502,
      );
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("[cdn-upload] Unhandled error", error);
    return jsonResponse(
      {
        success: false,
        error: "Internal server error",
      },
      500,
    );
  }
});
