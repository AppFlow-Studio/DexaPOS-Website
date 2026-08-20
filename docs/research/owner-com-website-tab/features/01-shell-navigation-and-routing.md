# 01 — Shell, navigation and routing

How you get to the Website tab, what surrounds it, and the URL contract behind it.

---

## 1. Owner runs two separate apps

This is the single most important structural fact, and it cost real time to discover.

| | Operations app | **Dashboard** |
|---|---|---|
| Host | `app.owner.com` | **`dashboard.owner.com`** |
| Framework | Ionic-style SPA (keeps every visited route mounted in the DOM simultaneously) | Vue 3 (`data-v-*` scoped-style attributes throughout) |
| Audience | Phone / tablet, in-service staff | Desktop, owner/manager |
| Login | Phone number → SMS code (email+password is a secondary path) | Email + password |
| MFA | Own challenge, own token | **Separate challenge — logging into one does not log you into the other** |
| Website feature | A cut-down single screen | **The full 7-page Website tab** |

Both authenticate against the same Keycloak realm (`keycloak.prod.owner.engineering/realms/owner-platform`)
but with **different OAuth clients** — `hestia` for the ops app, `hermes` for the dashboard. That is why each
issues its own MFA code.

### The ops app is a dead end for this feature

On an account that has not completed onboarding, every route in the ops app force-redirects to `/launch`
after hydration — including `/website`, which renders fully for about a second first.

![Owner ops app launch checklist](../screenshots/00-launch-page.png)

The ops app's Website screen (glimpsed before the redirect) is a **different, simpler surface**: a flat list of
quick actions (`Update home page`, `Update navigation`, `Add menu PDF`, `Create custom page`), a Content list with
on/off states, and a phone/desktop preview. It is a *remote control* for the real editor, not the editor.

**Takeaway for us:** if we ever build a tablet companion, this is the split to copy — full authoring on desktop,
toggles and quick edits on mobile. Do not try to put the builder on a phone.

---

## 2. URL contract

```
dashboard.owner.com/brands/{brandId}/website/{sub}?locationId={locationId}
                          └─ tenant ─┘                └─ scope ─┘
```

Real values from this account: `brandId = fnCBQdCez9su`, `locationId = Rrhxl9S6qWVM`.
Both are short opaque IDs (12 chars, mixed case) — **not** UUIDs and not slugs.

### Brand is the path, location is a query param

This is a deliberate and copyable decision:

- **Brand** owns the website. It is a path segment because it changes what you are looking at.
- **Location** is a *lens* on it. It is a query param because it can change without changing the page.

It maps directly onto our model — `clerk_org_id` → brand, `location_id` → `locationId` — and it matches the
site model we already chose in [`website-builder-build`]: **one site per merchant, locations as pages beneath it.**

### Observed routes

| Surface | Route |
|---|---|
| Pages list | `/brands/{b}/website/pages` |
| Page editor | `/brands/{b}/website/pages/{pageId}` |
| Section editor | `/brands/{b}/website/pages/{pageId}/blocks/{blockId}` |
| New page | `/brands/{b}/website/pages/new` |
| Style | `/brands/{b}/website/style` |
| Announcements | `/brands/{b}/website/announcements` |
| Forms list | `/brands/{b}/website/forms` |
| Form builder | `/brands/{b}/website/forms/{formId}` |
| Form submissions | `/brands/{b}/website/forms/{formId}/submissions` |
| Events | `/brands/{b}/events` |
| Analytics | `/brands/{b}/customer-analytics` |
| Customer support | `/brands/{b}/feedback` |
| Careers | `/brands/{b}/locations/{loc}/careers/{jobs\|applications}` |
| Settings overlay | any route + `?settings=brand.details&settingsLocationId={loc}` |

**Two things to notice:**

1. **Four of the seven Website children do not live under `/website/`.** Events, Analytics, Customer support and
   Careers are top-level or location-scoped routes that the *navigation* groups under Website. The nav grouping is
   a product decision layered over an unrelated URL structure — evidence these features were built separately and
   gathered under Website later.
2. **Careers is location-scoped in the path** (`/locations/{loc}/careers`) while everything else is brand-scoped.
   Jobs are per-restaurant; pages are per-brand.

### Editors are routes, not modals

Opening the page editor, the style editor or a section editor **pushes a URL**. Consequences worth copying:

- Browser back works, and backing out of a section editor returns you to the canvas.
- A section editor is deep-linkable (`/pages/{id}/blocks/{blockId}`).
- The full-screen editor is a *route with its own chrome*, not a dialog over the list.

The **Settings overlay is the exception** — it is a genuine modal, but still deep-linked via a query param
(`?settings=brand.details`), so it survives a refresh.

---

## 3. The sidebar

```
Charcoal Gardenia ▾          ← brand switcher (logo + name)
─────────────────────────
Home
Launch                        ← only while onboarding is incomplete
Orders
Inbox                         ← blue unread dot
Menu
Reports
Marketing            ▸        ← collapsible
Website              ▾        ← collapsible, EXPANDED
    Pages
    Announcements
    Events
    Forms
    Analytics
    Customer support
    Careers
Customers
Staff                ▸
Payments             ▸
─────────────────────────
Earn $1,000 per referral 💰   ← dismissible promo card
Settings                      ← pinned bottom, opens overlay
```

Structural notes:

- **Website is a collapsible group with 7 children** — it is not one page. Any parity plan that treats
  "Website" as a single screen is already wrong.
- Top-level items use `<h3>`, children use `<h6>` — a real heading hierarchy, not styled `div`s.
- Group parents (`Marketing`, `Website`, `Staff`, `Payments`) are `<button>` (they toggle);
  leaves are `<a>` with real `href`s. Middle-click and "open in new tab" work on leaves.
- The active child gets a filled pill background; the parent group stays expanded.
- `Launch` disappears once onboarding completes — the nav is state-dependent.

---

## 4. Full-screen editor chrome

Every authoring surface (page editor, form builder, style editor, new page) uses **one shared frame**:

```
┌────────────────────────────────────────────────────────────────┐
│ ⊗ Close │ <Context name> │ [ 🔧 Build │ 👁 Preview ] │ 💬 │ ▸ Primary │
└────────────────────────────────────────────────────────────────┘
```

| Slot | Behaviour |
|---|---|
| `⊗ Close` | Top-left. Exits the editor. Raises the unsaved-changes prompt if the draft is dirty. |
| Context name | The page name, form name, or the literal word `Style`. |
| `Build / Preview` | Segmented toggle, centred. Only on builder surfaces (pages, forms). Absent on Style and New Page. |
| 💬 | Feedback / support affordance, far right. |
| Primary action | Blue, top-right. **Contextual**: `Publish` (page/form), `Save` (style), `Create` (new page). |

The sidebar is **completely hidden** in these editors — full-bleed, no chrome competing with the canvas.
This is what makes a constrained builder feel spacious.

**Copy this.** One editor shell reused four ways is why the whole feature feels coherent despite covering
pages, forms and theming.

---

## 5. Auth flow (for anyone repeating this capture)

1. `dashboard.owner.com/login` → email + password.
2. `POST api.owner.com/auth/v1/hestia/login` (ops) or the `hermes` equivalent (dashboard).
   A bad pair returns HTTP **200** with body `{"status":"invalid-credentials"}` — the error is in the payload,
   not the status code.
3. On success → `/multi-factor-auth/v2` with the challenge in the query string.
4. MFA options are offered as `email` **or** `phone`; this account defaulted to phone (`***7621`).
5. Code is **6 digits, expires in 5 minutes**, entered into 6 split inputs backed by one hidden field.
   Filling the hidden field via `pressSequentially` works; a bulk `fill()` does not reliably trigger the handlers.
6. Verification lands you **directly on the route you originally requested** — the deep link survives the whole
   login + MFA round trip. Nice touch, worth copying.

---

**Next:** [02 — Pages](02-pages.md)
