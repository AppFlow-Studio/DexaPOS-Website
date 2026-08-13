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
  merchant_id: string;
  location_id: string;
  store_config_id: string;
  render_mode: RenderMode;
  nav: { items: unknown[] };
  theme: Record<string, unknown>;
  site_seo: Record<string, unknown>;
  integrations: Record<string, unknown>;
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
  | "db_error";
