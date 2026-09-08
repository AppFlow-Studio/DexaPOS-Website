# 14 — Page anatomy

Block-by-block composition of every page in this account. Useful as default templates and as evidence for
how the three page classes differ.

Notation: `[n ctrls]` = number of gutter controls on that block.
`4` = edit+delete+up+down · `1` = edit only · `2` = up+down only · `0` = fully locked.

Raw capture: [`../raw/other-pages-structure.txt`](../raw/other-pages-structure.txt)

---

## 1. Home — 18 blocks

The showcase page, and the best template we have.

| # | ctrls | Section | Content |
|---:|:---:|---|---|
| 0 | 1 | **Navigation** | Menu · Catering · Parties · More · `Order online` |
| 1 | 1 | **Hero** | eyebrow *"Best mediterranean food in Staten Island"*, title *"Discover the Rich and Authentic Flavors of Middle Eastern Cuisine"*, `Order online`, 5-photo carousel |
| 2 | 4 | Content | *"Unlock a Special Reward Toward Your Next Visit"* → `Claim Your Reward` (inKind partner promo) |
| 3 | 3 | **Popular Items** | `Featured` + `View menu`; 6 menu items with `Add Item` — *no edit control* |
| 4 | 4 | Content | *"Welcome to Charcoal Gardenia"* — about + address |
| 5 | 4 | Content | *"Authentic Middle Eastern Flavors"* → `Explore Our Menu` |
| 6 | 4 | Content | *"Easy Online Ordering"* → `Order Now` |
| 7 | 4 | **Gallery** | *"📸 Delicious Middle Eastern Flavors on Every Plate"* + 9 photos |
| 8 | 4 | Content | *"Parties and Celebrations"* → `Celebrate with Us` |
| 9 | 4 | Content | *"Catering for Any Event"* → `Order Catering` |
| 10 | 4 | Content | *"Reserve Your Table"* → `Save Your Spot` |
| 11 | 4 | Content | *"Visit Us Today!"* — hours + address |
| 12 | 4 | **Reviews** | *"What our guests are saying"* + 3 cards |
| 13 | 4 | **Features** | `Featuring` — Catering, Delivery, Dine In, Takeout, Vegan Options, Private Dining Room, Live Music |
| 14 | 4 | Content | *"Charcoal Gardenia Rewards"* → `Join Charcoal Gardenia Rewards` |
| 15 | 2 | **FAQ** | *"Frequently asked questions"* — reorder only |
| 16 | 0 | **Our location** | Google Map, address, contacts, hours, `Get Directions`, `Order Now` |
| 17 | 0 | **Footer** | nav, `Small print` (Terms / Privacy / Accessibility), copyright, *"Made with Owner"* |

### The rhythm

Strip the content and the pattern is a **conversion ladder**:

```
hook (hero) → promo → menu proof → who we are →
  what we serve → how to order → photos →
    the four revenue lines (parties, catering, reservations, visit) →
      social proof (reviews) → amenities → loyalty → objections (FAQ) → find us
```

Nine of the eighteen blocks are plain **Content** sections with a title, subtitle, image and one CTA. That is
the whole trick: one flexible section type, repeated with different copy and alternating image alignment.

---

## 2. Catering — 10 blocks

A conversion page with an embedded lead form.

| # | ctrls | Section |
|---:|:---:|---|
| 0 | 1 | Navigation |
| 1 | 4 | Hero-ish content — *"Middle Eastern Catering for Your Next Event"* |
| 2 | 4 | Content — *"Make Your Staten Island Event Unforgettable"* |
| 3 | 4 | **Cards** — *"Middle Eastern Catering for Every Occasion"*: Corporate Events, Lunches, meetings… |
| 4 | 4 | Content — *"Order Catering Today"* (packages) |
| 5 | 4 | **Form** — *"Planning an Event? Let's Make It Easy."* |
| 6 | 2 | FAQ |
| 7 | 4 | Reviews |
| 8 | 0 | Our location |
| 9 | 0 | Footer |

Note **FAQ, Reviews, Our location and Footer repeat from Home** — these are site-wide furniture that appears
on multiple pages, not Home-only.

---

## 3. Our Story — 7 blocks

| # | ctrls | Section |
|---:|:---:|---|
| 0 | 1 | Navigation |
| 1 | 1 | Hero — *"Middle Eastern Flavors, Grilled to Perfection."* |
| 2 | 4 | Content — *"Our Story"* |
| 3 | 4 | Content — *"What Makes Us Special"* |
| 4 | 4 | Content — *"Why Visit Charcoal Gardenia"* |
| 5 | 4 | Gallery (empty text) |
| 6 | 0 | Footer |

The Article template's shape: hero + three prose blocks + gallery. **No Our location block** — proof that even
the "locked" sections are per-page choices made at template time, not global requirements. Only nav and footer
are truly universal.

---

## 4. Events — 4 blocks *(Unpublished)*

| # | ctrls | Section |
|---:|:---:|---|
| 0 | 1 | Navigation |
| 1 | 1 | Hero — *"Upcoming events near you"* |
| 2 | 0 | **Events feed** — *"There are no events right now / Check back later to see if we've added any"* |
| 3 | 0 | Footer |

## 5. We're Hiring — 4 blocks

| # | ctrls | Section |
|---:|:---:|---|
| 0 | 1 | Navigation |
| 1 | 1 | Hero — *"Join a growing team with a love for food"* |
| 2 | 1 | **Careers feed** — *"Why work with us? We are always hiring A players…"* + roles + application form |
| 3 | 0 | Footer |

## 6. Gift Cards — 4 blocks

| # | ctrls | Section |
|---:|:---:|---|
| 0 | 1 | Navigation |
| 1 | 1 | Hero — *"Give the Perfect Gift for Any Occasion"* |
| 2 | 1 | **Gift card widget** — `Buy Card` / `Check Balance` tabs |
| 3 | 0 | Footer |

### The system-page pattern

Events, We're Hiring and Gift Cards are **identical in shape**:

```
nav (locked) → hero (edit copy only) → THE FEATURE (locked/edit-only) → footer (locked)
```

The merchant can reword the hero and nothing else. The page is a **mount point for a feature**, and its content
comes from Events / Careers / the gift-card system. Any page model we build needs to express this — a page that
is a thin frame around a data-driven block, where "editing" means changing a headline.

---

## 7. Parties — 4 blocks *(merchant-created)*

| # | ctrls | Section |
|---:|:---:|---|
| 0 | 1 | Navigation |
| 1 | 4 | Hero/content — *"Parties"* |
| 2 | 4 | **Form** — *"Host an event at our restaurant"* |
| 3 | 0 | Footer |

A merchant built this in about two minutes: Blank template, a title block, drop in a Form. It is the simplest
possible useful page, and it is the strongest evidence the model works for non-technical users.

`Contact Us` (page 8) follows the same shape with the `Contact us` form.

---

## 8. What the composition tells us

1. **Nav and footer are on every page, always locked.** Everything else is per-page.
2. **Content is the universal building block** — half of all blocks across the site.
3. **Three page classes need different treatment**: composed pages, feature mount points, and form wrappers.
4. **Site-wide furniture (FAQ, Reviews, Our location) is placed per page**, not inherited — Catering has them,
   Our Story does not.
5. **Merchant-created pages are tiny** (4 blocks). Owner-created ones are large (10–18). Left to themselves,
   merchants build one-purpose pages — so the template quality is what determines site quality.

---

**Prev:** [13 — Settings](13-settings.md) · **Next:** [15 — Implementation notes](15-implementation-notes.md)
