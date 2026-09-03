/**
 * The ten form field kinds, and the registry that drives everything about them.
 *
 * Structurally the same idea as `sections/registry.ts`, and deliberately so:
 * one entry per kind drives the Add Field catalogue, the generated editor
 * panel, save-time validation, the public renderer, and submission validation.
 * Adding an eleventh kind is one entry here.
 *
 * **Semantic types, not primitives.** `Name`, `Email`, `Phone Number` and
 * `Address` are distinct kinds rather than a text field with a validation
 * dropdown. That single decision is what makes the submissions inbox able to
 * show real Name / Email / Phone columns, and it is the difference between a
 * form builder whose output is a blob of key-value pairs and one whose output
 * is structured enough to feed `customers` later. It is the thing most worth
 * copying from the Owner teardown.
 *
 * **Layout kinds live in the same catalogue.** `Heading` and `Paragraph` take
 * no input at all. A form that cannot explain itself between its questions is a
 * form people abandon, and pushing that copy into a separate concept would mean
 * a merchant learning two things instead of one.
 *
 * Pure, React-free and I/O-free — imported by the builder, the public renderer,
 * the submission validator and the tests alike.
 */

import { z } from "zod";

export const FORM_FIELD_KINDS = [
  "name",
  "text",
  "email",
  "phone",
  "address",
  "single-choice",
  "multiple-choice",
  "datetime",
  "heading",
  "paragraph",
] as const;

export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

/**
 * What a kind contributes to a submission.
 *
 *  - `answer` — the visitor types or picks something; it is stored.
 *  - `layout` — it renders and collects nothing.
 *
 * Checked rather than inferred from the presence of a value, because "the
 * visitor left it blank" and "this block never had an answer" are different
 * facts and the inbox must not conflate them.
 */
export type FormFieldRole = "answer" | "layout";

/**
 * Which real-world fact this kind captures, for the kinds that capture one.
 *
 * This is the payoff of semantic types. A submission's `contact_email` column
 * is filled from whichever field has `semantic: "email"`, so the inbox has a
 * real column without the merchant naming their field anything in particular —
 * they can label it "Where can we reach you?" and it still lands in the right
 * place.
 */
export type FormFieldSemantic = "name" | "email" | "phone" | "address";

export const LABEL_MAX = 100;
export const HELP_MAX = 300;
export const OPTION_MAX = 80;
export const MAX_OPTIONS = 20;
/** What a single free-text answer may be. Generous, but not a place to paste a novel. */
export const ANSWER_MAX = 2000;
export const SHORT_ANSWER_MAX = 200;

const labelSchema = z.string().trim().min(1).max(LABEL_MAX);
const helpSchema = z.string().trim().max(HELP_MAX).optional();

/** Every input kind carries these; layout kinds carry only what they need. */
const inputProps = {
  label: labelSchema,
  help: helpSchema,
  required: z.boolean(),
  placeholder: z.string().trim().max(LABEL_MAX).optional(),
};

const choiceProps = {
  label: labelSchema,
  help: helpSchema,
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(OPTION_MAX)).min(1).max(MAX_OPTIONS),
};

export const FIELD_SCHEMAS = {
  name: z.object(inputProps),
  text: z.object({ ...inputProps, multiline: z.boolean() }),
  email: z.object(inputProps),
  phone: z.object(inputProps),
  address: z.object(inputProps),
  "single-choice": z.object(choiceProps),
  "multiple-choice": z.object(choiceProps),
  datetime: z.object({ ...inputProps, mode: z.enum(["date", "datetime"]) }),
  heading: z.object({ text: labelSchema }),
  paragraph: z.object({ text: z.string().trim().min(1).max(HELP_MAX) }),
} as const satisfies Record<FormFieldKind, z.ZodObject<z.ZodRawShape>>;

export type FormFieldPropsMap = {
  [K in FormFieldKind]: z.infer<(typeof FIELD_SCHEMAS)[K]>;
};

export type FormFieldProps<K extends FormFieldKind = FormFieldKind> = FormFieldPropsMap[K];

export interface FormFieldDefinition<K extends FormFieldKind> {
  kind: K;
  label: string;
  description: string;
  /** lucide-react icon name, resolved by the UI against an allowlist. */
  icon: string;
  role: FormFieldRole;
  semantic?: FormFieldSemantic;
  /**
   * At most one per form.
   *
   * True for exactly the semantic kinds, and the reason is the submissions
   * table: two Email fields would mean two candidates for one `contact_email`
   * column, and picking the first is the kind of silent arbitrary rule that
   * produces a support ticket nobody can reproduce. A merchant who genuinely
   * needs a second email address uses a Text Field and labels it.
   */
  singleton: boolean;
  schema: (typeof FIELD_SCHEMAS)[K];
  defaults: () => FormFieldPropsMap[K];
}

export const FIELD_REGISTRY: { [K in FormFieldKind]: FormFieldDefinition<K> } = {
  name: {
    kind: "name",
    label: "Name",
    description: "Who is getting in touch.",
    icon: "User",
    role: "answer",
    semantic: "name",
    singleton: true,
    schema: FIELD_SCHEMAS.name,
    defaults: () => ({ label: "Full name", required: true }),
  },

  text: {
    kind: "text",
    label: "Text Field",
    description: "A short answer, or a longer message.",
    icon: "Type",
    role: "answer",
    singleton: false,
    schema: FIELD_SCHEMAS.text,
    defaults: () => ({ label: "Your question", required: false, multiline: true }),
  },

  email: {
    kind: "email",
    label: "Email",
    description: "An email address, checked as it is typed.",
    icon: "Mail",
    role: "answer",
    semantic: "email",
    singleton: true,
    schema: FIELD_SCHEMAS.email,
    defaults: () => ({ label: "Email", required: true, placeholder: "you@example.com" }),
  },

  phone: {
    kind: "phone",
    label: "Phone Number",
    description: "A phone number.",
    icon: "Phone",
    role: "answer",
    semantic: "phone",
    singleton: true,
    schema: FIELD_SCHEMAS.phone,
    defaults: () => ({ label: "Phone number", required: false }),
  },

  address: {
    kind: "address",
    label: "Address",
    description: "A street address.",
    icon: "MapPin",
    role: "answer",
    semantic: "address",
    singleton: true,
    schema: FIELD_SCHEMAS.address,
    defaults: () => ({ label: "Address", required: false }),
  },

  "single-choice": {
    kind: "single-choice",
    label: "Single Choice",
    description: "Pick one from a list.",
    icon: "CircleDot",
    role: "answer",
    singleton: false,
    schema: FIELD_SCHEMAS["single-choice"],
    defaults: () => ({
      label: "Which would you prefer?",
      required: false,
      options: ["First option", "Second option"],
    }),
  },

  "multiple-choice": {
    kind: "multiple-choice",
    label: "Multiple Choice",
    description: "Pick any number from a list.",
    icon: "ListChecks",
    role: "answer",
    singleton: false,
    schema: FIELD_SCHEMAS["multiple-choice"],
    defaults: () => ({
      label: "Which apply?",
      required: false,
      options: ["First option", "Second option"],
    }),
  },

  datetime: {
    kind: "datetime",
    label: "Date & Time",
    description: "A date, optionally with a time.",
    icon: "Calendar",
    role: "answer",
    singleton: false,
    schema: FIELD_SCHEMAS.datetime,
    defaults: () => ({ label: "Preferred date", required: false, mode: "date" }),
  },

  heading: {
    kind: "heading",
    label: "Heading",
    description: "A title between groups of questions.",
    icon: "Heading",
    role: "layout",
    singleton: false,
    schema: FIELD_SCHEMAS.heading,
    defaults: () => ({ text: "About your event" }),
  },

  paragraph: {
    kind: "paragraph",
    label: "Paragraph",
    description: "Explanatory copy between questions.",
    icon: "AlignLeft",
    role: "layout",
    singleton: false,
    schema: FIELD_SCHEMAS.paragraph,
    defaults: () => ({ text: "Tell guests anything they need to know before answering." }),
  },
};

/** A single field on a form. `id` is stable for the life of the field. */
export interface FormField<K extends FormFieldKind = FormFieldKind> {
  id: string;
  kind: K;
  props: FormFieldPropsMap[K];
}

export function getFieldDefinition(
  kind: string,
): FormFieldDefinition<FormFieldKind> | undefined {
  return (FIELD_REGISTRY as Record<string, FormFieldDefinition<FormFieldKind>>)[kind];
}

export function isFormFieldKind(value: unknown): value is FormFieldKind {
  return typeof value === "string" && (FORM_FIELD_KINDS as readonly string[]).includes(value);
}

/** Kinds that collect an answer, in catalogue order. */
export function answerKinds(): FormFieldKind[] {
  return FORM_FIELD_KINDS.filter((kind) => FIELD_REGISTRY[kind].role === "answer");
}

/**
 * Field ids must be stable and never reused: a submission stores answers keyed
 * by field id, so a recycled id would silently attach an old answer to a new
 * question.
 */
export function newFieldId(): string {
  const raw =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `f_${raw.replace(/-/g, "").slice(0, 12)}`;
}

export function createField<K extends FormFieldKind>(kind: K): FormField<K> {
  return { id: newFieldId(), kind, props: FIELD_REGISTRY[kind].defaults() } as FormField<K>;
}

/** The visitor-facing label, for error messages and the inbox's column headings. */
export function fieldLabel(field: FormField): string {
  const props = field.props as Record<string, unknown>;
  const label = typeof props.label === "string" ? props.label : undefined;
  const text = typeof props.text === "string" ? props.text : undefined;
  return (label ?? text ?? getFieldDefinition(field.kind)?.label ?? "Field").trim();
}
