/**
 * A form, as data.
 *
 * One atomic jsonb document per form, exactly like `PageDocument` — the draft
 * lives in `site_forms.draft_definition` and publishing copies it into
 * `published_definition`.
 *
 * **Forms are brand-level objects, not page content.** A form is authored once
 * and embedded into any number of pages through the `form` section, which
 * stores only a `formId`. One form, many pages, one inbox. Modelling a form as
 * a section's internal state would mean a merchant maintaining four copies of
 * their contact form and four separate piles of leads.
 *
 * **No version history, deliberately** — and this is the one place the form
 * document departs from the page document. A page keeps immutable published
 * versions so it can be rolled back and diffed. A form's meaningful history is
 * its *submissions*, and versioning the definition would make an old submission
 * ambiguous: which version's field #3 does this answer belong to? That is
 * solved instead by every submission storing its own label snapshot, so a
 * two-year-old lead still renders correctly after the form has been rewritten.
 */

import { z } from "zod";

import {
  FIELD_REGISTRY,
  createField,
  isFormFieldKind,
  type FormField,
  type FormFieldKind,
} from "./fields";

/** Bumped when a stored form's shape changes in a way older code misreads. */
export const CURRENT_FORM_VERSION = 1;

export const MAX_FIELDS = 40;

export interface FormDocument {
  schemaVersion: number;
  /**
   * The form's own title and intro.
   *
   * The first, header-like block in the builder with edit-only controls —
   * mirroring how a page's header and hero are edit-only. Every form has one;
   * it cannot be deleted or moved, because a form with no heading is a stack of
   * unexplained inputs.
   */
  title: string;
  intro?: string;
  fields: FormField[];
  /** What the visitor sees once it has gone through. */
  confirmation: {
    message: string;
  };
  settings: {
    submitLabel: string;
    /**
     * Where a notification goes when someone submits.
     *
     * Empty means nobody is told, and the submission sits in the inbox until
     * the merchant happens to look — which is how a restaurant misses a
     * catering enquiry worth more than a week of covers. The forms screen says
     * so rather than letting it be discovered.
     */
    notifyEmails: string[];
  };
}

export const MAX_NOTIFY_EMAILS = 5;

const emailish = z
  .string()
  .trim()
  .max(254)
  .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "That is not an email address" });

export const formDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(100),
  intro: z.string().trim().max(500).optional(),
  fields: z.array(z.object({ id: z.string().min(1), kind: z.string(), props: z.unknown() })).max(MAX_FIELDS),
  confirmation: z.object({ message: z.string().trim().min(1).max(500) }),
  settings: z.object({
    submitLabel: z.string().trim().min(1).max(40),
    notifyEmails: z.array(emailish).max(MAX_NOTIFY_EMAILS),
  }),
});

/**
 * A new form: a name, an intro, and the three fields every restaurant enquiry
 * form has anyway.
 *
 * Not an empty document. A merchant who creates a form and is shown nothing has
 * to guess what a form is made of; one that opens with Name, Email and a
 * message is immediately recognisable and immediately editable, and it is the
 * shape they were going to build regardless.
 */
export function createStarterForm(title = "Contact us"): FormDocument {
  return {
    schemaVersion: CURRENT_FORM_VERSION,
    title,
    intro: "Please complete the form below and we'll get back to you as soon as we can.",
    fields: [createField("name"), createField("email"), createField("text")],
    confirmation: { message: "Thanks — we've got your message and we'll be in touch soon." },
    settings: { submitLabel: "Send", notifyEmails: [] },
  };
}

export function createEmptyForm(title: string): FormDocument {
  return {
    schemaVersion: CURRENT_FORM_VERSION,
    title,
    fields: [],
    confirmation: { message: "Thanks — we've got your message." },
    settings: { submitLabel: "Send", notifyEmails: [] },
  };
}

/**
 * Repairs a stored form document into something renderable.
 *
 * The same repair-don't-reject contract as `normalizePage`: this runs on read,
 * on every render of a public form, and on a document written by whatever build
 * was deployed when the merchant last saved. A form that fails to parse must
 * degrade to a smaller working form, never to an exception on a live page.
 *
 * A field whose kind this build does not know, or whose props do not parse
 * against its schema, is **dropped rather than defaulted**. That is the
 * opposite of what `normalizePage` does for sections, and the difference
 * matters: a section falling back to placeholder copy is cosmetic, whereas a
 * form field falling back to defaults would silently change what a visitor is
 * asked — and a required field appearing out of nowhere, or a choice list
 * reverting to "First option", produces answers the merchant cannot interpret.
 */
export function normalizeForm(raw: unknown): FormDocument {
  const fallback = createEmptyForm("Untitled form");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;

  const source = raw as Record<string, unknown>;

  const title = str(source.title, 100) || fallback.title;
  const intro = str(source.intro, 500);

  const rawFields = Array.isArray(source.fields) ? source.fields : [];
  const seenIds = new Set<string>();
  const seenSingletons = new Set<FormFieldKind>();
  const fields: FormField[] = [];

  for (const entry of rawFields.slice(0, MAX_FIELDS)) {
    if (!entry || typeof entry !== "object") continue;
    const field = entry as Record<string, unknown>;

    const kind = field.kind;
    if (!isFormFieldKind(kind)) continue;

    const id = typeof field.id === "string" ? field.id.trim() : "";
    // A duplicate id would make two questions share one answer slot, so the
    // later one is dropped rather than silently overwriting.
    if (!id || seenIds.has(id)) continue;

    const def = FIELD_REGISTRY[kind];
    if (def.singleton && seenSingletons.has(kind)) continue;

    const parsed = def.schema.safeParse(field.props);
    if (!parsed.success) continue;

    seenIds.add(id);
    if (def.singleton) seenSingletons.add(kind);
    fields.push({ id, kind, props: parsed.data } as FormField);
  }

  const confirmation = source.confirmation as Record<string, unknown> | undefined;
  const settings = source.settings as Record<string, unknown> | undefined;

  const notifyEmails = Array.isArray(settings?.notifyEmails)
    ? settings.notifyEmails
        .flatMap((value) => (emailish.safeParse(value).success ? [String(value).trim()] : []))
        .slice(0, MAX_NOTIFY_EMAILS)
    : [];

  return {
    schemaVersion: CURRENT_FORM_VERSION,
    title,
    ...(intro ? { intro } : {}),
    fields,
    confirmation: {
      message: str(confirmation?.message, 500) || fallback.confirmation.message,
    },
    settings: {
      submitLabel: str(settings?.submitLabel, 40) || "Send",
      notifyEmails,
    },
  };
}

/** Fields that actually collect something, in order. */
export function answerFields(doc: FormDocument): FormField[] {
  return doc.fields.filter((field) => FIELD_REGISTRY[field.kind].role === "answer");
}

/**
 * Whether this form can be published.
 *
 * One rule, and it is worth having: a form with no answer fields is a page a
 * visitor can press a button on to send nothing. Everything else about a form
 * is the merchant's business.
 */
export function validateForm(doc: FormDocument): { ok: true } | { ok: false; message: string } {
  if (answerFields(doc).length === 0) {
    return {
      ok: false,
      message: "Add at least one question before publishing — a form with only headings collects nothing.",
    };
  }
  return { ok: true };
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}
