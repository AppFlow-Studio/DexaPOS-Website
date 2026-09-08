# 09 — Forms

`/brands/{brandId}/website/forms?locationId={loc}`

The best-built sub-feature in the Website tab, and the clearest demonstration of Owner's "one shell, reused" strategy.

---

## 1. The list

![Forms list with response counts and usage status](../screenshots/17-forms.png)

*"Add and manage forms that you can insert into website pages."*

Columns: **Name · Responses · Status**, header action **New Form**.

| Form | Responses | Status |
|---|---:|---|
| Planning an Event? Let's Make It Easy. | 8 | `1 page` |
| Contact us | 38 | `1 page` |
| Reserve Your Table | 13 | `Not used` |
| Host an event at our restaurant | 18 | `1 page` |

### `Status` here means *usage*, not publish state

Green `1 page` = embedded on one page. Grey `Not used` = exists but is on no page.

That is a genuinely smart column. The obvious thing to show is published/draft; the *useful* thing is
**"is anyone able to reach this form?"** — `Reserve Your Table` has 13 historical responses but is currently
orphaned, which is exactly the situation a merchant would otherwise never notice.

It is the same class of problem as our own live nav hole: **content that exists but is unreachable.** Owner
surfaces it as a column. Cheap, and it makes the invisible visible.

### Forms are reusable objects, not page content

A form is authored once and **embedded into pages via the `Form` section type**. One form, many pages,
one submission inbox. Do not model forms as a section's internal state.

---

## 2. Submissions

`/website/forms/{formId}/submissions`

> ⚠️ Screenshot contains **real customer PII** — internal use only.

![Form submissions table](../screenshots/18-form-submissions.png)

*"View the submissions people have submitted to your form."*

| Element | Detail |
|---|---|
| Columns | **Name · Phone Number · Email · Date Received** |
| Unread marker | blue dot at the start of each row |
| Actions | **View Form** (secondary) · **Export Submissions** (primary blue) |

Columns are **derived from the form's own fields** — this form has Name/Email/Phone/Message, and the table
shows the first three (Message is presumably in the row detail).

`Export Submissions` is the primary action, which tells you what merchants actually do with these: pull them
into a spreadsheet or CRM. Real dates here run Apr–Aug 2026 across 38 entries — this is a live lead channel,
not a demo.

---

## 3. The form builder

`View Form` → `/website/forms/{formId}`

![Form builder — same shell as the page builder](../screenshots/19-form-builder.png)

**It is the page builder.** Identical chrome and identical interaction model:

```
┌ ⊗ Close │ Contact us │ [ 🔧 Build │ 👁 Preview ] │ 💬 │ Publish ⬆ ┐
```

- Same left-gutter ✏️ / 🗑, same right-gutter ⬆ / ⬇
- Same full-width `⊕ Add Section` dividers between fields
- Same live-rendered preview in the brand's real style (teal buttons, `Noto Serif Display` headings)
- Same `Publish`

**Each form field is a "section".** The vocabulary is reused wholesale — the merchant already knows how to
operate this the moment they have edited one page.

The form's own title and intro (`Contact us` / *"Please complete the form below and we'll get back to you as
soon as we can."*) are the first, header-like block with edit-only controls — mirroring how a page's nav/hero
are edit-only.

---

## 4. Field types — 10

![Form field type catalog](../screenshots/20-form-field-types.png)

Same two-column card grid, same `Add ⊕`, `Name` preselected.

| | Type | Notes |
|---|---|---|
| ⊙ | **Name** | semantic, not just a text box |
| ▭ | **Text Field** | generic short text |
| ✉ | **Email** | validated |
| ◎ | **Single Choice** | radio group |
| 📱 | **Phone Number** | validated/formatted |
| ☑ | **Multiple Choice** | checkboxes |
| 📍 | **Address** | composite |
| T | **Heading** | layout, not input |
| 📅 | **Date & Time** | |
| ☰ | **Paragraph** | layout, not input |

### Semantic types, not primitives

`Name`, `Email`, `Phone Number`, `Address` are **distinct types** rather than a generic Text Field with a
validation dropdown. That is what lets the submissions table have real `Name` / `Phone Number` / `Email`
columns, and it is what would let submissions feed the customer database automatically.

**Copy this.** Semantic field types are the difference between a form builder that produces a blob of
key/values and one whose output is structured enough to be useful downstream.

`Heading` and `Paragraph` are layout blocks living in the same catalog — forms can have sections and
explanatory copy, not just inputs.

Required fields render with a red `*` (`Full Name*`, `Email*`, `Phone Number*`, `Message*`); the required
toggle presumably lives in each field's ✏️ panel.

---

## 5. Parity notes

- **Reuse the page-builder shell.** If our form builder looks different from our page builder, we have
  duplicated work *and* doubled what the merchant must learn. Owner's is literally the same component.
- **Model forms as brand-level entities** with a `used on N pages` rollup, and show that rollup. It catches
  orphaned forms.
- **Semantic field types** feed the submissions table and, ideally, `customers`.
- **Export is the primary action**, not a hidden menu item.
- Response counts belong in the list — they are the fastest signal of which forms matter.

---

**Prev:** [08 — Events](08-events.md) · **Next:** [10 — Analytics](10-analytics.md)
