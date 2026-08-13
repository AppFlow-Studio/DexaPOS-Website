# Vision — The Website Builder With No Constraints

**Date:** 2026-08-12
**Status:** Not a plan. Not committed. Not estimated.
**Purpose:** The ceiling. What this feature becomes if time, headcount, and scope are not limits — written so that the
decisions made in [PLAN-00](PLAN-00-GENERAL.md)–[PLAN-06](PLAN-06-FRONTEND-BUILDER.md) can be checked against where
they eventually need to lead.

> Read the plans for what to build. Read this for what not to make impossible.
>
> Every idea below is tagged **[COMPATIBLE]** if the v1 infrastructure already permits it, or **[REQUIRES CHANGE]**
> if reaching it means revisiting a v1 decision. There are only four of the latter, and that is the point of the
> exercise.

---

## 1. The thesis — the unfair advantage nobody else has

Wix, Squarespace, and Webflow build websites for anyone. Owner.com builds websites for restaurants. **This platform
can build websites that are *wired into the restaurant's nervous system*** — and that is a category difference, not a
feature difference.

Every other restaurant website builder starts from a blank slate and asks the owner to *type in* what their business
is. Hours. Address. Menu. Prices. Photos. Which items are popular. Whether they do delivery. What their busiest night
is. Every one of those is a form field somebody has to fill in, and every one goes stale the moment the restaurant
changes.

**This platform already knows all of it.** The POS knows the menu, the prices, the modifiers, the 86 list, the hours,
the delivery zones, the tax rates, the payment methods, the reservation book, the order history, which items sell at
2pm versus 10pm, which customers came back, and which ones stopped. A website built here is not a document *about* a
restaurant. It is a **live view of the restaurant's operating state**.

Three consequences, and they compound:

1. **The website is never wrong.** No stale menu. No item you stopped serving in March. No price from last year. The
   86 list at 7pm on a Friday is reflected on the homepage at 7:01.
2. **The website is a surface, not a destination.** The same content graph renders as a website, a mobile app, an
   in-store kiosk, a QR menu, an email campaign, and a printed menu PDF. Edit once.
3. **The website can act on what it learns.** It sees who visited, what they ordered, and what they abandoned — and
   that data lands in the same database as the POS orders, meaning the site can change based on what actually sells.

The infrastructure plans are, quietly, the plumbing for exactly this. The binding resolver
([PLAN-03](PLAN-03-INFRA-RESOLVER-RENDERER.md)) is consequence #1. The server-only renderer with a registry is
consequence #2. The section-id stability rule ([PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md) §10) is consequence #3.

---

## 2. Zero-input site generation

**The demo that sells the product:** the merchant types their restaurant's name. Ninety seconds later a complete,
photographed, SEO-optimized, orderable website is live on a subdomain. They never filled in a form.

How, concretely:

| Input | Source | Already exists? |
|---|---|---|
| Name, address, phone, hours | `locations` | ✅ |
| Full menu with prices, descriptions, modifiers | `menu_items` + cascade | ✅ |
| Best-selling items → hero + "Guest Favorites" | Order history | ✅ |
| Cuisine type, price band | Inferred from menu item names + average ticket | Derivable |
| Logo, brand colors | `online_store_config` + color extraction from the logo | Partly ✅ |
| Photography | Item images; gaps filled by licensed stock matched per dish | Partly |
| Reviews | Google Business Profile API | Integration |
| Copy — "about us", section headings, meta descriptions | LLM over the above | New |
| Structured data | Generated from the same records | ✅ |

**[COMPATIBLE]** — and this is the strongest validation of the v1 architecture. A generator is *a function that emits
a `PageDocument`*. It needs the section registry, the Zod schemas, the mutation reducers, and the binding types —
every one of which [PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md) builds as pure, importable, side-effect-free code
precisely so that something other than the canvas can drive them.

The generator is not the AI. The AI writes *copy* and picks *layout*; the structure comes from data the platform
already owns, and passes through the same Zod validation as a human edit. That is what makes it reliable enough to
ship — an LLM emitting a validated document from real business records is a fundamentally more tractable problem than
an LLM emitting HTML.

### 2.1 Brand extraction

Upload a logo → extract the palette, detect the typeface family, generate an accessible design-token set (WCAG AA
contrast enforced against every surface pairing), preview three brand-consistent variations. Most restaurant owners
cannot articulate their brand but recognize it instantly.

### 2.2 Migration by URL

Merchant pastes their existing website URL. Crawl it, extract the content, map it into sections, generate the new
site. The number-one objection to switching platforms is "I'd have to rebuild my site." Remove it.

---

## 3. The design system as product

**[REQUIRES CHANGE #1]** — [PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md) §3 deliberately constrains `style` to enum
tokens and refuses free CSS. That is right for v1 and becomes the constraint to revisit.

The end state is not "free CSS." It is a **real design-token system**:

- Site-level tokens: color scales generated from one brand color with guaranteed contrast; a type scale; a spacing
  scale; radius, shadow, and border personality
- Sections consume tokens, never literals. Changing the brand color restyles every page instantly, correctly, and
  accessibly — no republish, no per-page edits
- **Three or four "design personalities"** (Refined, Warm, Bold, Minimal) that re-skin the entire site by swapping a
  token set. One click, entirely different feel, still professional
- Merchants can adjust tokens within guardrails. They cannot produce an inaccessible or ugly site, because the system
  will not emit one

This is how you give design freedom without giving design rope. Owner.com's answer to this tension is to refuse
customization entirely — *"if you're looking for a lot of design freedom, Owner is not the right fit"*
([RESEARCH-OWNER-COM.md](RESEARCH-OWNER-COM.md) §3). A token system is the better answer: freedom inside a space
where every point is a good outcome.

Further: **[REQUIRES CHANGE #2]** — a section marketplace. Third parties (or Dexa) publish section kinds; merchants
install them. This needs the registry to be dynamic rather than a compile-time mapped type, plus a sandbox, a review
process, and a versioning story. Enormous, and genuinely valuable if the platform reaches thousands of merchants.

---

## 4. One content graph, every surface

The `PageDocument` is not a web page. It is a **structured description of what this restaurant wants to say**. The
web is one renderer.

| Renderer | What it emits | Notes |
|---|---|---|
| Website | HTML/CSS | v1 |
| **Branded mobile app** | React Native screens from the same sections | Owner.com's most-cited differentiator. This platform already ships a React Native POS app — the toolchain exists |
| **In-store kiosk** | Touch-first layout | Same menu, same photos, same 86 list |
| **QR dine-in menu** | Table-session-aware | `app/sites/[slug]/t/[token]/` already exists |
| **Printed menu PDF** | Print-styled render | Restaurants pay designers for this. It falls out of the same document |
| **Digital signage** | TV-sized loop | Menu boards that update when the POS does |
| **Email campaigns** | Section subset → MJML | "New menu items" email built from the sections just published |
| **Social cards** | Auto-generated OG images per dish | |
| **Google Business posts** | Syndicated specials | |
| **Voice / chat** | Structured answers for AI assistants and llms.txt | Increasingly how people find restaurants |

**[COMPATIBLE]** — because sections are data with typed props, and the renderer is a registry lookup rather than
hardcoded markup. Adding a renderer means adding a `render` implementation per kind for a new target, not
re-modeling content. This is the payoff of refusing to store presentation in the document.

The killer instance: **86 an item on the POS and it disappears from the website, the app, the kiosk, the QR menu, the
digital menu board, and the next email — simultaneously, in under a minute, with nobody doing anything.** No other
restaurant website product can do this, because no other one is attached to the POS.

---

## 5. The site as a growth engine

A restaurant website's job is not to exist. It is to produce orders. Once the site and the order data are in one
database, the loop closes.

### 5.1 Programmatic SEO

Auto-generate and maintain, per location, from data already held:
- A page per menu item — *"Margherita Pizza in Brooklyn"* with photo, price, structured data, and an order button
- A page per category, per cuisine, per neighborhood
- *"Order [cuisine] near [neighborhood]"* landing pages
- Catering, private events, gift cards, careers — each with local structured data

This is dozens to hundreds of indexable, genuinely-useful, always-accurate pages per merchant, generated and kept
fresh with zero merchant effort. It is the mechanism behind Owner.com's "automated SEO pages" and their claimed 30%
traffic lift in 28 days, and it is **mechanically easier here** because the underlying data is already normalized in
Postgres rather than scraped from a menu PDF.

**[COMPATIBLE]** — generated pages are `PageDocument`s with `generated_by` provenance and a merchant override flag.
No schema change; `site_pages` already holds arbitrary paths.

### 5.2 Conversion experiments

Two hero variants; the platform splits traffic and measures **orders**, not clicks — because it owns the checkout.
Auto-promote the winner. Then generalize: the platform learns across all merchants which layouts convert for which
cuisine and price band, and *ships those learnings to every site automatically*. Owner.com sells exactly this
promise — *"when we learn something new, we add it to your website right away."*

**[COMPATIBLE]** — `Section.id` is stable and unique by design ([PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md) §10),
which is the hook a variant system needs. Variants are a wrapper section kind; assignment is a cookie; attribution
joins to `orders`.

### 5.3 The full-funnel loop

```
site visit → menu view → item view → add to cart → checkout → order
     ↓            ↓          ↓            ↓            ↓
  all of it lands in the SAME database as POS orders, loyalty, and the customer record
     ↓
  abandoned cart → SMS 20 min later      (Telnyx: already integrated)
  first-time orderer → welcome series    (Resend: already integrated)
  lapsed 60 days → win-back with their usual order pre-filled
  high-value regular → early access to specials
     ↓
  attributed to revenue, per campaign, in app/dashboard/reports/
```

Owner.com's actual differentiator over ChowNow and Toast is not the website — it is this loop. And every component
of it already exists in this repo *except the site side of the funnel*, which is what the builder supplies.

### 5.4 Local presence

Listings sync (Google, Yelp, Apple Maps), review aggregation and response drafting, competitor menu-price
monitoring, and — because the platform sees actual sales — recommendations like *"your Tuesday orders are 40% below
Wednesday; here is a Tuesday-only promo, one click to publish to the site, app, and an SMS blast."*

---

## 6. Editing, at the limit

- **Multiplayer.** CRDT (Yjs) over the document, presence cursors, comment threads on sections, suggest-mode for
  agencies. **[REQUIRES CHANGE #3]** — [PLAN-02](PLAN-02-INFRA-DATA-MODEL.md) §5 chooses optimistic concurrency,
  which is right for v1 and is the thing to replace. The document-shaped model is CRDT-friendly; row-per-section
  would have been worse. The v1 choice does not block this, it just gets superseded.
- **Conversational editing.** *"Make the hero warmer, move reviews above the menu, and add a catering section."* The
  LLM emits mutation-reducer calls — `moveSection`, `addSection`, `updateProps` — which are validated by Zod before
  they touch the document. **[COMPATIBLE]**, and the reason [PLAN-06](PLAN-06-FRONTEND-BUILDER.md) §2.1 insists the
  reducers be pure and React-free.
- **Edit from a photo.** Merchant photographs their paper menu; it becomes structured menu items and a menu section.
- **Edit on the POS tablet.** The manager fixes a typo on the website from the terminal, mid-shift.
- **Version control for real:** named branches, diff two versions visually side by side, staged environments,
  scheduled publishes, approval workflows for multi-location groups where corporate approves a franchisee's changes.
  **[COMPATIBLE]** — `site_page_versions` is already append-only and content-hashed; branches are a column.

---

## 7. Performance and delivery, at the limit

- **Edge rendering worldwide**, with the shell at the edge and bindings resolved from a read replica in-region
- **Partial prerendering:** the static shell streams instantly; prices and availability stream in — which is exactly
  what [PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §5's shell/bindings split is designed to make possible later
- **Performance budgets enforced at publish.** The publish gate refuses a page that would fail Core Web Vitals, and
  tells the merchant which image is responsible. A slow restaurant site is a lost order
- **Automatic accessibility remediation** — contrast fixed at the token level, alt text generated by vision model and
  offered for confirmation, full keyboard operability guaranteed by the section library rather than by merchant care
- **Offline-capable PWA** with the menu cached, matching the POS's offline-first philosophy

---

## 8. Platform, not product

- **Public API + webhooks.** Read the content graph, write sections, subscribe to `page.published`. Agencies and
  POS resellers build on it.
- **Agency / multi-location mode.** One operator manages 40 restaurants; brand kits cascade from corporate to
  franchisee; publish across all 40 with per-location menu resolution automatic — **which the existing per-location
  binding model gives for free.** This is a genuinely hard problem for competitors and nearly free here.
- **White-label for carriers.** The three-tier hierarchy (HQ → Carriers → Merchants) means a reseller could offer
  "websites" under their own brand. The tenancy model already supports it.
- **Template marketplace** with revenue share for designers.
- **Import/export** as portable JSON. Merchants who can leave are merchants who chose to stay — and it is the
  fastest way to defuse "am I locked in?" in a sales conversation.

---

## 9. What this means for v1 — the only four things to keep in mind

Most of §1–8 is reachable from the planned architecture without revisiting a decision. Four are not, and knowing
which is the entire value of this document:

| # | Change required | v1 decision | When it bites |
|---|---|---|---|
| 1 | Design tokens replace enum `style` | [PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md) §3 constrains `style` to enums | When merchants demand real design control. **Mitigation: make `style` an object from day one**, so tokens are added fields rather than a type change |
| 2 | Dynamic section registry for a marketplace | Compile-time mapped type | Only at marketplace scale. Fine to defer entirely |
| 3 | CRDT replaces optimistic concurrency | [PLAN-02](PLAN-02-INFRA-DATA-MODEL.md) §5 | When two people edit one site. The document model makes this a swap, not a rewrite |
| 4 | Multi-location single-brand site | **D4**: one site per location | The first franchise group that wants one site for twelve locations. This is the one genuine schema fork — `merchant_sites.store_config_id` is `NOT NULL UNIQUE`. **Mitigation: nothing needed now**, but recognize it as a schema change, not a toggle, and price it that way when asked |

And three things that cost nothing now and are expensive later — **do them in v1**:

1. **Keep `Section.id` stable and unique forever.** Variants, comments, analytics-per-section, and A/B all hang off it.
2. **Never store presentation or resolved data in the document.** Bindings and tokens only. This is what makes every
   alternate renderer in §4 possible.
3. **Keep the mutation reducers pure and React-free.** They are the API that AI generation, conversational editing,
   import, and migration will all drive.

---

## 10. The one-sentence version

> Everyone else sells a restaurant a **website**. This platform can sell a restaurant a **website that is the same
> living thing as their POS** — never wrong, on every surface, that gets better at selling on its own.

Nothing in [PLAN-00](PLAN-00-GENERAL.md)–[PLAN-06](PLAN-06-FRONTEND-BUILDER.md) needs to change to leave that
possible. That was the design goal.
