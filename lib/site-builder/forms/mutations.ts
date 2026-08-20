/**
 * Pure form-document mutations — `(doc, args) => doc`.
 *
 * The same contract as `lib/site-builder/mutations.ts`: React-free, I/O-free,
 * every function returns a new document, and the rules live here rather than in
 * the editor so the server can enforce what the UI offers.
 */

import {
  FIELD_REGISTRY,
  createField,
  type FormField,
  type FormFieldKind,
} from "./fields";
import { MAX_FIELDS, type FormDocument } from "./document";

export type FormMutationResult =
  | { ok: true; doc: FormDocument }
  | { ok: false; reason: FormMutationRefusal; message: string };

export type FormMutationRefusal =
  | "unknown_field"
  | "singleton_exists"
  | "limit_reached"
  | "out_of_range"
  | "invalid_props";

const refuse = (reason: FormMutationRefusal, message: string): FormMutationResult => ({
  ok: false,
  reason,
  message,
});

function withFields(doc: FormDocument, fields: FormField[]): FormDocument {
  return { ...doc, fields };
}

export function addField(
  doc: FormDocument,
  kind: FormFieldKind,
  options: { atIndex?: number } = {},
): FormMutationResult {
  const def = FIELD_REGISTRY[kind];
  if (!def) return refuse("unknown_field", `Unknown field type "${kind}".`);

  if (doc.fields.length >= MAX_FIELDS) {
    return refuse(
      "limit_reached",
      `A form can have ${MAX_FIELDS} fields. Longer than that and people stop filling it in.`,
    );
  }

  if (def.singleton && doc.fields.some((field) => field.kind === kind)) {
    return refuse(
      "singleton_exists",
      // Naming the alternative matters: the merchant has a real need and the
      // rule looks arbitrary without it.
      `This form already asks for a ${def.label.toLowerCase()}. Use a Text Field if you need to ask for a second one.`,
    );
  }

  const fields = [...doc.fields];
  const index =
    options.atIndex === undefined
      ? fields.length
      : Math.max(0, Math.min(options.atIndex, fields.length));
  fields.splice(index, 0, createField(kind));

  return { ok: true, doc: withFields(doc, fields) };
}

export function removeField(doc: FormDocument, fieldId: string): FormMutationResult {
  if (!doc.fields.some((field) => field.id === fieldId)) {
    return refuse("unknown_field", "That field is no longer on the form.");
  }
  return { ok: true, doc: withFields(doc, doc.fields.filter((field) => field.id !== fieldId)) };
}

/**
 * Moves a field by one position.
 *
 * There are no zones here — unlike a page, every part of a form is equally
 * movable, because the order of questions is entirely the merchant's business.
 */
export function moveFieldBy(
  doc: FormDocument,
  fieldId: string,
  delta: number,
): FormMutationResult {
  const from = doc.fields.findIndex((field) => field.id === fieldId);
  if (from === -1) return refuse("unknown_field", "That field is no longer on the form.");

  const to = from + delta;
  if (to < 0 || to >= doc.fields.length) {
    return refuse("out_of_range", "That field is already at the end.");
  }

  const fields = [...doc.fields];
  const [moved] = fields.splice(from, 1);
  fields.splice(to, 0, moved);

  return { ok: true, doc: withFields(doc, fields) };
}

export function updateFieldProps(
  doc: FormDocument,
  fieldId: string,
  patch: Record<string, unknown>,
): FormMutationResult {
  const field = doc.fields.find((f) => f.id === fieldId);
  if (!field) return refuse("unknown_field", "That field is no longer on the form.");

  const next = { ...(field.props as Record<string, unknown>), ...patch };
  const parsed = FIELD_REGISTRY[field.kind].schema.safeParse(next);
  if (!parsed.success) {
    return refuse("invalid_props", parsed.error.issues[0]?.message ?? "That value cannot be used.");
  }

  return {
    ok: true,
    doc: withFields(
      doc,
      doc.fields.map((f) =>
        f.id === fieldId ? ({ ...f, props: parsed.data } as FormField) : f,
      ),
    ),
  };
}

/** The form's own title, intro, confirmation and settings. */
export function updateFormMeta(
  doc: FormDocument,
  patch: Partial<Pick<FormDocument, "title" | "intro" | "confirmation" | "settings">>,
): FormDocument {
  return {
    ...doc,
    ...patch,
    confirmation: { ...doc.confirmation, ...(patch.confirmation ?? {}) },
    settings: { ...doc.settings, ...(patch.settings ?? {}) },
  };
}
