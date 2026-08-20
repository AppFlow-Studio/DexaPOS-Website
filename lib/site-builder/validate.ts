/**
 * The publish gate.
 *
 * Errors block publishing; warnings inform and must stay dismissible. That
 * split matters: a merchant who deleted a menu item last month should still be
 * able to publish a typo fix.
 *
 * Runs against a document that has already been through `normalizePage`, so
 * most structural checks here are belt-and-braces. They exist anyway because
 * this is also the function a future API or AI generator will be validated
 * against, and those will not always have come through the builder.
 */

import { SECTION_KINDS, ZONE_ORDER, type SectionKind } from "./sections/kinds";
import { SECTION_REGISTRY } from "./sections/registry";
import type { PageDocument } from "./page-document";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  sectionId?: string;
  kind?: SectionKind;
}

export interface ValidationResult {
  /** True when there are no errors. Warnings do not block. */
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidateOptions {
  /**
   * Binding ids the resolver could not resolve — deleted menu items, mostly.
   * Supplied by a resolver dry-run at publish time (PLAN-03 §2.3, consequence
   * 1). Producing a *warning* rather than an error is deliberate: a live page
   * must keep publishing even when its source records have gone.
   */
  unresolvedBindingIds?: readonly string[];
}

/** Kinds that must be present because the merchant cannot delete them. */
function requiredKinds(): SectionKind[] {
  return SECTION_KINDS.filter((k) => !SECTION_REGISTRY[k].deletable);
}

export function validatePage(
  doc: PageDocument,
  options: ValidateOptions = {},
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const err = (code: string, message: string, extra: Partial<ValidationIssue> = {}) =>
    errors.push({ severity: "error", code, message, ...extra });
  const warn = (code: string, message: string, extra: Partial<ValidationIssue> = {}) =>
    warnings.push({ severity: "warning", code, message, ...extra });

  // ── Structure ────────────────────────────────────────────────────────────
  for (const kind of requiredKinds()) {
    if (!doc.sections.some((s) => s.kind === kind)) {
      err("missing_required_section", `The ${SECTION_REGISTRY[kind].label} section is missing.`, { kind });
    }
  }

  const seenIds = new Set<string>();
  const countByKind = new Map<SectionKind, number>();
  let lastZoneRank = -1;

  for (const section of doc.sections) {
    const def = SECTION_REGISTRY[section.kind];

    if (seenIds.has(section.id)) {
      err("duplicate_section_id", `Two sections share the id ${section.id}.`, {
        sectionId: section.id,
        kind: section.kind,
      });
    }
    seenIds.add(section.id);

    countByKind.set(section.kind, (countByKind.get(section.kind) ?? 0) + 1);

    const rank = ZONE_ORDER[def.zone];
    if (rank < lastZoneRank) {
      err(
        "zone_out_of_order",
        `${def.label} cannot appear after a section from a later part of the page.`,
        { sectionId: section.id, kind: section.kind },
      );
    }
    lastZoneRank = Math.max(lastZoneRank, rank);

    // Belt-and-braces: props must satisfy the schema.
    const parsed = def.schema.safeParse(section.props);
    if (!parsed.success) {
      err(
        "invalid_section_props",
        `${def.label} has invalid settings: ${parsed.error.issues
          .map((i) => i.path.join(".") || "(root)")
          .join(", ")}.`,
        { sectionId: section.id, kind: section.kind },
      );
    }
  }

  for (const [kind, count] of countByKind) {
    if (SECTION_REGISTRY[kind].singleton && count > 1) {
      err(
        "duplicate_singleton",
        `A page can only have one ${SECTION_REGISTRY[kind].label} section.`,
        { kind },
      );
    }
  }

  const bodyCount = doc.sections.filter(
    (s) => SECTION_REGISTRY[s.kind].zone === "body" && !s.hidden,
  ).length;
  if (bodyCount === 0) {
    err("empty_page", "Add at least one section between the hero and the footer.");
  }

  // ── Bindings ─────────────────────────────────────────────────────────────
  const unresolved = new Set(options.unresolvedBindingIds ?? []);

  for (const section of doc.sections) {
    const def = SECTION_REGISTRY[section.kind];
    if (def.bindingTypes.length === 0) continue;

    for (const { id, label } of collectSectionBindingIds(section.props)) {
      if (!id) {
        err("unset_binding", `${def.label} is not linked to a ${label} yet.`, {
          sectionId: section.id,
          kind: section.kind,
        });
      } else if (unresolved.has(id)) {
        warn(
          "unresolved_binding",
          `${def.label} refers to a ${label} that no longer exists. It will be skipped on your live page.`,
          { sectionId: section.id, kind: section.kind },
        );
      }
    }
  }

  // ── Content quality ──────────────────────────────────────────────────────
  for (const section of doc.sections) {
    const def = SECTION_REGISTRY[section.kind];
    const props = section.props as Record<string, unknown>;

    if (!section.hidden) {
      const incompleteMessage = incompleteSectionMessage(section.kind, props);
      if (incompleteMessage) {
        err("incomplete_section", incompleteMessage, {
          sectionId: section.id,
          kind: section.kind,
        });
      }

      for (const target of collectLinkTargets(props)) {
        if (
          (target.kind === "page" || target.kind === "url" || target.kind === "phone") &&
          !target.value?.trim()
        ) {
          err(
            "incomplete_link",
            `${def.label} has a link with no ${target.kind === "phone" ? "phone number" : "destination"}.`,
            { sectionId: section.id, kind: section.kind },
          );
        }
      }
    }

    if (Array.isArray(props.items) && props.items.length === 0 && !section.hidden) {
      warn("empty_section", `${def.label} is empty and will not show anything.`, {
        sectionId: section.id,
        kind: section.kind,
      });
    }
    if (Array.isArray(props.images) && props.images.length === 0 && !section.hidden) {
      warn("empty_section", `${def.label} has no photos yet.`, {
        sectionId: section.id,
        kind: section.kind,
      });
    }

    for (const asset of collectAssetRefs(props)) {
      if (!asset.alt) {
        warn(
          "image_missing_alt",
          `An image in ${def.label} has no alt text. Alt text helps search engines and screen readers.`,
          { sectionId: section.id, kind: section.kind },
        );
        break; // one warning per section is enough
      }
    }
  }

  // ── SEO ──────────────────────────────────────────────────────────────────
  const title = doc.seo.title?.trim();
  if (!title) {
    warn("seo_missing_title", "Add a page title so search results show the right name.");
  } else if (title.length > 60) {
    warn("seo_title_long", `The page title is ${title.length} characters; Google shows about 60.`);
  }

  const description = doc.seo.description?.trim();
  if (!description) {
    warn("seo_missing_description", "Add a page description to improve how the page appears in search.");
  } else if (description.length < 50 || description.length > 160) {
    warn(
      "seo_description_length",
      `The page description is ${description.length} characters; aim for 50–160.`,
    );
  }

  if (doc.seo.noindex) {
    warn("seo_noindex", "This page is set to stay out of search results.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Required content that schemas intentionally allow to be empty while editing. */
function incompleteSectionMessage(
  kind: SectionKind,
  props: Record<string, unknown>,
): string | null {
  switch (kind) {
    case "video":
      return typeof props.videoId === "string" && props.videoId.trim()
        ? null
        : "Add a video link or hide the Video section before publishing.";
    case "form":
      return typeof props.formId === "string" && props.formId.trim()
        ? null
        : "Choose a form or hide the Form section before publishing.";
    case "pdf":
      return isAssetRef(props.file)
        ? null
        : "Add a document or hide the PDF section before publishing.";
    case "integrations":
      return typeof props.embedUrl === "string" && props.embedUrl.trim()
        ? null
        : "Add an embed link or hide the Integration section before publishing.";
    default:
      return null;
  }
}

function isAssetRef(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).assetId === "string" &&
    Boolean((value as Record<string, unknown>).assetId)
  );
}

/** Walks props for link-target shapes at any depth, including footer repeaters. */
function collectLinkTargets(props: unknown): { kind: string; value?: string }[] {
  const out: { kind: string; value?: string }[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    if (
      typeof record.kind === "string" &&
      ["order", "menu", "contact", "page", "url", "phone"].includes(record.kind)
    ) {
      out.push({
        kind: record.kind,
        value: typeof record.value === "string" ? record.value : undefined,
      });
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(props);
  return out;
}

/** Walks props for `{ type, id }` binding shapes, at any depth. */
function collectSectionBindingIds(
  props: unknown,
): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    if (typeof record.type === "string" && "id" in record) {
      out.push({
        id: typeof record.id === "string" ? record.id : "",
        label: record.type.replace(/_/g, " "),
      });
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(props);
  return out;
}

/** Walks props for `AssetRef` shapes, at any depth. */
function collectAssetRefs(props: unknown): { assetId: string; alt?: string }[] {
  const out: { assetId: string; alt?: string }[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    if (typeof record.assetId === "string") {
      out.push({
        assetId: record.assetId,
        alt: typeof record.alt === "string" ? record.alt : undefined,
      });
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(props);
  return out;
}
