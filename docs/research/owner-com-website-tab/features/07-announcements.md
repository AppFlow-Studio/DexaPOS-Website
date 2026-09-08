# 07 — Announcements

`/brands/{brandId}/website/announcements?locationId={loc}`

![Announcements — creation disabled, end of life](../screenshots/14-announcements.png)

---

## 1. What it is

*"Add announcement banners to your website."*

Site-wide banner strips — the "Closed Dec 25", "New winter menu", "Now delivering to Brooklyn" bar that sits
above or below the nav.

## 2. What it currently does: nothing

A warning callout occupies the page:

> ⚠️ **Announcement creation disabled.**
> The announcements feature is reaching end of life. Creating new banners has been removed to facilitate this change.

Remaining UI:

- **Change Order** button (top right) — would reorder existing banners
- Empty state: `⚑ No announcements`
- **No create button at all** — it has been removed, not disabled

This account has zero announcements, so the ordering flow could not be observed.

---

## 3. Why this matters to us

**Do not build this.** Owner shipped it, ran it, and is now retiring it. That is a strong signal that the
feature did not earn its maintenance cost.

Reasonable guesses at why, worth weighing before anyone re-proposes it:

- It overlaps almost entirely with a **Content section** or a **Scrolling Banner** section, both of which the
  merchant can already place, style and remove themselves.
- A site-wide banner is a cross-cutting concern that fights the per-page publish model — where does a banner
  live in a page-based draft/publish workflow?
- Time-boxed messaging ("closed today") is better served by hours/holiday settings than by a hand-managed banner
  someone forgets to take down.

If merchants ask us for banners, the cheaper answer is a **Scrolling Banner section** they can add to a page,
plus proper holiday-hours handling — not a separate site-wide announcement system with its own ordering UI.

---

## 4. One thing worth copying

The deprecation itself is well handled: the page still exists, still lists what you have, still lets you
**reorder** what is live — it just refuses *new* ones and says plainly why. Existing merchants are not
broken; nobody new gets pulled in. That is how to retire a feature.

---

**Prev:** [06 — Section types](06-section-types.md) · **Next:** [08 — Events](08-events.md)
