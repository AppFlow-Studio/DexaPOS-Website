import type { SupabaseClient } from "@supabase/supabase-js";

import type { ResolvedAsset } from "./render-context";

/**
 * Loading the assets a page references.
 *
 * One query per render, never one per image: the ids are collected from the
 * document up front (`collectAssetIds`) and fetched as a single `= ANY(...)`.
 * A page with a nine-photo gallery costs the same as a page with one hero.
 *
 * Two loaders because there are two trust boundaries, not because there are two
 * behaviours:
 *
 *  * **`loadAssetMap`** runs as the signed-in merchant. RLS scopes it.
 *  * **`loadPublicAssetMap`** runs for an anonymous visitor, who cannot read
 *    `site_assets` at all, and goes through `get_public_site_assets` — a
 *    SECURITY DEFINER function that takes an explicit id list and returns only
 *    the four fields a renderer uses. No storage path, no filename, no byte
 *    count, no uploader, and no way to enumerate the library from a page that
 *    happens to reference one photograph.
 *
 * Both return a plain `Map`, and both fail soft: an asset lookup that errors
 * costs the page its photographs, not the page.
 */

export type AssetMap = Map<string, ResolvedAsset>;

/** The resolver a `RenderContext` wants, backed by a loaded map. */
export function assetResolver(map: AssetMap) {
  return (assetId: string): ResolvedAsset | null => map.get(assetId) ?? null;
}

export const EMPTY_ASSET_MAP: AssetMap = new Map();

interface AssetRow {
  id: string;
  cdn_url: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
}

function toMap(rows: AssetRow[] | null): AssetMap {
  const map: AssetMap = new Map();
  for (const row of rows ?? []) {
    map.set(row.id, {
      url: row.cdn_url,
      alt: row.alt_text,
      width: row.width,
      height: row.height,
    });
  }
  return map;
}

/**
 * Assets for a dashboard render — the builder canvas and the preview.
 *
 * Reads the table directly, so RLS decides what comes back. Soft-deleted rows
 * are excluded here as they are publicly, which is what makes the canvas an
 * honest preview: an image the merchant has deleted is missing in the editor
 * exactly as it will be missing on the published page.
 */
export async function loadAssetMap(
  supabase: SupabaseClient,
  assetIds: string[],
): Promise<AssetMap> {
  if (assetIds.length === 0) return EMPTY_ASSET_MAP;

  const { data, error } = await supabase
    .from("site_assets")
    .select("id, cdn_url, alt_text, width, height")
    .in("id", assetIds)
    .is("deleted_at", null);

  if (error) {
    console.error("[site-builder] asset load failed:", error.message);
    return EMPTY_ASSET_MAP;
  }

  return toMap(data as AssetRow[] | null);
}

/**
 * Assets for a public page render.
 *
 * Scoped to the merchant *and* to the explicit id list, both enforced inside
 * the SECURITY DEFINER function rather than here — a visitor's request never
 * chooses which merchant's assets are looked at.
 */
export async function loadPublicAssetMap(
  supabase: SupabaseClient,
  merchantId: string,
  assetIds: string[],
): Promise<AssetMap> {
  if (assetIds.length === 0) return EMPTY_ASSET_MAP;

  const { data, error } = await supabase.rpc("get_public_site_assets", {
    p_merchant_id: merchantId,
    p_asset_ids: assetIds,
  });

  if (error) {
    // A page that renders without its photographs is a page. A page that 500s
    // because the image table hiccuped is a lost customer.
    console.error("[site-builder] public asset load failed:", error.message);
    return EMPTY_ASSET_MAP;
  }

  return toMap(data as AssetRow[] | null);
}
