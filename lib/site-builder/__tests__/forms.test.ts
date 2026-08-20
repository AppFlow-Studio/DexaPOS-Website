import { describe, expect, it } from "vitest";

import {
  CURRENT_FORM_VERSION,
  MAX_FIELDS,
  answerFields,
  createEmptyForm,
  createStarterForm,
  normalizeForm,
  validateForm,
  type FormDocument,
} from "../forms/document";
import {
  FIELD_REGISTRY,
  FORM_FIELD_KINDS,
  createField,
  fieldLabel,
  type FormField,
  type FormFieldKind,
} from "../forms/fields";
import { addField, moveFieldBy, removeField, updateFieldProps } from "../forms/mutations";
import { buildSubmission, submissionColumns } from "../forms/submission";

// ─────────────────────────────────────────────────────────────────────────────
// registry invariants
// ─────────────────────────────────────────────────────────────────────────────

describe("the field registry", () => {
  it("has an entry for every kind, and its defaults parse against its own schema", () => {
    for (const kind of FORM_FIELD_KINDS) {
      const def = FIELD_REGISTRY[kind];
      expect(def, kind).toBeDefined();
      expect(def.kind).toBe(kind);

      const parsed = def.schema.safeParse(def.defaults());
      expect(parsed.success, `${kind} defaults do not satisfy ${kind} schema`).toBe(true);
    }
  });

  /**
   * The decision the whole feature rests on. If these stop being distinct kinds
   * the submissions table loses its real columns and the output goes back to
   * being an untyped blob.
   */
  it("keeps Name, Email, Phone and Address as semantic kinds", () => {
    expect(FIELD_REGISTRY.name.semantic).toBe("name");
    expect(FIELD_REGISTRY.email.semantic).toBe("email");
    expect(FIELD_REGISTRY.phone.semantic).toBe("phone");
    expect(FIELD_REGISTRY.address.semantic).toBe("address");

    // A generic text field must NOT claim a semantic slot, or it would compete
    // for the same column.
    expect(FIELD_REGISTRY.text.semantic).toBeUndefined();
  });

  it("makes exactly the semantic kinds singletons", () => {
    for (const kind of FORM_FIELD_KINDS) {
      const def = FIELD_REGISTRY[kind];
      expect(def.singleton, kind).toBe(Boolean(def.semantic));
    }
  });

  it("treats Heading and Paragraph as layout, collecting nothing", () => {
    expect(FIELD_REGISTRY.heading.role).toBe("layout");
    expect(FIELD_REGISTRY.paragraph.role).toBe("layout");
  });

  it("gives every field a unique id", () => {
    const ids = new Set(Array.from({ length: 200 }, () => createField("text").id));
    expect(ids.size).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// document
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeForm", () => {
  it("turns anything unusable into an empty but valid form", () => {
    for (const input of [null, undefined, "a form", 7, []]) {
      const doc = normalizeForm(input);
      expect(doc.schemaVersion).toBe(CURRENT_FORM_VERSION);
      expect(doc.fields).toEqual([]);
      expect(doc.confirmation.message.length).toBeGreaterThan(0);
    }
  });

  it("round-trips a starter form unchanged", () => {
    const starter = createStarterForm();
    const round = normalizeForm(JSON.parse(JSON.stringify(starter)));
    expect(round.fields.map((f) => f.kind)).toEqual(starter.fields.map((f) => f.kind));
    expect(round.title).toBe(starter.title);
  });

  /**
   * Deliberately different from `normalizePage`, which repairs a broken section
   * to its defaults. A field reverting to defaults would silently change what a
   * visitor is asked — a required field appearing from nowhere, or a choice list
   * reset to "First option" — and produce answers the merchant cannot interpret.
   */
  it("drops a field whose props do not parse rather than defaulting it", () => {
    const doc = normalizeForm({
      title: "Contact",
      fields: [
        { id: "f_1", kind: "single-choice", props: { label: "Pick", required: false, options: [] } },
        { id: "f_2", kind: "email", props: { label: "Email", required: true } },
      ],
      confirmation: { message: "Thanks" },
      settings: { submitLabel: "Send", notifyEmails: [] },
    });

    expect(doc.fields).toHaveLength(1);
    expect(doc.fields[0].kind).toBe("email");
  });

  it("drops a kind this build does not know", () => {
    const doc = normalizeForm({
      title: "Contact",
      fields: [{ id: "f_1", kind: "signature-pad", props: {} }],
      confirmation: { message: "Thanks" },
      settings: { submitLabel: "Send", notifyEmails: [] },
    });
    expect(doc.fields).toEqual([]);
  });

  /** Two questions sharing one answer slot is data loss, so the later one goes. */
  it("drops a duplicate field id", () => {
    const doc = normalizeForm({
      title: "Contact",
      fields: [
        { id: "f_1", kind: "text", props: { label: "First", required: false, multiline: false } },
        { id: "f_1", kind: "text", props: { label: "Second", required: false, multiline: false } },
      ],
      confirmation: { message: "Thanks" },
      settings: { submitLabel: "Send", notifyEmails: [] },
    });

    expect(doc.fields).toHaveLength(1);
    expect(fieldLabel(doc.fields[0])).toBe("First");
  });

  it("drops a second copy of a singleton kind", () => {
    const doc = normalizeForm({
      title: "Contact",
      fields: [
        { id: "f_1", kind: "email", props: { label: "Work email", required: true } },
        { id: "f_2", kind: "email", props: { label: "Home email", required: false } },
      ],
      confirmation: { message: "Thanks" },
      settings: { submitLabel: "Send", notifyEmails: [] },
    });

    expect(doc.fields).toHaveLength(1);
    expect(fieldLabel(doc.fields[0])).toBe("Work email");
  });

  it("keeps only real notification addresses", () => {
    const doc = normalizeForm({
      title: "Contact",
      fields: [],
      confirmation: { message: "Thanks" },
      settings: { submitLabel: "Send", notifyEmails: ["chef@joes.test", "not-an-email", 7] },
    });
    expect(doc.settings.notifyEmails).toEqual(["chef@joes.test"]);
  });

  it("caps the field list", () => {
    const fields = Array.from({ length: MAX_FIELDS + 10 }, (_, i) => ({
      id: `f_${i}`,
      kind: "text",
      props: { label: `Q${i}`, required: false, multiline: false },
    }));

    const doc = normalizeForm({
      title: "Long",
      fields,
      confirmation: { message: "Thanks" },
      settings: { submitLabel: "Send", notifyEmails: [] },
    });
    expect(doc.fields.length).toBeLessThanOrEqual(MAX_FIELDS);
  });
});

describe("validateForm", () => {
  it("refuses to publish a form that collects nothing", () => {
    const doc = createEmptyForm("Empty");
    expect(validateForm(doc).ok).toBe(false);

    const headingsOnly = { ...doc, fields: [createField("heading"), createField("paragraph")] };
    expect(validateForm(headingsOnly).ok).toBe(false);
  });

  it("accepts a form with one real question", () => {
    expect(validateForm(createStarterForm()).ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mutations
// ─────────────────────────────────────────────────────────────────────────────

describe("form mutations", () => {
  const base = () => createEmptyForm("Test");

  it("adds a field at the end by default and at an index when asked", () => {
    let doc = base();
    for (const kind of ["name", "email", "text"] as FormFieldKind[]) {
      const result = addField(doc, kind);
      expect(result.ok).toBe(true);
      if (result.ok) doc = result.doc;
    }
    expect(doc.fields.map((f) => f.kind)).toEqual(["name", "email", "text"]);

    const inserted = addField(doc, "phone", { atIndex: 0 });
    expect(inserted.ok).toBe(true);
    if (inserted.ok) expect(inserted.doc.fields[0].kind).toBe("phone");
  });

  it("refuses a second singleton and names the way round it", () => {
    let doc = base();
    const first = addField(doc, "email");
    if (first.ok) doc = first.doc;

    const second = addField(doc, "email");
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("singleton_exists");
      expect(second.message).toContain("Text Field");
    }
  });

  it("allows as many non-singleton fields as the cap permits, then refuses", () => {
    let doc = base();
    for (let i = 0; i < MAX_FIELDS; i++) {
      const result = addField(doc, "text");
      expect(result.ok, `field ${i}`).toBe(true);
      if (result.ok) doc = result.doc;
    }
    expect(doc.fields).toHaveLength(MAX_FIELDS);

    const overflow = addField(doc, "text");
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.reason).toBe("limit_reached");
  });

  it("moves a field and refuses to move it off the end", () => {
    let doc = base();
    for (const kind of ["name", "email"] as FormFieldKind[]) {
      const r = addField(doc, kind);
      if (r.ok) doc = r.doc;
    }

    const moved = moveFieldBy(doc, doc.fields[1].id, -1);
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.doc.fields[0].kind).toBe("email");

    const off = moveFieldBy(doc, doc.fields[0].id, -1);
    expect(off.ok).toBe(false);
    if (!off.ok) expect(off.reason).toBe("out_of_range");
  });

  it("removes a field", () => {
    let doc = base();
    const added = addField(doc, "text");
    if (added.ok) doc = added.doc;

    const removed = removeField(doc, doc.fields[0].id);
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(removed.doc.fields).toEqual([]);
  });

  it("validates props on update rather than storing something unrenderable", () => {
    let doc = base();
    const added = addField(doc, "single-choice");
    if (added.ok) doc = added.doc;

    const emptied = updateFieldProps(doc, doc.fields[0].id, { options: [] });
    expect(emptied.ok).toBe(false);
    if (!emptied.ok) expect(emptied.reason).toBe("invalid_props");

    const ok = updateFieldProps(doc, doc.fields[0].id, { options: ["Lunch", "Dinner"] });
    expect(ok.ok).toBe(true);
  });

  it("never mutates its input", () => {
    const doc = createStarterForm();
    const before = JSON.stringify(doc);
    addField(doc, "phone");
    removeField(doc, doc.fields[0].id);
    moveFieldBy(doc, doc.fields[0].id, 1);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// submission — the security boundary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `buildSubmission` iterates the DEFINITION, never the posted body. That is what
 * makes an unknown key structurally impossible to store rather than merely
 * filtered — and it is the difference between a form and an open jsonb write
 * endpoint with a text box in front of it.
 */
describe("buildSubmission", () => {
  function formWith(fields: FormField[]): FormDocument {
    return { ...createEmptyForm("Contact"), fields };
  }

  const nameField: FormField = {
    id: "f_name",
    kind: "name",
    props: { label: "Full name", required: true },
  };
  const emailField: FormField = {
    id: "f_email",
    kind: "email",
    props: { label: "Where can we reach you?", required: true },
  };
  const messageField: FormField = {
    id: "f_msg",
    kind: "text",
    props: { label: "Message", required: false, multiline: true },
  };

  it("accepts a well-formed submission", () => {
    const result = buildSubmission(formWith([nameField, emailField, messageField]), {
      f_name: "Zahara Z.",
      f_email: "zahara@example.com",
      f_msg: "Do you cater?",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.answers).toHaveLength(3);
      expect(result.record.contact.name).toBe("Zahara Z.");
      expect(result.record.contact.email).toBe("zahara@example.com");
    }
  });

  it("discards every key that is not a field on this form", () => {
    const result = buildSubmission(formWith([nameField]), {
      f_name: "Real Person",
      f_not_a_field: "injected",
      merchant_id: "00000000-0000-0000-0000-000000000000",
      read_at: "2020-01-01",
      __proto__: { polluted: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.answers).toHaveLength(1);
      expect(result.record.answers[0].fieldId).toBe("f_name");
    }
  });

  /**
   * The semantic columns are filled from the field's KIND, not its wording —
   * which is what lets a merchant label their email field anything they like.
   */
  it("fills contact columns from the field kind, whatever the merchant called it", () => {
    const result = buildSubmission(formWith([emailField]), {
      f_email: "chef@example.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.contact.email).toBe("chef@example.com");
  });

  it("reports every missing required field at once", () => {
    const result = buildSubmission(formWith([nameField, emailField]), {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["f_email", "f_name"]);
    }
  });

  it("leaves a blank optional field out of the record entirely", () => {
    const result = buildSubmission(formWith([nameField, messageField]), {
      f_name: "Someone",
      f_msg: "   ",
    });

    expect(result.ok).toBe(true);
    // Not stored as "", because "left blank" and "never asked" must not look
    // identical in an export two years later.
    if (result.ok) expect(result.record.answers.map((a) => a.fieldId)).toEqual(["f_name"]);
  });

  it("rejects a malformed email and phone", () => {
    const phone: FormField = {
      id: "f_tel",
      kind: "phone",
      props: { label: "Phone", required: true },
    };

    const bad = buildSubmission(formWith([emailField, phone]), {
      f_email: "not-an-email",
      f_tel: "call me",
    });

    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.f_email).toContain("email");
      expect(bad.errors.f_tel).toContain("phone");
    }
  });

  it("refuses a choice that was never offered", () => {
    const choice: FormField = {
      id: "f_pick",
      kind: "single-choice",
      props: { label: "Service", required: true, options: ["Lunch", "Dinner"] },
    };

    const smuggled = buildSubmission(formWith([choice]), { f_pick: "Free food" });
    expect(smuggled.ok).toBe(false);

    const legitimate = buildSubmission(formWith([choice]), { f_pick: "Dinner" });
    expect(legitimate.ok).toBe(true);
  });

  it("keeps only offered options from a multiple choice, silently", () => {
    const choice: FormField = {
      id: "f_many",
      kind: "multiple-choice",
      props: { label: "Interests", required: false, options: ["Lunch", "Dinner", "Events"] },
    };

    const result = buildSubmission(formWith([choice]), {
      f_many: ["Lunch", "Not offered", "Events"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.answers[0].values).toEqual(["Lunch", "Events"]);
      expect(result.record.answers[0].value).toBe("Lunch, Events");
    }
  });

  it("strips markup from what it stores", () => {
    const result = buildSubmission(formWith([messageField]), {
      f_msg: "<script>alert(1)</script>Hello",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.answers[0].value).not.toContain("<script");
      expect(result.record.answers[0].value).toContain("Hello");
    }
  });

  it("truncates an over-long answer rather than storing it", () => {
    const result = buildSubmission(formWith([messageField]), { f_msg: "x".repeat(50_000) });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.answers[0].value.length).toBeLessThanOrEqual(2000);
  });

  it("survives a body that is not an object at all", () => {
    for (const raw of [null, undefined, "string", 7, []]) {
      const result = buildSubmission(formWith([messageField]), raw);
      // Nothing required, so nothing to complain about — and nothing stored.
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.record.answers).toEqual([]);
    }
  });

  /**
   * The label is snapshotted at submission time, which is why `site_forms` needs
   * no version history: a lead from two years ago still renders its own
   * questions after the form has been rewritten.
   */
  it("snapshots the question as it was worded", () => {
    const result = buildSubmission(formWith([emailField]), { f_email: "a@b.co" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.answers[0].label).toBe("Where can we reach you?");
  });

  it("ignores layout blocks entirely", () => {
    const heading: FormField = { id: "f_h", kind: "heading", props: { text: "About you" } };
    const result = buildSubmission(formWith([heading, nameField]), {
      f_h: "trying to answer a heading",
      f_name: "Someone",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.answers.map((a) => a.fieldId)).toEqual(["f_name"]);
  });
});

describe("submissionColumns", () => {
  it("derives the inbox columns from the form's own fields, in order", () => {
    const doc = { ...createEmptyForm("C"), fields: createStarterForm().fields };
    const columns = submissionColumns(doc);

    expect(columns.map((c) => c.key)).toEqual(["name", "email"]);
    // The merchant's own wording, because that is what they recognise.
    expect(columns[0].label).toBe("Full name");
  });

  it("returns nothing for a form with no semantic fields", () => {
    const doc = { ...createEmptyForm("C"), fields: [createField("text")] };
    expect(submissionColumns(doc)).toEqual([]);
  });
});

describe("answerFields", () => {
  it("excludes layout blocks", () => {
    const doc = {
      ...createEmptyForm("C"),
      fields: [createField("heading"), createField("name"), createField("paragraph")],
    };
    expect(answerFields(doc).map((f) => f.kind)).toEqual(["name"]);
  });
});
