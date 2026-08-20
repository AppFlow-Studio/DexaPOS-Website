/**
 * Row shapes for the website-builder tables.
 *
 * `createServerSupabaseClient()` is constructed without a `Database` generic, so
 * query results arrive as `any`. These interfaces are what re-introduce type
 * safety at the boundary — every action casts its result to one of them rather
 * than passing `any` inward.
 *
 * Kept hand-written and next to the contract rather than waiting on
 * `database.types.ts`: that file is regenerated from a live database, and this
 * module has to compile before the migration has been applied anywhere.
 * Regenerating later is additive and will not conflict.
 *
 * Mirrors supabase/migrations/20260813120000_website_builder_foundation.sql.
 */

import type { PageDocument } from "./page-document";

export type RenderMode = "template" | "builder";
export type PageStatus = "draft" | "published" | "archived";

export interface MerchantSiteRow {
  id: string;
  /** One site per merchant. The site is brand-level and has no location. */
  merchant_id: string;
  /**
   * The brand site's web address, as `{subdomain}.dexaposai.com`.
   *
   * NULL until the merchant claims one, and **nothing is publicly reachable
   * until they do** — a built site serves only here, never at a storefront
   * slug. Shares one namespace with `online_store_config.slug`; the database
   * refuses collisions in both directions.
   */
  subdomain: string | null;
  render_mode: RenderMode;
  /** The website's own logo. NULL falls back to a storefront's `logo_url`. */
  logo_asset_id: string | null;
  nav: { items: unknown[] };
  theme: Record<string, unknown>;
  site_seo: Record<string, unknown>;
  integrations: Record<string, unknown>;
  /**
   * Availability toggles — `reviews`, `rewards`, `giftCards`, `reservations`.
   *
   * Deliberately typed loosely here and given its shape by
   * `resolveFeatures()`: the column is free-form jsonb written by whatever
   * build was deployed at the time, so a row may be `{}` or may carry a key
   * this build has never heard of.
   */
  features: Record<string, unknown>;
  /** Brand facts a page may display. Read through `resolveBrand()`. */
  brand: Record<string, unknown>;
  schema_version: number;
  max_pages: number | null;
  max_asset_bytes: number | null;
  custom_domain_allowed: boolean;
  first_published_at: string | null;
  last_published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SitePageRow {
  id: string;
  site_id: string;
  merchant_id: string;
  /** NULL = a brand page; set = a page about one location. See HANDOFF §11. */
  location_id: string | null;
  path: string;
  title: string;
  is_home: boolean;
  status: PageStatus;
  /** Raw JSONB. Always pass through `normalizePage()` before use. */
  draft_content: unknown;
  revision: number;
  published_version_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SitePageVersionRow {
  id: string;
  page_id: string;
  site_id: string;
  merchant_id: string;
  version_number: number;
  content: unknown;
  content_hash: string;
  schema_version: number;
  label: string | null;
  published_by: string | null;
  published_at: string;
  superseded_at: string | null;
  rolled_back_from_version_id: string | null;
}

/** A page row whose document has been normalized — what callers actually want. */
export interface SitePage extends Omit<SitePageRow, "draft_content"> {
  document: PageDocument;
}

/** Summary shape for the pages list; deliberately omits the document. */
export type SitePageSummary = Omit<SitePageRow, "draft_content">;

/**
 * A row of the website asset library.
 *
 * Page documents reference these by `id` and never by URL — see
 * `assetRefSchema`. That indirection is what lets the CDN hostname change, or
 * the storage provider change, without rewriting merchant JSONB (including
 * immutable published version rows, which must never be rewritten).
 */
export interface SiteAssetRow {
  id: string;
  merchant_id: string;
  storage_path: string;
  cdn_url: string;
  original_filename: string | null;
  mime_type: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  deleted_at: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

/** What the picker and the renderer need. Omits storage path and byte count. */
export interface SiteAssetSummary {
  id: string;
  cdnUrl: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  originalFilename: string | null;
  bytes: number;
  createdAt: string;
}

/** Uniform action result, matching the repo's `{ data?, error? }` convention. */
export interface ActionResult<T> {
  data?: T;
  error?: string;
  /** Machine-readable reason, so the UI can react without matching on prose. */
  code?: ActionErrorCode;
}

export type ActionErrorCode =
  | "unauthenticated"
  | "merchant_not_found"
  | "no_online_store"
  | "site_not_found"
  | "page_not_found"
  | "stale_revision"
  | "invalid_path"
  | "path_taken"
  | "page_limit_reached"
  | "not_deletable"
  | "invalid_document"
  | "asset_too_large"
  | "asset_type_rejected"
  | "quota_exceeded"
  | "upload_failed"
  | "db_error";
