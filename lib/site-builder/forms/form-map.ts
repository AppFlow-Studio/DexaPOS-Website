/**
 * Resolving a `form` section's `formId` to a definition it can render.
 *
 * Exactly the shape of `asset-map.ts`, and for the same reasons:
 *
 *  - **`loadFormMap`** runs for a merchant in the builder, under RLS.
 *  - **`loadPublicFormMap`** runs for an anonymous visitor, who cannot read
 *    `site_forms` at all, and goes through `get_public_site_form` — a SECURITY
 *    DEFINER function that returns only the *published* definition, scoped by
 *    site id so a form id harvested from one merchant's page cannot be rendered
 *    under another's.
 *
 * Both fail soft. A form lookup that errors costs the page its form, not the
 * page — and a section whose form has been deleted renders nothing rather than
 * a broken embed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeForm, type FormDocument } from "./document";

export interface ResolvedForm {
  id: string;
  name: string;
  doc: FormDocument;
}

export type FormMap = Map<string, ResolvedForm>;

export const EMPTY_FORM_MAP: FormMap = new Map();

/** The resolver a `RenderContext` wants, backed by a loaded map. */
export function formResolver(map: FormMap) {
  return (formId: string): ResolvedForm | null => map.get(formId) ?? null;
}

/**
 * Every `formId` a document references.
 *
 * Walks props generically rather than looking only at `form` sections, so a
 * future kind that embeds a form is collected without touching this function —
 * the same approach `collectAssetIds` takes.
 */
export function collectFormIds(doc: { sections: { props: unknown }[] }): string[] {
  const seen = new Set<string>();

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    if (typeof record.formId === "string" && record.formId) seen.add(record.formId);

    Object.values(record).forEach(visit);
  };

  for (const section of doc.sections) visit(section.props);
  return [...seen];
}

/**
 * The merchant's own view, under RLS.
 *
 * Reads `draft_definition` rather than the published one, because the builder
 * canvas must show the merchant what they are currently editing — a form they
 * have just changed and not yet published should look changed in the preview.
 * The public path deliberately does the opposite.
 */
export async function loadFormMap(
  supabase: SupabaseClient,
  merchantId: string,
  formIds: string[],
): Promise<FormMap> {
  if (formIds.length === 0) return EMPTY_FORM_MAP;

  const { data, error } = await supabase
    .from("site_forms")
    .select("id, name, draft_definition")
    .eq("merchant_id", merchantId)
    .is("archived_at", null)
    .in("id", formIds);

  if (error) {
    console.warn("[site-builder] form lookup failed:", error.message);
    return EMPTY_FORM_MAP;
  }

  return toMap(
    ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? "Form"),
      definition: row.draft_definition,
    })),
  );
}

/**
 * The anonymous visitor's view.
 *
 * One RPC call per form. Forms per page are in the low single digits — a page
 * with four different enquiry forms on it is not a page anyone builds — so the
 * round trips are bounded and parallel, and the alternative (an array-argument
 * RPC) buys nothing but a second function to keep in step with this one.
 */
export async function loadPublicFormMap(
  supabase: SupabaseClient,
  siteId: string,
  formIds: string[],
): Promise<FormMap> {
  if (formIds.length === 0) return EMPTY_FORM_MAP;

  const rows = await Promise.all(
    formIds.map(async (formId) => {
      const { data, error } = await supabase.rpc("get_public_site_form", {
        p_site_id: siteId,
        p_form_id: formId,
      });

      if (error) {
        console.warn(`[site-builder] public form ${formId} failed:`, error.message);
        return null;
      }

      const row = (data as Record<string, unknown>[] | null)?.[0];
      if (!row) return null;

      return {
        id: String(row.form_id),
        name: String(row.form_name ?? "Form"),
        definition: row.definition,
      };
    }),
  );

  return toMap(rows.flatMap((row) => (row ? [row] : [])));
}

function toMap(rows: { id: string; name: string; definition: unknown }[]): FormMap {
  const map: FormMap = new Map();
  for (const row of rows) {
    // Normalized on the way out, like every other stored document: a definition
    // written by an older build must render rather than throw on a live page.
    map.set(row.id, { id: row.id, name: row.name, doc: normalizeForm(row.definition) });
  }
  return map;
}
