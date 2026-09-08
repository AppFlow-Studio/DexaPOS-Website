/**
 * The `Section` discriminated union.
 *
 * The MockBuilder spec's `BuilderSection` is a fat record: every section object
 * carries all 14 settings blobs regardless of its kind, so an FAQ hauls an
 * unused hero config and an empty events array (ANALYSIS finding F1). Porting
 * that into Postgres would bake the bloat in permanently and make version
 * diffing meaningless, because every row would touch every field.
 *
 * A discriminated union costs a day now and cannot be retrofitted once
 * merchants have pages.
 */

import type { SectionKind } from "./kinds";
import type { SectionStyle } from "./primitives";
import type { SectionPropsMap } from "./schemas";

export interface SectionBase {
  /**
   * Stable for the life of the section, across edits and versions, and never
   * reused. Analytics-per-section, comments, and A/B variants all hang off this
   * (VISION-UNBOUNDED §9) — which is why it must never be regenerated on save.
   */
  id: string;
  /** Stored but not rendered. Lets a merchant hide without losing their work. */
  hidden?: boolean;
  style?: SectionStyle;
}

/**
 * Distributive on purpose. A naive
 * `SectionBase & { kind: K; props: SectionPropsMap[K] }` collapses when `K` is
 * the whole union into "any kind paired with any kind's props" — which would
 * type-check a footer carrying header props and quietly defeat the reason for
 * having a discriminated union at all. Distributing keeps each kind welded to
 * its own props, so `SectionOf<SectionKind>` *is* `Section`.
 */
export type SectionOf<K extends SectionKind> = K extends SectionKind
  ? SectionBase & { kind: K; props: SectionPropsMap[K] }
  : never;

export type Section = SectionOf<SectionKind>;

export type { SectionStyle };
