"use server";

import { randomUUID } from "node:crypto";

import { LogAuditEvent } from "@/app/dashboard/actions/audit-logs";
import {
  checkAssetUpload,
  checkDocumentUpload,
  formatBytes,
  readImageSize,
  safeFileName,
  type AssetKind,
} from "@/lib/site-builder/assets";
import type {
  ActionResult,
  SiteAssetRow,
  SiteAssetSummary,
} from "@/lib/site-builder/db-types";
import { fetchMerchantId } from "@/lib/site-builder/site-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The website asset library.
 *
 * Two rules shape every function here:
 *
 *  1. **The registry row is the record; the CDN is storage.** Page documents
 *     reference `site_assets.id`, never a URL, so a merchant's pages survive a
 *     CDN change. Nothing outside this file writes `storage_path` or `cdn_url`.
 *  2. **Deleting is soft.** An asset on a published page must never become a
 *     broken image on a live site, and a page's published snapshot cannot be
 *     rewritten to drop the reference. `deleted_at` takes it out of the picker
 *     and out of public resolution; a retention sweep removes the bytes later.
 *
 * Authorization is RLS (`is_merchant_admin`), as everywhere else in this
 * feature — the merchant lookup here scopes the query, the database refuses the
 * access.
 */

function toSummary(row: SiteAssetRow): SiteAssetSummary {
  return {
    id: row.id,
    cdnUrl: row.cdn_url,
    altText: row.alt_text,
    width: row.width,
    height: row.height,
    originalFilename: row.original_filename,
    bytes: row.bytes,
    createdAt: row.created_at,
    mimeType: row.mime_type,
  };
}

/**
 * Uploads one image and registers it.
 *
 * Order matters: **validate, then upload, then register.** A file that fails
 * the gate never reaches the CDN, and a row is only written once bytes exist —
 * so the library can contain an asset whose file is missing (the CDN lost it)
 * but never an asset that was never checked.
 *
 * The one inconsistency this admits is an orphaned *file*: if the insert fails
 * after a successful upload, bytes sit on the CDN with no row. That is the
 * cheap direction to fail — invisible, costs storage, and swept later — whereas
 * a row pointing at nothing is a broken image on a merchant's website.
 */
export async function UploadSiteAsset(
  clerkOrgId: string,
  formData: FormData,
  /**
   * Which gate to apply, and which CDN category to land in.
   *
   * Explicit rather than sniffed from the file: a photo field must never accept
   * a PDF and the PDF field must never accept a photo, and that is a fact about
   * the field the merchant is filling in, not about the bytes they chose.
   */
  kind: AssetKind = "image",
): Promise<ActionResult<SiteAssetSummary>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return {
      error: kind === "document" ? "No document was provided" : "No image was provided",
      code: "asset_type_rejected",
    };
  }

  const merchantId = await fetchMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const buffer = Buffer.from(await file.arrayBuffer());

  // Declared type, real type, and size — all three, before anything leaves this
  // process. Both gates require the declared and sniffed types to agree, which
  // is what stops a filter keyed on the declaration being fooled.
  const head = new Uint8Array(buffer.subarray(0, 32));
  const check =
    kind === "document"
      ? checkDocumentUpload(file.type, buffer.byteLength, head)
      : checkAssetUpload(file.type, buffer.byteLength, head);
  if (!check.ok) return { error: check.message, code: check.code };

  const supabase = createServerSupabaseClient();

  const quota = await checkQuota(supabase, merchantId, buffer.byteLength);
  if (quota) return quota;

  // The unique component is ours, never the merchant's filename — their name
  // survives only as a readable prefix.
  const fileName = safeFileName(file.name, randomUUID().slice(0, 8), check.type);

  const { data: uploaded, error: uploadError } = await supabase.functions.invoke("cdn-upload", {
    method: "POST",
    body: {
      scope: "merchant",
      merchantId,
      // `documents` is what unlocks `application/pdf` and the 10 MB ceiling on
      // the function's side; `website` is images only.
      category: kind === "document" ? "documents" : "website",
      fileName,
      fileBase64: buffer.toString("base64"),
      contentType: check.type,
    },
  });

  if (uploadError || !uploaded?.success || !uploaded?.cdnUrl || !uploaded?.storagePath) {
    const detail =
      uploadError?.message ??
      (typeof uploaded?.error === "string" ? uploaded.error : "The upload did not complete");
    console.error("[site-builder] asset upload failed:", detail);
    return {
      error:
        kind === "document"
          ? "That document could not be uploaded. Try again."
          : "That image could not be uploaded. Try again.",
      code: "upload_failed",
    };
  }

  // Documents have no intrinsic pixel size; `readImageSize` is image-only and
  // a PDF simply stores null dimensions, which is what the column is for.
  const size =
    check.type === "application/pdf" ? null : readImageSize(new Uint8Array(buffer), check.type);

  const { data, error } = await supabase
    .from("site_assets")
    .insert({
      merchant_id: merchantId,
      storage_path: uploaded.storagePath,
      cdn_url: uploaded.cdnUrl,
      original_filename: file.name.slice(0, 200),
      mime_type: check.type,
      bytes: buffer.byteLength,
      width: size?.width ?? null,
      height: size?.height ?? null,
      uploaded_by: clerkOrgId,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "The image could not be saved", code: "db_error" };
  }

  const row = data as SiteAssetRow;

  await LogAuditEvent({
    clerkOrgId,
    action: "uploaded_website_asset",
    actionCategory: "website",
    severity: "info",
    resourceType: "site_asset",
    resourceId: row.id,
    resourceName: row.original_filename ?? fileName,
    changes: { after: { bytes: row.bytes, mimeType: row.mime_type } },
  });

  return { data: toSummary(row) };
}

/**
 * A merchant's library, newest first. Excludes soft-deleted rows.
 *
 * Filtered by kind at the database rather than in the picker: the PDF field and
 * the photo fields share one table, and a merchant choosing a hero image should
 * not have to scroll past their catering pack to find it.
 */
export async function ListSiteAssets(
  clerkOrgId: string,
  kind: AssetKind = "image",
): Promise<ActionResult<SiteAssetSummary[]>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const merchantId = await fetchMerchantId(clerkOrgId);
  if (!merchantId) return { error: "Merchant not found", code: "merchant_not_found" };

  const supabase = createServerSupabaseClient();
  const query = supabase
    .from("site_assets")
    .select("*")
    .eq("merchant_id", merchantId)
    .is("deleted_at", null);

  // Rows predating the document lane are all images and all carry an `image/*`
  // type, so the prefix match needs no backfill.
  const scoped =
    kind === "document"
      ? query.eq("mime_type", "application/pdf")
      : query.like("mime_type", "image/%");

  const { data, error } = await scoped.order("created_at", { ascending: false }).limit(200);

  if (error) return { error: error.message, code: "db_error" };
  return { data: ((data as SiteAssetRow[] | null) ?? []).map(toSummary) };
}

/**
 * The default alt text for an image, wherever it is used.
 *
 * Stored on the asset rather than only on the placement because accessibility
 * is a fact about the photograph, not about which page it happens to sit on —
 * and because asking a merchant to describe the same dish three times is how
 * you end up with three empty alt attributes. `AssetRef.alt` stays available as
 * a per-placement override for the cases where the context genuinely differs.
 */
export async function UpdateSiteAssetAlt(
  clerkOrgId: string,
  assetId: string,
  altText: string,
): Promise<ActionResult<SiteAssetSummary>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("site_assets")
    .update({ alt_text: altText.trim().slice(0, 300) || null })
    .eq("id", assetId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return { error: error?.message ?? "That image could not be updated", code: "db_error" };
  }

  return { data: toSummary(data as SiteAssetRow) };
}

/**
 * Removes an image from the library.
 *
 * Soft, and that is the whole point. A published page holds an immutable
 * snapshot referencing this id; hard-deleting would leave a live public page
 * with a broken image and no way to repair it short of republishing. Marking it
 * deleted takes it out of the picker and out of `get_public_site_assets`, so
 * `SiteImage` resolves null and renders nothing — the page loses a photo
 * instead of gaining a broken one.
 */
export async function DeleteSiteAsset(
  clerkOrgId: string,
  assetId: string,
): Promise<ActionResult<{ id: string }>> {
  if (!clerkOrgId) return { error: "Organization ID is required", code: "unauthenticated" };

  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("site_assets")
    .select("id, original_filename, deleted_at")
    .eq("id", assetId)
    .maybeSingle();

  if (!existing) return { error: "That image no longer exists", code: "db_error" };

  const { error } = await supabase
    .from("site_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", assetId);

  if (error) return { error: error.message, code: "db_error" };

  await LogAuditEvent({
    clerkOrgId,
    action: "deleted_website_asset",
    actionCategory: "website",
    severity: "warning",
    resourceType: "site_asset",
    resourceId: assetId,
    resourceName: (existing as { original_filename: string | null }).original_filename ?? "Image",
  });

  return { data: { id: assetId } };
}

/**
 * Refuses an upload that would take the merchant past their storage allowance.
 *
 * `max_asset_bytes` is NULL for every merchant today, which means unlimited —
 * the column has existed since the foundation migration precisely so that
 * turning limits on later is a config change rather than a migration plus a
 * customer conversation. Returns `null` when the upload may proceed.
 */
async function checkQuota(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  merchantId: string,
  incomingBytes: number,
): Promise<ActionResult<SiteAssetSummary> | null> {
  const { data: site } = await supabase
    .from("merchant_sites")
    .select("max_asset_bytes")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  const limit = (site as { max_asset_bytes: number | null } | null)?.max_asset_bytes;
  if (limit == null) return null;

  const { data: used } = await supabase.rpc("site_asset_bytes_used", {
    p_merchant_id: merchantId,
  });

  const consumed = typeof used === "number" ? used : 0;
  if (consumed + incomingBytes <= limit) return null;

  return {
    error: `That would take you past your ${formatBytes(limit)} of storage. Remove some images first.`,
    code: "quota_exceeded",
  };
}
