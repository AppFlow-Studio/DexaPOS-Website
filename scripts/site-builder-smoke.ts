/**
 * Smoke test for the site-builder section contract.
 *
 *   npx tsx scripts/site-builder-smoke.ts
 *
 * Exists because vitest cannot currently run on this machine (corrupt win32
 * rolldown native binding). The vitest suite in lib/site-builder/__tests__ is
 * the real coverage and runs in CI; this proves the module end to end locally
 * with no test runner involved.
 */

import {
  SECTION_KINDS,
  SECTION_REGISTRY,
  addSection,
  addableKinds,
  createStarterPage,
  duplicateSection,
  moveSection,
  moveSectionBy,
  normalizePageWithReport,
  removeSection,
  updateSectionProps,
  updateSeo,
  validatePage,
  type PageDocument,
} from "../lib/site-builder";

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function heading(text: string) {
  console.log(`\n${text}`);
}

// ── 1. Registry integrity ──────────────────────────────────────────────────
heading("1. Registry");

check(
  `all ${SECTION_KINDS.length} kinds have a registry entry`,
  SECTION_KINDS.every((k) => SECTION_REGISTRY[k]?.kind === k),
);
check(
  "every defaults() satisfies its own schema",
  SECTION_KINDS.every((k) =>
    SECTION_REGISTRY[k].schema.safeParse(SECTION_REGISTRY[k].defaults({ locationId: "loc_1" }))
      .success,
  ),
  SECTION_KINDS.filter(
    (k) =>
      !SECTION_REGISTRY[k].schema.safeParse(
        SECTION_REGISTRY[k].defaults({ locationId: "loc_1" }),
      ).success,
  ).join(", "),
);
check("locked sections are not addable", !addableKinds().includes("header"));
check(
  "popular-items declares a menu_item binding",
  SECTION_REGISTRY["popular-items"].bindingTypes.includes("menu_item"),
);
check(
  "popular-items schema has no price/name/image field (D6 is structural)",
  !["price", "name", "image", "imageUrl", "available"].some(
    (f) => f in (SECTION_REGISTRY["popular-items"].schema.shape as Record<string, unknown>),
  ),
);

// ── 2. Build a page ────────────────────────────────────────────────────────
heading("2. Build a starter page");

let doc: PageDocument = createStarterPage({ locationId: "loc_1" });
check("starter has 9 sections", doc.sections.length === 9, String(doc.sections.length));
check("starts with header", doc.sections[0].kind === "header");
check("ends with footer", doc.sections[doc.sections.length - 1].kind === "footer");
check(
  "all section ids are unique",
  new Set(doc.sections.map((s) => s.id)).size === doc.sections.length,
);

// ── 3. Mutations ───────────────────────────────────────────────────────────
heading("3. Mutations");

const added = addSection(doc, "faq", { atIndex: 3 });
check("can add an FAQ section", added.ok);
if (added.ok) doc = added.doc;

const addHeader = addSection(doc, "header");
check(
  "refuses a second header (not addable)",
  !addHeader.ok && addHeader.reason === "not_addable",
  addHeader.ok ? "was allowed" : addHeader.reason,
);

const deleteFooter = removeSection(doc, doc.sections.find((s) => s.kind === "footer")!.id);
check(
  "refuses to delete the footer (locked)",
  !deleteFooter.ok && deleteFooter.reason === "not_deletable",
);

const galleryId = doc.sections.find((s) => s.kind === "gallery")!.id;
const dup = duplicateSection(doc, galleryId);
check("can duplicate a gallery", dup.ok);
if (dup.ok) {
  check(
    "the copy gets a fresh id",
    dup.doc.sections.filter((s) => s.kind === "gallery").length === 2 &&
      new Set(dup.doc.sections.map((s) => s.id)).size === dup.doc.sections.length,
  );
}

const heroId = doc.sections.find((s) => s.kind === "hero")!.id;
const illegalMove = moveSection(doc, heroId, doc.sections.length - 1);
check(
  "refuses to drag the hero past the footer (cross-zone)",
  !illegalMove.ok && illegalMove.reason === "cross_zone_move",
  illegalMove.ok ? "was allowed" : illegalMove.reason,
);

const contentId = doc.sections.find((s) => s.kind === "content")!.id;
const beforeIndex = doc.sections.findIndex((s) => s.id === contentId);
const legalMove = moveSectionBy(doc, contentId, -1);
check("can move a body section up", legalMove.ok);
if (legalMove.ok) {
  check(
    "it actually moved",
    legalMove.doc.sections.findIndex((s) => s.id === contentId) === beforeIndex - 1,
  );
  doc = legalMove.doc;
}

const goodPatch = updateSectionProps(doc, heroId, { heading: "Wood-fired pizza in Brooklyn" });
check("accepts a valid props patch", goodPatch.ok);
if (goodPatch.ok) doc = goodPatch.doc;

const badPatch = updateSectionProps(doc, heroId, { variant: "neon" });
check(
  "rejects an invalid enum value",
  !badPatch.ok && badPatch.reason === "invalid_props",
  badPatch.ok ? "was accepted" : badPatch.reason,
);

// ── 4. Bindings ────────────────────────────────────────────────────────────
heading("4. Bindings");

const popularId = doc.sections.find((s) => s.kind === "popular-items")!.id;
const bound = updateSectionProps(doc, popularId, {
  items: [
    { type: "menu_item", id: "4471" },
    { type: "menu_item", id: "4472" },
    { type: "menu_item", id: "4488" },
  ],
});
check("can bind menu items", bound.ok, bound.ok ? "" : bound.message);
if (bound.ok) doc = bound.doc;

const wrongBinding = updateSectionProps(doc, popularId, {
  items: [{ type: "location", id: "loc_1" }],
});
check(
  "rejects a binding of the wrong type",
  !wrongBinding.ok,
  wrongBinding.ok ? "was accepted" : "",
);

// ── 5. Validation ──────────────────────────────────────────────────────────
heading("5. Validation");

const beforeSeo = validatePage(doc);
check("a complete page has no errors", beforeSeo.ok, JSON.stringify(beforeSeo.errors));
check(
  "warns about the missing SEO title",
  beforeSeo.warnings.some((w) => w.code === "seo_missing_title"),
);

doc = updateSeo(doc, {
  title: "Tony's Pizza — Brooklyn",
  description:
    "Wood-fired Neapolitan pizza in Williamsburg. Order online for pickup or delivery, open until 11pm every night.",
});
const afterSeo = validatePage(doc);
check(
  "SEO warnings clear once title and description are set",
  !afterSeo.warnings.some((w) => w.code.startsWith("seo_missing")),
);

const unresolved = validatePage(doc, { unresolvedBindingIds: ["4472"] });
check(
  "a deleted menu item is a warning, not an error",
  unresolved.ok && unresolved.warnings.some((w) => w.code === "unresolved_binding"),
);

const strippedBody: PageDocument = {
  ...doc,
  sections: doc.sections.filter((s) => SECTION_REGISTRY[s.kind].zone !== "body"),
};
const emptyResult = validatePage(strippedBody);
check(
  "a page with no body sections is an error",
  !emptyResult.ok && emptyResult.errors.some((e) => e.code === "empty_page"),
);

// ── 6. Round trip ──────────────────────────────────────────────────────────
heading("6. Round trip through JSON");

const serialized = JSON.stringify(doc);
const reparsed = normalizePageWithReport(JSON.parse(serialized));
check("no repairs needed on a clean document", reparsed.repairs.length === 0,
  JSON.stringify(reparsed.repairs));
check(
  "round-trips losslessly",
  JSON.stringify(reparsed.doc) === serialized,
  "documents differ after normalize",
);
console.log(`    (document is ${(serialized.length / 1024).toFixed(1)} KB)`);

// ── 7. Deliberate corruption ───────────────────────────────────────────────
heading("7. Survives a corrupted document");

const corrupted = {
  schemaVersion: 1,
  sections: [
    { id: "s_dup", kind: "header", props: { logoAlign: "left", sticky: true, showOrderButton: true, showPhone: false, transparentOverHero: false } },
    { id: "s_dup", kind: "hero", props: { variant: "classic", heading: 42 } }, // dup id + wrong type
    { kind: "content", props: { body: "<p>hi</p>", imagePosition: "none" } },  // missing id
    { kind: "tiktok-feed", props: {} },                                        // kind from the future
    "not an object",                                                           // garbage
    { id: "s_foot", kind: "footer", props: { location: { type: "location", id: "loc_1" }, showAddress: true, showHours: true, showPhone: true, showSocial: true, links: [] } },
  ],
  seo: "not an object",
};

const repaired = normalizePageWithReport(corrupted);
const codes = repaired.repairs.map((r) => r.kind);
check("does not throw", true);
check("drops the unknown kind", codes.includes("unknown_kind"));
check("drops the non-object entry", codes.includes("section_not_an_object"));
check("regenerates the duplicate id", codes.includes("duplicate_id"));
check("generates the missing id", codes.includes("missing_id"));
check("repairs the bad hero heading", codes.includes("invalid_props"));
check("resets the invalid seo blob", codes.includes("invalid_seo"));
check("keeps the 4 salvageable sections", repaired.doc.sections.length === 4,
  String(repaired.doc.sections.length));
check(
  "all ids unique after repair",
  new Set(repaired.doc.sections.map((s) => s.id)).size === repaired.doc.sections.length,
);
check(
  "hero heading fell back to the default rather than being lost",
  (repaired.doc.sections.find((s) => s.kind === "hero")?.props as { heading: string }).heading ===
    "Welcome",
);
check("footer is still last", repaired.doc.sections.at(-1)?.kind === "footer");

// Nonsense input must still produce a renderable page.
for (const nonsense of [null, undefined, 42, "string", [], { sections: "nope" }]) {
  const result = normalizePageWithReport(nonsense);
  if (!Array.isArray(result.doc.sections)) {
    failures += 1;
    console.log(`  ✗ ${JSON.stringify(nonsense)} did not produce a valid document`);
  }
}
check("null / numbers / strings / arrays all yield a valid empty page", true);

// ── Result ─────────────────────────────────────────────────────────────────
console.log(
  failures === 0
    ? "\n✅ site-builder contract smoke test passed\n"
    : `\n❌ ${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
