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

import { isBindingType, type BindingType } from "./bindings/types";

export type ControlKind =
  | "text"
  | "richtext"
  | "boolean"
  | "number"
  | "rating"
  | "select"
  | "image"
  | "file"
  | "binding-list"
  | "form"
  | "event"
  | "video"
  | "embed"
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
  /**
   * Explanatory copy under the control, and the input's placeholder.
   *
   * Neither can be derived from a field name, and for the integrations embed
   * neither is even constant for the field: the right words depend on which
   * provider is selected. Both therefore arrive from the registry's
   * `fieldOverrides`, which is the one hook that gets to see sibling props.
   */
  help?: string;
  placeholder?: string;
  /**
   * Sibling fields this control's value invalidates, cleared in the same patch.
   *
   * `integrations.provider` clears `embedUrl`: a Spotify link under the Google
   * Maps provider is not a state the schema permits, so without this the panel
   * simply stops accepting edits the moment the provider is switched.
   */
  clears?: string[];
  min?: number;
  /**
   * The real limit, read off the Zod `.max()` check.
   *
   * It used to be `MAX_SAFE_INTEGER` for a hardcoded list of field names and
   * `undefined` for everything else — a flag meaning "render a textarea"
   * wearing a number's clothes. The consequence was that the character counter
   * in the drawer, which asks for a *real* limit, never had one: it was written,
   * shipped and silently inert on every field of every section. `multiline` now
   * carries the layout decision and this carries the cap.
   */
  max?: number;
  /** Render a textarea rather than a single-line input. */
  multiline?: boolean;
  /** Max array length for `repeater` / `binding-list`. */
  maxItems?: number;
  /** Sub-controls for `repeater` entries. */
  fields?: FieldControl[];
  /**
   * Which record kind a `binding-list` points at, read from the `z.literal` in
   * the binding schema.
   *
   * The editor needs it to choose a picker: menu items get a searchable browser
   * of real dishes, a location gets a read-only card. Without it the panel would
   * have to switch on field name, which is exactly the parallel list the
   * registry design exists to avoid.
   */
  bindingType?: BindingType;
}

/** Fields long enough to want a textarea rather than a single-line input. */
const MULTILINE_FIELDS = new Set([
  // A heading is capped at 150 characters and routinely runs to a full
  // sentence; in an `<input>` the merchant edited it through a 30-character
  // window and could not see what they had written.
  "heading",
  "subheading",
  "subtitle",
  "description",
  "tagline",
  "answer",
  "question",
]);
const RICHTEXT_FIELDS = new Set(["body", "answer"]);

/**
 * Asset fields holding a document rather than a photograph.
 *
 * `pdf.file` and `hero.image` are the same `AssetRef` shape, so nothing
 * structural tells them apart — and until this existed the PDF section was
 * handed a photo picker, which meant it could never be filled in at all.
 *
 * A name list for the same reason `formId` and `videoId` are: the alternative
 * is a parallel Zod type whose only job is to be a different Zod type, and the
 * section schemas are meant to stay plain data.
 */
const DOCUMENT_FIELDS = new Set(["file"]);

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

/**
 * The `.max()` on a string schema, or `undefined` when it has none.
 *
 * Zod 4 stores checks as objects carrying `_zod.def = { check, maximum }`. That
 * is internal, which is exactly why `schema-introspect.test.ts` asserts the
 * caps it produces for every schema: a Zod upgrade that moves this breaks CI
 * rather than silently removing every character counter in the editor.
 */
function maxLengthOf(def: ZodDef | undefined): number | undefined {
  for (const check of def?.checks ?? []) {
    const inner = (check as { _zod?: { def?: { check?: string; maximum?: number } } })?._zod?.def;
    if (inner?.check === "max_length" && typeof inner.maximum === "number") {
      return inner.maximum;
    }
  }
  return undefined;
}

/** Reads inclusive `.min()` / `.max()` bounds from a Zod number schema. */
function numberBoundsOf(def: ZodDef | undefined): { min?: number; max?: number } {
  let min: number | undefined;
  let max: number | undefined;

  for (const check of def?.checks ?? []) {
    const inner = (check as {
      _zod?: { def?: { check?: string; value?: number; inclusive?: boolean } };
    })?._zod?.def;
    if (typeof inner?.value !== "number" || inner.inclusive === false) continue;
    if (inner.check === "greater_than") min = inner.value;
    if (inner.check === "less_than") max = inner.value;
  }

  return { min, max };
}

/**
 * The character cap on one schema field, or `undefined` if it is not a capped
 * string. Unwraps `.optional()` on the way in.
 *
 * Exported for `normalize`, which needs the caps to *truncate* stored copy that
 * predates a tightened limit. Both callers therefore read the same source, so a
 * cap can never be enforced in one place and unknown in the other.
 */
export function stringMaxOf(field: unknown): number | undefined {
  const { inner } = unwrap(field);
  const def = defOf(inner);
  if (def?.type !== "string") return undefined;
  return maxLengthOf(def);
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
    case "string": {
      // `formId` is a string in the schema because that is what it is, but a
      // text box asking a merchant to type a uuid is not a control. Named here
      // rather than given its own Zod type so the section schema stays plain
      // data — the same reasoning as `RICHTEXT_FIELDS` and `MULTILINE_FIELDS`
      // directly below.
      if (name === "formId") return { ...base, kind: "form" };
      // Same reasoning as `formId`: the schema holds an id because an id is
      // what it is, but the control has to be a list of the merchant's own
      // events. Optional here, unlike `formId` — blank means "whichever event
      // is next", which is the default and the better answer for most
      // placements. See `featuredEventSchema`.
      if (name === "eventId") return { ...base, kind: "event" };
      if (name === "videoId") return { ...base, kind: "video" };
      // Same family again. The stored value is a URL, but the control is a
      // paste target that accepts iframe markup and bare ids too, normalises
      // whatever arrives, and shows the resolved ids back — none of which a
      // plain text box does. See `resolveIntegrationEmbed`.
      if (name === "embedUrl") return { ...base, kind: "embed" };

      const max = maxLengthOf(def);
      return {
        ...base,
        kind: RICHTEXT_FIELDS.has(name) ? "richtext" : "text",
        ...(max === undefined ? {} : { max }),
        // A textarea is a layout decision about the *shape* of the copy, so it
        // stays a field-name list. It is no longer entangled with the cap.
        multiline: MULTILINE_FIELDS.has(name),
      };
    }

    case "boolean":
      return { ...base, kind: "boolean" };

    case "number":
      return {
        ...base,
        kind: name === "rating" ? "rating" : "number",
        ...numberBoundsOf(def),
      };

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
        return {
          ...base,
          kind: "binding-list",
          maxItems: maxOf(def),
          bindingType: literalBindingType(elementShape.type),
        };
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
      if ("assetId" in shape) {
        return { ...base, kind: DOCUMENT_FIELDS.has(name) ? "file" : "image" };
      }
      // A CTA — `{ label, target }` — or a bare binding.
      if ("label" in shape && "target" in shape) return { ...base, kind: "link" };
      if ("type" in shape && "id" in shape) {
        return {
          ...base,
          kind: "binding-list",
          maxItems: 1,
          bindingType: literalBindingType(shape.type),
        };
      }
      return { ...base, kind: "unsupported" };
    }

    default:
      return { ...base, kind: "unsupported" };
  }
}

/**
 * Reads `z.literal("menu_item")` back out of a binding schema's `type` field.
 *
 * Returns undefined rather than guessing when the shape is not a literal — a
 * picker that opened on the wrong record kind would be worse than one that
 * declines to open.
 */
function literalBindingType(schema: unknown): BindingType | undefined {
  const def = defOf(schema) as (ZodDef & { values?: unknown[] }) | undefined;
  if (def?.type !== "literal") return undefined;

  const value = def.values?.[0];
  return typeof value === "string" && isBindingType(value) ? value : undefined;
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
