/**
 * Turning what a stranger posted into what gets stored.
 *
 * This is the security boundary of the whole Forms feature, and everything
 * about it is written on the assumption that the request is hostile.
 *
 * The rule it enforces, which is the one that matters: **the form definition is
 * the allowlist.** Answers are matched against the authoritative published
 * definition loaded server-side, keyed by field id. A key that is not a field on
 * that form is discarded — not stored under a different name, not kept "just in
 * case". Without that, a form is an open jsonb write endpoint with a text box in
 * front of it, and the first person to notice can fill a merchant's inbox with
 * whatever they like.
 *
 * Pure and I/O-free so it can be exhaustively tested without a database, which
 * for this file is the point.
 */

import { sanitizeText } from "@/lib/cms/sanitize";

import { answerFields, type FormDocument } from "./document";
import {
  ANSWER_MAX,
  FIELD_REGISTRY,
  OPTION_MAX,
  SHORT_ANSWER_MAX,
  fieldLabel,
  type FormField,
  type FormFieldSemantic,
} from "./fields";

/** One stored answer. The label is snapshotted — see `SubmissionRecord`. */
export interface SubmissionAnswer {
  fieldId: string;
  /** The question as it was worded *when this was answered*. */
  label: string;
  kind: string;
  /** Always a string for display; multiple choice joins with ", ". */
  value: string;
  /** Kept separately so a future export can round-trip the individual choices. */
  values?: string[];
}

export interface SubmissionRecord {
  answers: SubmissionAnswer[];
  /**
   * The semantic columns the inbox shows without having to understand the form.
   *
   * Filled from whichever field carries the matching `semantic`, so a merchant
   * can label their email field "Where can we reach you?" and it still lands in
   * the Email column.
   */
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
}

export type SubmissionResult =
  | { ok: true; record: SubmissionRecord }
  | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Deliberately loose: phone formats vary by country and a strict rule loses real leads. */
const PHONE_RE = /^[+()\d][\d\s()+.-]{5,24}$/;

/**
 * Validates a raw posted body against the authoritative form definition.
 *
 * `raw` is whatever arrived over the wire. Nothing about its shape is trusted:
 * keys are looked up *from the definition*, never iterated from the body, which
 * is what makes an unknown key structurally impossible to store rather than
 * merely filtered out.
 */
export function buildSubmission(doc: FormDocument, raw: unknown): SubmissionResult {
  const body: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const errors: Record<string, string> = {};
  const answers: SubmissionAnswer[] = [];
  const contact: SubmissionRecord["contact"] = {
    name: null,
    email: null,
    phone: null,
    address: null,
  };

  // Iterating the DEFINITION, not the body. This is the allowlist.
  for (const field of answerFields(doc)) {
    const answer = readAnswer(field, body[field.id], errors);
    if (answer === null) continue;

    answers.push(answer);

    const semantic = FIELD_REGISTRY[field.kind].semantic;
    if (semantic && answer.value) contact[semantic] = answer.value;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, record: { answers, contact } };
}

/**
 * One field's answer, or `null` when there is nothing to store.
 *
 * A blank optional field stores nothing rather than an empty string: "they left
 * it blank" and "they typed nothing into a box that was never there" should not
 * look identical in an export two years later.
 */
function readAnswer(
  field: FormField,
  raw: unknown,
  errors: Record<string, string>,
): SubmissionAnswer | null {
  const label = fieldLabel(field);
  const props = field.props as { required?: boolean; options?: string[]; mode?: string };
  const required = props.required === true;

  const base = { fieldId: field.id, label, kind: field.kind };

  if (field.kind === "multiple-choice") {
    const allowed = new Set(props.options ?? []);
    // Only values the merchant actually offered. A posted option that is not on
    // the list is discarded rather than rejected — the visitor cannot have
    // produced it through the form, so there is no message worth showing them.
    const chosen = (Array.isArray(raw) ? raw : [])
      .flatMap((v) => (typeof v === "string" ? [v.trim()] : []))
      .filter((v) => allowed.has(v))
      .slice(0, allowed.size);

    if (chosen.length === 0) {
      if (required) errors[field.id] = `${label} is required`;
      return null;
    }
    return { ...base, value: chosen.join(", "), values: chosen };
  }

  const value = typeof raw === "string" ? raw.trim() : "";

  if (value === "") {
    if (required) errors[field.id] = `${label} is required`;
    return null;
  }

  switch (field.kind) {
    case "single-choice": {
      if (!(props.options ?? []).includes(value)) {
        errors[field.id] = `${label} is not one of the options`;
        return null;
      }
      return { ...base, value: clean(value, OPTION_MAX) };
    }

    case "email": {
      if (value.length > 254 || !EMAIL_RE.test(value)) {
        errors[field.id] = `${label} does not look like an email address`;
        return null;
      }
      return { ...base, value: clean(value, 254) };
    }

    case "phone": {
      if (!PHONE_RE.test(value)) {
        errors[field.id] = `${label} does not look like a phone number`;
        return null;
      }
      return { ...base, value: clean(value, 40) };
    }

    case "datetime": {
      // Stored as the ISO string the browser's own date input produces, after
      // proving it parses. Anything else is a hand-crafted request.
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        errors[field.id] = `${label} is not a valid date`;
        return null;
      }
      return { ...base, value: clean(value, 40) };
    }

    case "name":
    case "address":
      return { ...base, value: clean(value, SHORT_ANSWER_MAX) };

    case "text":
    default:
      return { ...base, value: clean(value, ANSWER_MAX) };
  }
}

/**
 * Truncate, then strip markup.
 *
 * `sanitizeText` is the same helper every other public form endpoint in this
 * codebase uses. It runs even though these values are rendered as React text
 * (and therefore escaped) — because they are also exported to CSV and emailed
 * as notifications, and neither of those has React's escaping in front of it.
 */
function clean(value: string, max: number): string {
  return sanitizeText(value.slice(0, max));
}

/**
 * The upper bound on a whole posted body, before any of it is parsed.
 *
 * A cap on each field is not a cap on the request: forty fields at two thousand
 * characters is eighty kilobytes of legitimate form, and nothing stops someone
 * posting eighty megabytes. Checked by the caller against the raw payload.
 */
export const MAX_SUBMISSION_BYTES = 128 * 1024;

/** Columns the inbox shows, derived from the form's own fields. */
export function submissionColumns(doc: FormDocument): { key: FormFieldSemantic; label: string }[] {
  const columns: { key: FormFieldSemantic; label: string }[] = [];

  for (const field of answerFields(doc)) {
    const semantic = FIELD_REGISTRY[field.kind].semantic;
    if (!semantic || columns.some((c) => c.key === semantic)) continue;
    // The merchant's own wording, not ours: they labelled it, they recognise it.
    columns.push({ key: semantic, label: fieldLabel(field) });
  }

  return columns;
}
