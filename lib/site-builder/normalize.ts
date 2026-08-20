/**
 * Read-time repair.
 *
 * **`normalizePage` never throws.** That is the whole contract. A malformed,
 * truncated, hand-edited, or older-schema document must degrade to a renderable
 * page — never a 500 on a merchant's live public site. Whatever cannot be
 * salvaged is dropped and reported; whatever can be is kept.
 *
 * Every read path calls this: loading a draft, rendering a published version,
 * and validating before publish. Nothing downstream should defend against
 * malformed sections, because nothing downstream ever sees one.
 */

import type { z } from "zod";

import { runMigrations, type RawDocument } from "./migrations";
import {
  CURRENT_SCHEMA_VERSION,
  newSectionId,
  sortSectionsByZone,
  type PageDocument,
  type PageSeo,
} from "./page-document";
import { stringMaxOf } from "./schema-introspect";
import { getSectionDefinition } from "./sections/registry";
import { sectionStyleSchema } from "./sections/primitives";
import type { Section } from "./sections/types";

export type RepairKind =
  | "not_an_object"
  | "sections_not_an_array"
  | "section_not_an_object"
  | "unknown_kind"
  | "invalid_props"
  | "missing_id"
  | "duplicate_id"
  | "invalid_style"
  | "invalid_seo"
  | "truncated"
  | "migrated";

export interface Repair {
  kind: RepairKind;
  detail: string;
}

export interface NormalizeReport {
  doc: PageDocument;
  repairs: Repair[];
}

const EMPTY_DOC: PageDocument = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  sections: [],
  seo: {},
  settings: {},
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Salvages the fields of `raw` that individually satisfy the schema, discarding
 * the rest. Turns "one bad field" into "one defaulted field" rather than
 * "section reset to defaults", which is what a merchant would experience as
 * losing their work.
 */
function pickValidFields(
  schema: z.ZodObject<any>,
  raw: unknown,
): Record<string, unknown> {
  if (!isPlainObject(raw)) return {};
  const out: Record<string, unknown> = {};
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  for (const [key, field] of Object.entries(shape)) {
    if (!(key in raw)) continue;
    const parsed = field.safeParse(raw[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return out;
}

/**
 * Truncates stored strings that are longer than their field's current cap.
 *
 * **This is what makes tightening a character cap safe.** Without it, lowering
 * the title limit from 160 to 50 would fail that field's parse, `pickValidFields`
 * would drop it, and the section would fall back to its default — so a merchant
 * would open their page and find their headline replaced by the words "About
 * us". Truncating keeps the first 50 characters of what they actually wrote and
 * records that it happened.
 *
 * Top-level string fields only. Nested repeater rows carry their own caps, and
 * none of them has ever been tightened; when one is, this is where it grows.
 *
 * Read-time only. Nothing rewrites the stored jsonb — a later edit saves the
 * truncated value, and until then the original is still on disk.
 */
function clampStrings(
  schema: z.ZodObject<any>,
  raw: unknown,
): { props: unknown; clamped: string[] } {
  if (!isPlainObject(raw)) return { props: raw, clamped: [] };

  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const clamped: string[] = [];
  let out: Record<string, unknown> | null = null;

  for (const [key, field] of Object.entries(shape)) {
    const value = raw[key];
    if (typeof value !== "string") continue;
    const max = stringMaxOf(field);
    if (max === undefined || value.length <= max) continue;

    out ??= { ...raw };
    out[key] = value.slice(0, max);
    clamped.push(key);
  }

  return { props: out ?? raw, clamped };
}

function normalizeSeo(raw: unknown, repairs: Repair[]): PageSeo {
  if (!isPlainObject(raw)) {
    if (raw !== undefined) {
      repairs.push({ kind: "invalid_seo", detail: "seo was not an object" });
    }
    return {};
  }
  const seo: PageSeo = {};
  if (typeof raw.title === "string") seo.title = raw.title.slice(0, 300);
  if (typeof raw.description === "string") seo.description = raw.description.slice(0, 500);
  if (typeof raw.ogImageAssetId === "string") seo.ogImageAssetId = raw.ogImageAssetId;
  if (typeof raw.noindex === "boolean") seo.noindex = raw.noindex;
  return seo;
}

/**
 * Repairs one section, or returns `null` if it is beyond saving.
 *
 * Unknown kinds are **dropped, not preserved**. Preserving them would force
 * every renderer to handle a kind it knows nothing about; dropping them means a
 * rollback to a version containing a since-removed kind degrades gracefully.
 */
function normalizeSection(
  raw: unknown,
  seenIds: Set<string>,
  repairs: Repair[],
): Section | null {
  if (!isPlainObject(raw)) {
    repairs.push({ kind: "section_not_an_object", detail: typeof raw });
    return null;
  }

  const kind = raw.kind;
  const def = typeof kind === "string" ? getSectionDefinition(kind) : undefined;
  if (!def) {
    repairs.push({ kind: "unknown_kind", detail: String(kind) });
    return null;
  }

  // Id: present, a string, and unique on the page.
  let id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : "";
  if (!id) {
    id = newSectionId();
    repairs.push({ kind: "missing_id", detail: `${def.kind} → ${id}` });
  } else if (seenIds.has(id)) {
    const replacement = newSectionId();
    repairs.push({ kind: "duplicate_id", detail: `${id} → ${replacement}` });
    id = replacement;
  }
  seenIds.add(id);

  // Props: clamp over-long copy, then whole-object parse, with field-level
  // salvage as the fallback.
  const { props: clampedProps, clamped } = clampStrings(def.schema, raw.props);
  if (clamped.length > 0) {
    repairs.push({ kind: "truncated", detail: `${def.kind}: ${clamped.join(", ")}` });
  }

  const parsed = def.schema.safeParse(clampedProps);
  let props: unknown;
  if (parsed.success) {
    props = parsed.data;
  } else {
    props = { ...def.defaults(), ...pickValidFields(def.schema, clampedProps) };
    repairs.push({
      kind: "invalid_props",
      detail: `${def.kind}: ${parsed.error.issues.map((i) => i.path.join(".") || "(root)").join(", ")}`,
    });
  }

  const section = { id, kind: def.kind, props } as Section;

  if (raw.hidden === true) section.hidden = true;

  if (raw.style !== undefined) {
    const style = sectionStyleSchema.safeParse(raw.style);
    if (style.success) {
      section.style = style.data;
    } else {
      repairs.push({ kind: "invalid_style", detail: def.kind });
    }
  }

  return section;
}

/** `normalizePage` with the list of repairs it had to make. */
export function normalizePageWithReport(raw: unknown): NormalizeReport {
  const repairs: Repair[] = [];

  if (!isPlainObject(raw)) {
    repairs.push({ kind: "not_an_object", detail: typeof raw });
    return { doc: { ...EMPTY_DOC, sections: [] }, repairs };
  }

  const fromVersion =
    typeof raw.schemaVersion === "number" && Number.isFinite(raw.schemaVersion)
      ? raw.schemaVersion
      : 1;

  const { doc: migrated, applied } = runMigrations(
    raw as RawDocument,
    fromVersion,
    CURRENT_SCHEMA_VERSION,
  );
  if (applied.length > 0) {
    repairs.push({ kind: "migrated", detail: `v${fromVersion} → v${CURRENT_SCHEMA_VERSION}` });
  }

  const rawSections = migrated.sections;
  if (!Array.isArray(rawSections)) {
    if (rawSections !== undefined) {
      repairs.push({ kind: "sections_not_an_array", detail: typeof rawSections });
    }
    return {
      doc: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sections: [],
        seo: normalizeSeo(migrated.seo, repairs),
        settings: isPlainObject(migrated.settings) ? (migrated.settings as PageDocument["settings"]) : {},
      },
      repairs,
    };
  }

  const seenIds = new Set<string>();
  const sections = rawSections
    .map((s) => normalizeSection(s, seenIds, repairs))
    .filter((s): s is Section => s !== null);

  return {
    doc: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sections: sortSectionsByZone(sections),
      seo: normalizeSeo(migrated.seo, repairs),
      settings: isPlainObject(migrated.settings)
        ? (migrated.settings as PageDocument["settings"])
        : {},
    },
    repairs,
  };
}

/** The common case: repair a stored document, discard the report. */
export function normalizePage(raw: unknown): PageDocument {
  return normalizePageWithReport(raw).doc;
}
