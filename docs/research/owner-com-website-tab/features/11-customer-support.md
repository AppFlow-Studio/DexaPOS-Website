# 11 — Customer support

`/brands/{brandId}/feedback?locationId={loc}` — route name `feedback`, nav label "Customer support".

> ⚠️ Screenshot contains **real customer PII** — internal use only.

![Customer support request list](../screenshots/22-customer-support.png)

---

## 1. What it is

*"View order support requests from your customers."*

A read-only log of complaints and issues raised by guests **against specific orders**. Not a ticketing system,
not a chat inbox (that is the separate top-level **Inbox**) — a list.

| Column | Notes |
|---|---|
| **Name** | guest name, from their order |
| **Issue Type** | fixed taxonomy (below) |
| **Comment** | free text, truncated with `…` |
| **Date** | received date |

Plus the standard in-header **Search**.

## 2. The issue taxonomy

Observed values, in frequency order:

- `Wrong or missing items`
- `Food quality`
- `General`
- `Payment issue`

A **short, closed set**. The guest picks one, so the merchant can scan the column and see patterns without
reading 40 comments. Four buckets is enough to be actionable and few enough to stay meaningful.

Real examples from this account give a sense of the content:
*"Order was missing a side hot sauce"*, *"The chicken was dry when usually the meat is moist"*,
*"The points that I earned for this order went to a different…"* (a rewards issue landing under `Payment issue`).

---

## 3. Why it sits under Website

It genuinely does not belong here — it is about *orders*, not the website. Its route (`/feedback`) confirms it
was built elsewhere and grouped under Website later.

The most plausible reason: it is **guest-submitted input**, same as Form submissions and Career applications.
The Website group has quietly become "things the public sent you." That is a coherent-enough mental model, and
it is why Forms, Customer support and Careers all live together despite unrelated URLs.

If we copy the grouping, name it deliberately rather than by accident.

---

## 4. Parity notes

- **We already have the data shape.** Order-level complaints map onto our order + audit tables; the value is in
  the aggregation view, not new capture.
- Add what Owner lacks: **link each row to its order**, and a **resolved/unresolved** state. As shipped, this is
  a list a merchant reads and forgets — there is no way to mark one handled, so it has no workflow value.
- The closed **issue taxonomy** is the piece to copy exactly. It is what turns free-text complaints into a
  signal you can chart (e.g. "missing items" spiking at one location during one shift).

---

**Prev:** [10 — Analytics](10-analytics.md) · **Next:** [12 — Careers](12-careers.md)
