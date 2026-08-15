/**
 * Derives editor form controls from the section schemas.
 *
 * This is the payoff of the registry design: add a field to a Zod schema and a
 * control appears in the settings panel. No per-section form to write, no
 * parallel field list to keep in step — which is exactly how the two drift.
 *
 * It reads Zod's internal `def`, which is not a stable public API. That is made
 * safe by `schema-introspect.test.ts`, which asserts the classification of every
 * field of all nine schemas — so a Zod upgrade that changes the shape breaks
 * loudly in CI rather than silently rendering the wrong control.
 */

import type { z } from "zod";

export type ControlKind =
  | "text"
  | "richtext"
  | "boolean"
  | "number"
  | "select"
  | "image"
  | "binding-list"
  | "repeater"
  | "link"
  | "unsupported";

export interface FieldControl {
  /** Key within the section's props. */
  name: string;
  label: string;
  kind: ControlKind;
  optional: boolean;
  /** Options for `select`. */
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  /** Max array length for `repeater` / `binding-list`. */
  maxItems?: number;
  /** Sub-controls for `repeater` entries. */
  fields?: FieldControl[];
}

/** Fields long enough to want a textarea rather than a single-line input. */
const MULTILINE_FIELDS = new Set(["subheading", "description", "tagline", "answer", "question"]);
const RICHTEXT_FIELDS = new Set(["body", "answer"]);

interface ZodDef {
  type?: string;
  innerType?: unknown;
  entries?: Record<string, string>;
  element?: unknown;
  shape?: Record<string, unknown>;
  checks?: unknown[];
  options?: unknown[];
}

function defOf(schema: unknown): ZodDef | undefined {
  if (!schema || typeof schema !== "object") return undefined;
  const s = schema as { def?: ZodDef; _def?: ZodDef };
  return s.def ?? s._def;
}

/** Unwraps optional/nullable/default wrappers to the schema that carries meaning. */
function unwrap(schema: unknown): { inner: unknown; optional: boolean } {
  let current = schema;
  let optional = false;

  for (let depth = 0; depth < 8; depth += 1) {
    const def = defOf(current);
    if (!def) break;
    if (def.type === "optional" || def.type === "nullable" || def.type === "default") {
      optional = true;
      current = def.innerType;
      continue;
    }
    break;
  }

  return { inner: current, optional };
}

export function describeSchema(schema: z.ZodObject<any>): FieldControl[] {
  const shape = schema.shape as Record<string, unknown>;
  return Object.entries(shape).map(([name, field]) => describeField(name, field));
}

export function describeField(name: string, field: unknown): FieldControl {
  const { inner, optional } = unwrap(field);
  const def = defOf(inner);
  const base = { name, label: humanize(name), optional };

  switch (def?.type) {
    case "string":
      return {
        ...base,
        kind: RICHTEXT_FIELDS.has(name) ? "richtext" : "text",
        // Surfaced so the control can render a textarea rather than an input.
        max: MULTILINE_FIELDS.has(name) ? Number.MAX_SAFE_INTEGER : undefined,
      };

    case "boolean":
      return { ...base, kind: "boolean" };

    case "number":
      return { ...base, kind: "number", min: 0, max: 100 };

    case "enum":
      return {
        ...base,
        kind: "select",
        options: Object.keys(def.entries ?? {}).map((value) => ({
          value,
          label: humanize(value),
        })),
      };

    // `z.union([z.literal(2), z.literal(3)])` — the column-count fields.
    case "union": {
      const literals = (def.options ?? [])
        .map((option) => {
          const optionDef = defOf(option) as (ZodDef & { values?: unknown[] }) | undefined;
          const value = optionDef?.values?.[0];
          return value === undefined ? null : String(value);
        })
        .filter((v): v is string => v !== null);

      return literals.length > 0
        ? { ...base, kind: "select", options: literals.map((value) => ({ value, label: value })) }
        : { ...base, kind: "unsupported" };
    }

    case "array": {
      const elementDef = defOf(def.element);
      const elementShape = (def.element as { shape?: Record<string, unknown> } | undefined)?.shape;

      // A binding array — `{ type: "menu_item", id }` — needs a record picker,
      // not a generic repeater.
      if (elementShape && "type" in elementShape && "id" in elementShape) {
        return { ...base, kind: "binding-list", maxItems: maxOf(def) };
      }
      // An asset array — the gallery.
      if (elementShape && "assetId" in elementShape) {
        return { ...base, kind: "image", maxItems: maxOf(def) };
      }
      if (elementDef?.type === "object" && elementShape) {
        return {
          ...base,
          kind: "repeater",
          maxItems: maxOf(def),
          fields: Object.entries(elementShape).map(([k, v]) => describeField(k, v)),
        };
      }
      return { ...base, kind: "unsupported" };
    }

    case "object": {
      const shape = (inner as { shape?: Record<string, unknown> }).shape ?? {};
      if ("assetId" in shape) return { ...base, kind: "image" };
      // A CTA — `{ label, target }` — or a bare binding.
      if ("label" in shape && "target" in shape) return { ...base, kind: "link" };
      if ("type" in shape && "id" in shape) return { ...base, kind: "binding-list", maxItems: 1 };
      return { ...base, kind: "unsupported" };
    }

    default:
      return { ...base, kind: "unsupported" };
  }
}

function maxOf(def: ZodDef): number | undefined {
  for (const check of def.checks ?? []) {
    const checkDef = defOf(check) as ({ maximum?: number } & ZodDef) | undefined;
    const maximum =
      (check as { _zod?: { def?: { maximum?: number } } })?._zod?.def?.maximum ??
      checkDef?.maximum;
    if (typeof maximum === "number") return maximum;
  }
  return undefined;
}

/**
 * `showOrderButton` → "Show order button".
 *
 * Sentence case, not title case: these are form labels sitting next to each
 * other in a panel, and Title Case On Every Label reads as shouting.
 */
export function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}
