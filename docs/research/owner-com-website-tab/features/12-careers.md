# 12 — Careers

`/brands/{brandId}/locations/{locationId}/careers/{jobs|applications}?locationId={loc}`

**The only Website child that is location-scoped in its path** — jobs are per restaurant, not per brand.

> ⚠️ Screenshots contain **real applicant PII** — internal use only.

---

## 1. Two tabs

*"Manage jobs that are advertised on your website."*

Header actions: **Export Applications** (secondary) · **New Role** (primary blue).
Tab control: `Open Roles` | `Applications`, each with its own route (`/careers/jobs`, `/careers/applications`).

### Applications

![Careers — Applications tab](../screenshots/23-careers.png)

| Column | Notes |
|---|---|
| **Name** | applicant |
| **Roles** | which role applied for — all show `All` here |
| **Email** | truncated with `…` |
| **Phone number** | formatted `(347) 308-3143` |
| **Received** | date |
| **Resume** | **View** link — opens the uploaded file |
| **Delete** | 🗑 red, per row |

8 applications, Apr–Jul 2026. Pagination `1-8 of 8`.

`Roles: All` throughout means these people applied to the **general** "we're hiring" listing rather than a
specific role — which is what happens when a merchant has no specific roles open. Good default behaviour:
the page still accepts applicants when there is nothing posted.

### Open Roles

![Careers — Open Roles tab](../screenshots/24-careers-open-roles.png)

The list of posted positions.

---

## 2. Add new role

A modal: `Add new role`.

| Field | Control | Notes |
|---|---|---|
| **Role** | text input (`Aa`) | the job title |
| **Add to website** | toggle | whether it appears publicly |
| **Per hour salary range** | toggle | reveals the two fields below |
| ↳ **Min** / **Max** | `input[type=number]`, `$` prefixed | hourly range |
| **Add job** | primary | |

Deliberately tiny: **no description, no requirements, no employment type, no schedule, no location picker**
(location comes from the route).

### Two details worth stealing

1. **`Add to website` is a toggle on the role itself.** A merchant can track a role internally without
   advertising it — and can pull a listing without deleting it and losing its applications. Publish state on
   the entity, not a separate workflow.
2. **Pay is optional but structured.** Behind a toggle (many restaurants won't post pay), and when shown it is
   `Min`/`Max` numeric per hour — not a free-text "competitive salary" string. Structured means it can be
   displayed consistently and, eventually, filtered.

---

## 3. How it reaches the site

The **We're Hiring** page (4 blocks: nav, hero *"Join a growing team with a love for food"*, a
*"Why work with us?"* block, footer). Its blocks are **edit-only or locked** — the role list and the
application form render automatically from this feature.

So: post a role here → it appears on the careers page → applications land in the Applications tab.
The merchant never touches the page.

---

## 4. Parity notes

- **Location-scoped**, unlike everything else in the Website group. Our `site_pages.location_id` model handles
  this; the careers *entity* should be location-scoped from the start.
- **Resume upload + storage** is the only genuinely new infrastructure here (file storage, access control on a
  document containing personal data, retention). Everything else is CRUD.
- **Export Applications** matters — hiring happens in email and spreadsheets.
- Applicant records are personal data. Whatever we build needs a deletion path (Owner has per-row 🗑) and a
  retention answer.
- Keep the role form **this small**. Resist adding a description editor; the value is "post a job in 15
  seconds", and a rich job-description editor is a different product.

---

**Prev:** [11 — Customer support](11-customer-support.md) · **Next:** [13 — Settings](13-settings.md)
