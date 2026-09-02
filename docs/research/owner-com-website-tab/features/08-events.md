# 08 — Events

`/brands/{brandId}/events?locationId={loc}` — note: **not** under `/website/`, despite being grouped there in the nav.

![Events list — empty state with New Event](../screenshots/15-events.png)

---

## 1. The list

*"Manage events on your website."*

Empty in this account: `▭ No events`. Single header action: **New Event** (blue, primary).

---

## 2. Create New Event

![Create New Event form](../screenshots/16-new-event-form.png)

A modal (`Create New Event`) with an `⊗` close and a bottom-right **`Add Event ⊕`**.

| # | Field | Control | Notes |
|---|---|---|---|
| 1 | **Photo** | drop-zone `Upload an image` + **Select Image** | **Required** — shows `Field is required` in red on open |
| 2 | **Name** | text input | |
| 3 | **Description** | textarea | |
| 4 | **Location** | dropdown | defaults to `Charcoal Gardenia`; multi-location brands pick one |
| 5 | **Start Date** | `input[type=date]` | |
| 6 | **Start Time** | time picker | prefilled `11:00 PM` |
| 7 | **End Time** | time picker | prefilled `2:00 AM` |
| 8 | **Repeat** | dropdown | `Don't repeat` · `Daily` · `Weekly` · `Monthly` · `Yearly` |
| 9 | **Options → Add Ticket Link** | expandable | external ticketing URL |

### Details worth noting

- **Photo is required, and validated on open**, not on submit — the error is visible before you touch
  anything. Aggressive, but it communicates "an event without an image will look broken on your site,"
  which is true.
- **The time defaults are restaurant-shaped**: `11:00 PM → 2:00 AM`. Someone chose late-night defaults because
  that is when restaurant events happen. Small, and it saves two interactions on the common case.
- **`Select Image`** alongside upload implies a **media library** of previously uploaded assets.
- **Ticketing is a link, not a system.** Owner does not sell tickets; it links out. Sensible scope boundary.
- There is **no capacity, price, or RSVP** field. Events are *listings*, not bookings.

---

## 3. How events reach the site

Two paths, both automatic:

1. **The Events page** — a system page (4 blocks: nav, hero `Upcoming events near you`, the events block,
   footer). Its events block has **zero controls**; it renders the list. Empty state on the public site:
   *"There are no events right now — Check back later to see if we've added any."*
2. **The `Events` section type** — can be added to any other page from the section catalog.

In this account the Events page is **`Unpublished`**, consistent with there being no events to show. That is
the merchant parking a page until it has content — exactly the use case per-page publish states exist for.

---

## 4. Parity notes

- Model events as a **first-class entity** (brand + location scoped), not as page content. The page is just a
  view over the table, which is why its block has no editor.
- The recurrence set (`Daily/Weekly/Monthly/Yearly`, no custom RRULE, no "every 2nd Tuesday") is another
  well-judged reduction. Restaurants run weekly trivia and monthly brunches; nobody needs iCal-grade recurrence.
- If we build this, the empty-state copy on the public page matters — *"Check back later"* keeps a published
  page from looking broken when the list is empty, which is what makes it safe to publish an empty Events page.

---

**Prev:** [07 — Announcements](07-announcements.md) · **Next:** [09 — Forms](09-forms.md)
