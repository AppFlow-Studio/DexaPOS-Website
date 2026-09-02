/**
 * Forward migration for stored page documents.
 *
 * JSONB written by v1 of this code will be read by v9 of this code. Three rules,
 * learned from the marketing CMS's `normalizeSection` / `mergeCanonicalSections`:
 *
 *  1. Migrations are pure functions of the raw document, one per version bump,
 *     each with a test fed a real captured document of the older shape.
 *  2. Never rewrite stored JSONB in a SQL migration. Migrate on *read*; a
 *     background job can lazily rewrite storage later if it is worth doing.
 *  3. A migration must never throw. `normalizePage` will repair whatever it
 *     produces, but it cannot repair an exception.
 *
 * v1 → v2 reshapes the `content` section (decision W3). Every other kind is
 * untouched, and a document containing no content sections round-trips
 * unchanged apart from its version number.
 */

export type RawDocument = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rich text → the plain sentence a subtitle can hold.
 *
 * Block-level tags become a space so `<p>One</p><p>Two</p>` reads as "One Two"
 * rather than "OneTwo"; inline tags simply vanish, taking their formatting with
 * them. Entities are decoded for the handful TipTap actually emits — a merchant
 * who wrote "fish & chips" must not end up with "fish &amp; chips" on their
 * live page.
 *
 * **Not a sanitiser and must never be used as one.** It is a one-way
 * downgrade run on trusted stored content; the output goes into a text node,
 * never into `dangerouslySetInnerHTML`.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * v1 → v2: the content section takes Owner's field set.
 *
 * ```
 *   heading        → title
 *   body (HTML)    → subtitle          (tags stripped; `normalizePage` caps it)
 *   image          → mediaImage
 *   imagePosition  → media + alignment
 *   cta            → button
 * ```
 *
 * `imagePosition: "above"` has no equivalent — Owner's media sits beside the
 * copy, never over it — so it collapses to `left`. That is a visible change to
 * a published page, and it is the only one this migration makes: everything
 * else is the same content in a differently named field.
 *
 * **Length is not enforced here.** A 900-character body becomes a
 * 900-character subtitle, and `normalizePage`'s `clampStrings` truncates it to
 * 500 immediately afterwards, recording the repair. Doing it in one place means
 * a merchant who never edits the section and one who does get the same result.
 */
export const v1ToV2: DocumentMigration = (doc) => {
  const sections = doc.sections;
  if (!Array.isArray(sections)) return { ...doc, schemaVersion: 2 };

  return {
    ...doc,
    schemaVersion: 2,
    sections: sections.map((raw) => {
      if (!isRecord(raw) || raw.kind !== "content" || !isRecord(raw.props)) return raw;

      const old = raw.props;
      const position = typeof old.imagePosition === "string" ? old.imagePosition : "none";
      const hasImage = isRecord(old.image);

      const props: Record<string, unknown> = {
        background: "none",
        // Media is only "photo" if there is actually a photo *and* the old
        // document meant to show one. A section with `imagePosition: "none"`
        // and a leftover image was not rendering it, and must not start.
        media: hasImage && position !== "none" ? "photo" : "none",
        alignment: position === "right" ? "right" : "left",
      };

      if (hasImage) props.mediaImage = old.image;
      if (typeof old.heading === "string" && old.heading.trim()) props.title = old.heading;
      if (typeof old.body === "string") {
        const text = htmlToPlainText(old.body);
        if (text) props.subtitle = text;
      }
      if (isRecord(old.cta)) props.button = old.cta;

      return { ...raw, props };
    }),
  };
};

/** Migrates a document from version N to version N+1. */
export type DocumentMigration = (doc: RawDocument) => RawDocument;

/**
 * Keyed by the version being migrated *from*. To add a v2 → v3 migration,
 * bump `CURRENT_SCHEMA_VERSION` and add `2: v2ToV3`.
 */
export const MIGRATIONS: Record<number, DocumentMigration> = {
  1: v1ToV2,
};

export interface MigrationResult {
  doc: RawDocument;
  /** Versions migrated through, in order. Empty when the document was current. */
  applied: number[];
}

export function runMigrations(
  doc: RawDocument,
  fromVersion: number,
  toVersion: number,
): MigrationResult {
  const applied: number[] = [];
  let current = doc;
  let version = fromVersion;

  // Guard against a document written by a *newer* build than this one, and
  // against a corrupt version number sending us into a long loop.
  while (version < toVersion) {
    const migrate = MIGRATIONS[version];
    if (!migrate) break;
    try {
      current = migrate(current);
      applied.push(version);
    } catch {
      // A failed migration leaves the document at its current version.
      // `normalizePage` repairs what it can; the section-level fallback means
      // the merchant sees a degraded page rather than a 500.
      break;
    }
    version += 1;
  }

  return { doc: current, applied };
}
