# 13 — Settings overlay (the site-wide switches)

Opened from the pinned **Settings** item at the sidebar bottom. Deep-linked via query params:
`?settings=brand.details&settingsLocationId={loc}`

![Settings overlay — Location details](../screenshots/25-settings-overlay.png)

Not part of the Website nav group — but several of the most important website behaviours live here, which is
easy to miss.

---

## 1. Shape

A **two-pane modal**: section list on the left, panel on the right, `⊗` top-right. It overlays whatever page
you were on (the URL keeps the underlying route and appends `?settings=…`), so it survives a refresh and is
linkable.

Twelve sections:

`Brand details` · `Location details` · `Prep time` · `Hours` · `Orders and delivery` ·
`Stations and tablets` · `Marketing` · `Alerts` · `Payments` · `Billing` · `Integrations` · `Marketplaces`

Note the **brand / location split** encoded in the setting keys themselves: `brand.details` vs
`location.details`, `location.integrations`. Two scopes, one modal.

---

## 2. Brand details — the website-relevant one

![Settings — Brand details](../screenshots/26-settings-brand-details.png)

| Field | Control | Value here |
|---|---|---|
| **Name** | text | `Charcoal Gardenia` |
| **Links** | 4 stacked inputs | `Facebook`, Instagram (`https://www.instagram.com/charcoalgardenia/`), `TikTok`, `Reservations` |
| **Cuisines** | tag list | Mediterranean, Middle Eastern, Coffee, Crepes, Dessert, Family Friendly, Hookah Bar, Tea Shop, Halal |
| **Price range** | selector | `$$` |
| **Landing page default location** | selector | which location the brand homepage assumes |
| **Force location selection before menu** | toggle | see below |
| Privacy policy | notice | *"You're using the Owner Privacy Policy template — Contact support to use your own."* |
| **Features** | 3 toggles | `Customer reviews` · `Rewards` · `Gift cards` |

### The Features toggles gate website sections

This is the part that is easy to miss and important to copy:

**`Customer reviews`, `Rewards` and `Gift cards` are switched on here, not in the page editor.**

That is why the Home page's Rewards block and Reviews block exist at all, and why the ops app's Website screen
showed `Events — Off`, `Contact — Off`, `Rewards — Off` as simple on/off rows. A section's *availability* is a
brand-level capability; its *content and position* are page-level.

Two-layer model:

```
Brand settings  →  is this capability on for this business?
Page editor     →  where does it appear and what does it say?
```

Our section registry already has a related concept — `unavailable?: string` for a kind whose dependency does
not exist yet. This is the same idea driven by an explicit merchant toggle rather than a build-time constant.

### Force location selection before menu

> *"Hide the brand-level menu so guests must pick a location first. Recommended for brands with different menus
> per location."*

This is precisely the multi-location problem we already reasoned about: **no prices until the visitor picks a
location**, because branches charge differently. Owner's answer is a merchant-controlled toggle plus a
recommendation, rather than an automatic rule.

Alongside it, **`Landing page default location`** answers the other half — what the brand homepage shows before
any choice is made. Note it is a *default*, not a redirect, which matches the conclusion we reached
independently: never geo-redirect the brand homepage, or only one location ever gets indexed.

### Privacy policy is templated

Merchants get Owner's template by default and must **contact support** to substitute their own. A pragmatic
call: most restaurants have no privacy policy, and a templated one is better than none — but it is
staff-gated, not self-serve.

---

## 3. Location details

| Field | Value |
|---|---|
| **Location name** | `Charcoal Gardenia` |
| **Location URL** | `/charcoalgardenia-wt221f` |
| **Address** | 432 Manor Rd / Line 2 / Staten Island / NY / 10314 |
| **Contact** | `charcoalnyc@gmail.com`, `(718) 887-0100` |

The **Location URL** is the public path segment for this location, with a short random suffix (`-wt221f`)
to guarantee uniqueness. Compare our `merchant_sites.subdomain` → `/sites/{subdomain}`.

Address and contact from this panel are what the locked **Our location** section and the footer render.
Change it here, it changes on every page — which is exactly why that section has no editor.

---

## 4. Where domain settings are *not*

There is **no self-serve custom domain configuration anywhere** — not in Settings, not in the Website tab.

The only domain affordance in the entire product is a launch-checklist item: **"Provide domain information"**,
which collects details for Owner's team to action. `Integrations` covers only POS/payments (Stripe — active,
`acct_1Stx61IhkkYIGAPV` — plus Otter, Square, Clover).

**A real decision for us:** either build genuine domain management (DNS instructions, verification, TLS), or
mirror Owner and make it a request flow handled by our team. Owner — whose entire pitch is restaurant websites —
chose the second. That is a strong signal about how much support burden self-serve DNS creates.

---

## 5. Parity checklist from this screen

- [ ] Brand-level **feature toggles** that gate section availability (reviews / rewards / gift cards)
- [ ] **Social + reservation links** at brand level, consumed by footer and nav
- [ ] **Cuisines** and **price range** — these feed SEO schema and listing pages
- [ ] **Default location** + **force location selection** for multi-location brands
- [ ] **Location URL** with a uniqueness suffix
- [ ] A decision on **domains**: build it, or request-flow it

---

**Prev:** [12 — Careers](12-careers.md) · **Next:** [14 — Page anatomy](14-page-anatomy.md)
