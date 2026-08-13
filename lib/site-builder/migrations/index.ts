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
 * There are no migrations yet — v1 is the first shape. The plumbing exists now
 * because adding it after merchants have pages is the expensive order.
 */

export type RawDocument = Record<string, unknown>;

/** Migrates a document from version N to version N+1. */
export type DocumentMigration = (doc: RawDocument) => RawDocument;

/**
 * Keyed by the version being migrated *from*. To add a v1 → v2 migration,
 * bump `CURRENT_SCHEMA_VERSION` and add `1: v1ToV2`.
 */
export const MIGRATIONS: Record<number, DocumentMigration> = {};

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
