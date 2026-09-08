# Plan — Full Owner.com Website Feature Parity

**Date:** 2026-08-18  
**Scope:** the 23 files in [`owner.com/`](../../../owner.com/) (22 distinct views; `image.png` and `002837` are identical)  
**Branch audited:** `feat/website-owner-ui`  
**Companion UI plan:** [PLAN-2026-08-18-OWNER-UI-REPLACEMENT.md](PLAN-2026-08-18-OWNER-UI-REPLACEMENT.md)

> ## ⚫ Superseded 2026-08-18 by [PLAN-2026-08-18-OWNER-TEARDOWN-PARITY.md](PLAN-2026-08-18-OWNER-TEARDOWN-PARITY.md)
>
> That plan is written against a teardown of the **running** Owner.com application
> ([`docs/research/owner-com-website-tab/`](../../research/owner-com-website-tab/)) rather than against static
> screenshots, and it carries the current scope decisions (**W1–W6**): Announcements is skipped, the content
> section is reshaped behind a schema-v2 migration, and per-section capability flags become the core mechanism.
>
> This document is stale in three places — §4 lists public rendering as unbuilt (it shipped in the 2026-08-16
> addressing migrations), it predates the capability-flag and character-cap findings, and it plans Announcements.
> Kept for its data-model and security sections, which the new plan builds on rather than repeats.

This plan defines what remains to reproduce the **features represented in the local Owner.com screenshots**, not
every product Owner.com sells. The screenshot scope is:

1. Pages, global style, page templates, editor, preview, publish and section insertion.
2. Announcements.
3. Events.
4. Forms and response counts.
5. Website analytics integrations.
6. Customer order-support requests.
7. Careers, roles, applications, resume viewing and CSV export.

The Pages/Style/editor UI is already substantially implemented. The remaining work is mostly product data,
public runtimes, secure submission paths and the six missing dashboard areas.

---

## 1. Outcome and parity boundary

The feature is complete when a merchant can perform every meaningful action visible in the screenshots and a
visitor can consume the resulting content on the published website.

“Mimic” means matching Owner's simple information architecture and workflows while retaining DexaPOS's stronger
invariants:

- live menu prices and availability continue to come from POS data;
- drafts and published versions remain separate;
- tenant isolation is enforced by RLS and server-side authorization;
- destructive operations remain recoverable or confirmed;
- uploads, public forms and resumes are treated as hostile input;
- Website remains the marketing layer and Online Ordering remains the transaction engine.

It does **not** mean copying Owner trademarks, wording, restaurant assets, proprietary code, or blindly reproducing
limitations such as disabled announcements.

---

## 2. What the screenshots show

| Area | Screenshot evidence | Required workflow |
|---|---|---|
| Pages | `002837`, `003130` | Search and paginate pages; see status; publish/unpublish; open editor; create page; change global style |
| Style | `002918` | Replace logo; choose brand colour, light/dark mode, square/rounded corners and title font; live preview; save |
| New page | `002956`, `003008`, `003019` | Choose Article, Showcase or Blank from a left rail; preview the real page; create |
| Page editor | `003053`, `003153`, `003224`, `003538`, `003551` | Build/preview toggle; gutter edit/delete/reorder; insert sections; edit fields in a left drawer; publish |
| Announcements | `003248`, `003517` | List announcements and change display order; Owner's account shows creation disabled, but parity should provide the useful CRUD workflow |
| Events | `003303`, `003503` | List events; create an event with photo, name, description and location; expose it on the website |
| Forms | `003315`, `003330` | List forms with response counts and page-use status; create from Contact/Event/Catering/Blank templates; use on pages |
| Analytics | `003343` | Save Facebook Pixel, Google Analytics, Google Tag Manager and TikTok Pixel identifiers |
| Customer support | `003357` | Search customer order-support requests by customer, issue type, comment and date |
| Careers | `003415`, `003430`, `003440` | Create an hourly role; toggle website visibility; list applications; view resumes; delete; export applications |

The sidebar also contains Home, Launch, Orders, Inbox, Menu, Reports, Marketing, Customers, Staff and Payments.
Those are platform navigation context, not screenshot evidence for rebuilding those products under Website.
DexaPOS already owns equivalents elsewhere and must not duplicate them.

---

## 3. Current code: what is already implemented

### 3.1 Pages and editor — implemented

- [`app/dashboard/website/pages/page.tsx`](../../../app/dashboard/website/pages/page.tsx) loads the merchant-level
  site and page summaries. It deliberately does not create a site just because the list was opened.
- [`components/site-builder/dashboard/PagesScreen.tsx`](../../../components/site-builder/dashboard/PagesScreen.tsx)
  implements the Owner-shaped list, search, relative updated time, status dropdown, publish/unpublish, New Page and
  Change Style actions.
- [`app/dashboard/website/pages/new/page.tsx`](../../../app/dashboard/website/pages/new/page.tsx) and
  [`components/site-builder/dashboard/NewPageOverlay.tsx`](../../../components/site-builder/dashboard/NewPageOverlay.tsx)
  implement Article, Showcase and Blank templates using the real renderer.
- [`app/dashboard/website/pages/[pageId]/page.tsx`](../../../app/dashboard/website/pages/[pageId]/page.tsx) loads a
  real draft, its published snapshot, live menu data and the initial server-rendered canvas.
- [`components/site-builder/builder/BuilderShell.tsx`](../../../components/site-builder/builder/BuilderShell.tsx)
  owns the client editor state, server-rendered preview refresh, 1.5-second autosave, conflict handling and unsaved
  work protection.
- [`components/site-builder/builder/Canvas.tsx`](../../../components/site-builder/builder/Canvas.tsx) implements
  section gutter controls and Add Section bands.
- [`components/site-builder/builder/SectionDrawer.tsx`](../../../components/site-builder/builder/SectionDrawer.tsx)
  generates editing controls from Zod schemas and contains page rename/path/delete settings.
- [`components/site-builder/builder/AddSectionModal.tsx`](../../../components/site-builder/builder/AddSectionModal.tsx)
  is registry-driven, so new section kinds automatically appear when enabled.

### 3.2 Style — mostly implemented

- [`components/site-builder/dashboard/StyleOverlay.tsx`](../../../components/site-builder/dashboard/StyleOverlay.tsx)
  implements the five Owner controls and live preview.
- [`lib/site-builder/style-inputs.ts`](../../../lib/site-builder/style-inputs.ts) derives the full token set from
  the small input set, including WCAG-safe contrast.
- Gap: the logo is read from the Online Store and cannot be replaced from Website. There is no `site_assets` table.

### 3.3 Persistence and publishing — implemented foundation

- `merchant_sites` stores one brand site per merchant, including `theme`, `nav`, `site_seo` and `integrations`.
- `site_pages.draft_content` stores the mutable `PageDocument` and a revision for optimistic concurrency.
- `site_page_versions` stores immutable publish snapshots.
- [`app/dashboard/website/actions/draft.ts`](../../../app/dashboard/website/actions/draft.ts) implements load, save
  and explicit overwrite after a conflict.
- [`app/dashboard/website/actions/pages.ts`](../../../app/dashboard/website/actions/pages.ts) implements list,
  create, rename, archive and home-page creation.
- [`app/dashboard/website/actions/publish.ts`](../../../app/dashboard/website/actions/publish.ts) implements publish,
  unchanged-content detection, current published-document reads and unpublish.
- [`app/dashboard/website/actions/site.ts`](../../../app/dashboard/website/actions/site.ts) already allows typed
  patches to `nav`, `theme`, `site_seo` and `integrations`, and logs website audit events.

### 3.4 Public rendering — implemented foundation

- [`app/sites/[slug]/built-site.tsx`](../../../app/sites/[slug]/built-site.tsx) renders published pages for anonymous
  visitors, resolves live POS bindings, emits metadata and Restaurant JSON-LD, and keeps storefront rendering
  separate.
- [`app/sites/[slug]/[...path]/page.tsx`](../../../app/sites/[slug]/[...path]/page.tsx) serves published sub-pages.
- [`lib/site-builder/resolve-render-mode.ts`](../../../lib/site-builder/resolve-render-mode.ts) owns the routing fork.
- `get_public_site_page` is the only anonymous database read into website tables and never exposes draft content.
- [`app/dashboard/website/preview/page.tsx`](../../../app/dashboard/website/preview/page.tsx) now previews a merchant's
  real draft rather than the demo fixture. This file currently has uncommitted work and must not be overwritten.

### 3.5 Section system — extensible but incomplete

[`lib/site-builder/sections/kinds.ts`](../../../lib/site-builder/sections/kinds.ts) currently defines nine kinds:

`header`, `hero`, `content`, `gallery`, `popular-items`, `features`, `faq`, `location`, `footer`.

The registry drives validation, editor fields, addability, binding collection and renderer dispatch. Eight section
kinds shown by Owner are absent: `cards`, `form`, `pdf`, `reservations`, `reviews`, `scrolling-banner`, `video`, and
`events`. Gallery exists but is disabled because every asset currently resolves to `null`.

### 3.6 Reusable DexaPOS systems

| Existing system | Reuse | Important constraint |
|---|---|---|
| `lib/cdn/server.ts` and `use-merchant-cdn-image-upload.ts` | Image validation, storage and CDN upload | Add a website asset registry and public/private separation; do not store raw URLs in page JSON |
| `lib/cms/form-security.ts` | Honeypot, timing and public-form protections | Extend for per-form/IP rate limiting and strict definition-based validation |
| `lib/messaging/resend.ts` | Form, event, support and application notifications | Store the record before sending so delivery is retryable |
| `reservations` table and dashboard | Reservation section/widget | Public creation needs a dedicated secure action/RPC and conflict checks; do not create a second reservation system |
| `customer_feedback` | Public reviews and rating summaries | It is not an order-support-request table and should not be overloaded |
| `/dashboard/support` | Merchant-to-Dexa support | Do not reuse it for restaurant customers contacting a merchant |
| Online-store `AnalyticsScripts` | GA and Meta script-loading pattern | Built sites need a separate typed integration layer adding GTM and TikTok and avoiding double injection |
| `DataCard`, `ListHeader`, `OverlayChrome`, `OverlayRail` | All six new Website screens | Extend these primitives rather than creating one-off shells |

---

## 4. Gap summary

| Feature | Dashboard | Database/actions | Public runtime | Status |
|---|---:|---:|---:|---|
| Pages | Yes | Yes | Yes | Mostly complete |
| Style | Yes | Theme only | Yes | Logo/assets missing |
| Page templates/editor | Yes | Yes | Yes | Missing eight Owner section kinds |
| Announcements | No | No | No | Not started |
| Events | No | No | No | Not started |
| Forms | No | Planned only | No | Not started |
| Analytics integrations | No | JSON storage exists | GA/Meta only on storefront, none on built site | Partial foundation |
| Customer order support | No | No appropriate model | No submission path | Not started |
| Careers | No | No | No | Not started |
| Assets | Placeholder only | No registry | Resolver always returns `null` | Blocking Style, Gallery, Events and Careers |

---

## 5. Architectural decisions

### A. Keep feature records outside `PageDocument`

Forms, events, announcements, jobs and reviews change independently from page layout. A section stores a stable
record reference or query configuration; the public renderer resolves current records at request time. Editing a
job or cancelling an event must not require republishing every page that shows it.

### B. Use separate models for separate conversations

- `customer_feedback`: ratings/reviews; may power the Reviews section.
- `customer_order_support_requests`: a guest asking the restaurant for help with an order.
- `support_tickets`: a merchant asking Dexa HQ for platform help.
- `site_form_submissions`: general contact, catering and event leads.

Combining them would create invalid required fields, confused permissions and reporting that cannot answer basic
questions.

### C. Make assets stable references

Page documents and feature records store `assetId`, never a CDN URL. `site_assets` owns the current URL, dimensions,
MIME, size and alt text. Resume files are private application attachments and must use a separate private path or
bucket, not the public website image library.

### D. Keep dynamic product content out of publish snapshots

Published page layout is immutable; menu data, active events, approved reviews, announcements, open jobs and form
availability resolve live. This is the existing D6 model extended to the new features.

### E. System destinations stay typed

Order Online, reserve, apply, event details and form submission are typed actions. Merchants must not paste internal
Dexa URLs. External links remain explicitly external and protocol-validated.

### F. Match Owner's simplicity, not its blind spots

List pages use the existing Owner-shaped shell. Creation uses a small modal or template overlay. Advanced settings
live behind one details screen. Recoverability, validation messages, accessibility and secure uploads remain.

---

## 6. Data model

Create migrations in dependency order; all merchant tables carry `merchant_id`, all site-owned tables carry
`site_id`, timestamps, indexes and RLS. Tenant columns should be trigger-derived from the parent where possible.

### 6.1 Assets

`site_assets`

- `id`, `merchant_id`, nullable `site_id`
- `storage_path`, `cdn_url`, `original_filename`, `mime_type`, `bytes`, `width`, `height`
- `alt_text`, `variants`, `uploaded_by`, timestamps
- unique storage path; merchant/site/date indexes; quota enforced against `merchant_sites.max_asset_bytes`

Add nullable `logo_asset_id`, `favicon_asset_id` and `og_image_asset_id` to `merchant_sites`, or introduce a typed
`brand_assets` JSON object if migrations prove foreign keys impractical. Prefer explicit foreign keys.

### 6.2 Announcements

`site_announcements`

- `id`, `site_id`, `merchant_id`, `title`, optional `body`
- typed CTA (`none`, `page`, `order_online`, `external`) plus target data
- `tone`, `starts_at`, `ends_at`, `status`, `display_order`
- `dismissible`, timestamps and actor fields

Only active, scheduled-in-window announcements are returned publicly. Reordering is a single transactional RPC to
avoid duplicate order values.

### 6.3 Events

`site_events`

- `id`, `site_id`, `merchant_id`, nullable `location_id`, `slug`
- `name`, `description`, `photo_asset_id`
- `starts_at`, `ends_at`, timezone, optional venue/address override
- typed CTA/registration destination, `status`, `published_at`, timestamps

The Owner modal screenshot only exposes the top of a scrollable form; dates and status are required for a useful
event product and public filtering.

### 6.4 Forms

`site_forms`

- identity, `template_key` (`contact`, `event`, `catering`, `blank`), title and description
- ordered JSON field definitions with stable field ids, supported type, label, required flag and validation
- notification recipients, confirmation copy, active flag, timestamps

`site_form_submissions`

- form/site/merchant identity, sanitized payload, source page and location
- submitter IP hash or address according to retention policy, user agent, referer
- spam score/status, delivery state/error/attempt count, read timestamp, created timestamp

Submission is **store first, notify second**. A failed email must not lose a catering lead.

### 6.5 Customer order support

`customer_order_support_requests`

- `id`, `merchant_id`, `location_id`, nullable `site_id`, `customer_id`, `order_id`
- issue type enum (`general`, `food_quality`, `payment`, `wrong_or_missing_items`, `delivery`, `other`)
- comment, status (`open`, `in_progress`, `resolved`, `closed`), priority
- merchant response, responder, response/resolution timestamps, created/updated timestamps

Require proof that the guest owns the order/session before accepting an order-linked request. Do not expose order
existence through different error messages.

### 6.6 Careers

`site_jobs`

- site/merchant/location identity, role title, description and employment type
- compensation mode (`hourly`, `salary`, `hidden`), min/max, currency
- `is_visible`, status, display order, timestamps

`site_job_applications`

- job/site/merchant identity, name, email, phone, answers/notes
- private `resume_storage_path`, original filename and MIME
- status, received timestamp, deletion/retention metadata

Accept PDF and DOCX only, enforce size limits, randomize storage names, serve resumes through short-lived signed URLs
after an authorized action, and add malware scanning before production launch.

### 6.7 Analytics integrations

Use the existing `merchant_sites.integrations` JSONB initially with a versioned, Zod-validated structure:

```ts
interface SiteIntegrationsV1 {
  schemaVersion: 1;
  facebookPixelId?: string;
  googleAnalyticsId?: string;
  googleTagManagerId?: string;
  tiktokPixelId?: string;
}
```

Do not add four columns unless reporting/query requirements later demand them.

---

## 7. Delivery plan

### Phase 0 — Stabilize and baseline (2–3 days)

1. Finish or deliberately preserve the current uncommitted route-move work in `next.config.ts` and preview links.
2. Run the website-builder unit/action suites and record the baseline, including known unrelated failures.
3. Apply and verify the current website migrations in a disposable or staging environment.
4. Run `scripts/verify-site-tenancy.ts` for two merchants and confirm anonymous draft reads remain impossible.
5. Add browser smoke coverage for Pages → New Page → edit → autosave → publish → public URL → unpublish.

Exit criteria: current Pages/Style/editor/public site is a stable base before schema expansion.

### Phase 1 — Shared feature foundation and navigation (4–6 days)

Files to add/change:

- migrations for the tables in §6, split by domain rather than one giant migration;
- `types/website-*.ts` or `lib/site-builder/features/*/types.ts` for row/domain types;
- `app/dashboard/website/actions/{announcements,events,forms,integrations,customer-support,careers}.ts`;
- `components/site-builder/routes.ts` for all new routes;
- `app/dashboard/layout.tsx` for Website children matching Owner's order;
- reuse `ListHeader`, `DataCard`, `StatusPill`, `OverlayChrome` and `OverlayRail`.

Add navigation only when its route is functional. Behind a temporary `websiteOwnerParity` feature flag, enable one
sub-item at a time to avoid shipping six empty screens.

Every action must:

- derive the merchant from authenticated context rather than trusting a browser-provided merchant id;
- honor location scope where applicable;
- return structured errors;
- log create/update/delete/publish/export actions;
- have an action test with a second-merchant denial case.

### Phase 2 — Asset library and real image controls (7–10 days)

1. Implement `site_assets`, quota accounting and merchant RLS.
2. Adapt `lib/cdn/server.ts` into website-specific upload/list/delete actions.
3. Add an asset picker and upload field used by Style, Hero, Content, Gallery and Event editors.
4. Resolve asset ids in `buildRenderContext` and `buildPublicRenderContext`.
5. Make `SiteImage` the only public section image renderer; emit dimensions, responsive `srcset`, focal position and
   useful alt text.
6. Enable Gallery by removing its registry `unavailable` reason.
7. Make Replace Logo functional and store a merchant-level website logo rather than borrowing a random location's
   storefront logo.
8. Add orphan-safe deletion: referenced assets render a neutral fallback; physical deletion waits for a retention
   sweep.

Security: sanitize or reject SVG, validate MIME from file bytes, cap images at 5 MB, strip metadata where possible,
and never allow user-controlled storage paths.

### Phase 3 — Complete the Owner section catalogue (8–12 days)

Add `cards`, `form`, `pdf`, `reservations`, `reviews`, `scrolling-banner`, `video` and `events`.

For each kind:

1. Add a Zod schema and defaults under `lib/site-builder/sections/schemas/`.
2. Add the type to `SectionPropsMap` and the registry entry.
3. Add a server renderer under `components/site-builder/sections/` and map it in
   `components/site-builder/registry.tsx`.
4. Add resolver binding types/sources where the section references feature records.
5. Add validation, normalization, mutation, render and accessibility tests.
6. Add it to Article/Showcase templates only when it has meaningful default content.

Specific behavior:

- Cards: static repeated title/body/image/CTA records.
- Form: binds to a `site_forms.id`; public submission is client interaction around a server-rendered shell.
- PDF: public, scanned PDF asset with accessible label and download/open behavior.
- Reservations: writes to existing reservations data and uses existing conflict rules.
- Reviews: reads approved `customer_feedback.is_public` records; never exposes private comments or customer data.
- Scrolling Banner: short repeated messages with reduced-motion fallback.
- Video: allowlisted YouTube/Vimeo ids or a managed video asset; never arbitrary iframe HTML.
- Events: binds to upcoming `site_events`, with empty and past-event behavior.

Because old builds drop unknown section kinds during normalization, bump `CURRENT_SCHEMA_VERSION` to 2 and add an
identity `1 → 2` document migration. Deploy readers before writers or feature-flag insertion until all instances
understand the new kinds.

### Phase 4 — Announcements (3–5 days)

Dashboard:

- `app/dashboard/website/announcements/page.tsx` list screen;
- create/edit modal with message, optional CTA, schedule, tone and dismissibility;
- status action and Change Order modal using an atomic reorder action;
- empty row matching Owner's layout.

Public:

- resolve active announcements in public site context;
- render them once above the header in `SiteChrome`, not as copied sections on every page;
- persist dismissals per announcement/version in local storage;
- ensure keyboard dismissal and adequate contrast.

Tests: time-window boundaries, stable ordering, tenant isolation, dismissal, no announcement leakage onto ordering
storefront routes.

### Phase 5 — Events (5–7 days)

Dashboard:

- `app/dashboard/website/events/page.tsx` Owner-shaped list and New Event modal;
- event details editor for dates, timezone, image, location and CTA;
- draft/published/past status and duplicate/archive actions.

Public:

- Events section resolves upcoming published events;
- event detail pages use `/events/{eventSlug}` or a reserved, host-aware system route;
- event metadata, Event JSON-LD, canonical URL and expired-event behavior;
- optional registration target uses a linked Event form rather than inventing a second submission system.

### Phase 6 — Forms and responses (10–14 days)

Dashboard:

- `app/dashboard/website/forms/page.tsx` with name, response count and `N pages`/`Not used` status;
- `app/dashboard/website/forms/new/page.tsx` with Contact, Event, Catering and Blank templates;
- form editor for fields, ordering, required rules, confirmation copy and recipients;
- response inbox/detail, unread state, CSV export and delivery retry.

Public:

- form section binding and accessible field rendering;
- a public submission route/action that loads the authoritative definition, rejects unknown fields, sanitizes every
  value, caps the body, rate-limits by IP/form, uses honeypot and minimum-fill-time checks, and optionally Turnstile;
- store submission first, then send Resend notification and update delivery state;
- generic success/error responses that do not leak whether a form id exists.

Owner's list screenshot only shows counts, but a complete mimic requires somewhere to read the responses those
counts represent.

### Phase 7 — Analytics integrations (3–4 days)

1. Add `app/dashboard/website/analytics/page.tsx` with the four fields from the screenshot.
2. Add Zod patterns and normalization for Meta Pixel, GA4/legacy Google ids, GTM and TikTok Pixel.
3. Persist through a narrow `UpdateSiteIntegrations` wrapper around `UpdateSiteSettings`; never pass arbitrary JSON
   directly from the client.
4. Add `SiteAnalyticsScripts` to the built-site render only.
5. Load scripts after interaction, include `noscript` fallbacks where required, and update CSP hosts.
6. Emit a small typed event vocabulary: page view, Order Online click, form submit, reservation start/complete,
   application submit and event CTA click.
7. Decide consent behavior by target jurisdictions before enabling non-essential trackers by default.

Do not reuse the storefront database columns as the website source of truth: a merchant may intentionally measure
their marketing site and checkout separately. A future “use the same ids as Online Store” checkbox can copy values.

### Phase 8 — Customer order support (6–9 days)

Customer entry points:

- add Need Help to order confirmation/tracking/history surfaces;
- prove order ownership using the authenticated customer session or a signed order token;
- collect issue type and comment, with optional item selection and attachment deferred unless required.

Merchant dashboard:

- `app/dashboard/website/customer-support/page.tsx` matching the Owner list;
- search, issue/status/date filters, location scope and pagination;
- detail sheet with order/customer context, response, assignment and resolution;
- unread badge and email/in-app notification.

Reuse `customer_feedback` only for the Reviews section. Replace the current service-role-only feedback mutations with
properly scoped actions before exposing reviews or support at merchant-wide list scale.

### Phase 9 — Careers and applications (8–12 days)

Dashboard:

- `app/dashboard/website/careers/page.tsx` with Open Roles and Applications tabs;
- New Role modal matching the screenshot, then a details editor for description, location and employment type;
- applications list with role, email, phone, received date, signed resume link and confirmed delete;
- streamed/limited CSV export with formula-injection escaping.

Public:

- reserve `/careers` as a system path and render visible roles in the site's current theme;
- job detail/application flow with JobPosting JSON-LD;
- store the application before sending merchant notification;
- private resume upload with PDF/DOCX allowlist, size limit, malware scan and retention policy.

`Add to website` controls role visibility. Navigation automatically includes Careers when at least one role is
visible and removes it when none are visible; no manual stale link is possible.

### Phase 10 — Navigation, SEO and lifecycle completion (5–8 days)

1. Auto-derive internal nav from published pages plus system routes (Events/Careers) while preserving explicit order.
2. Add sitemap and robots output for published pages, events and careers.
3. Add BreadcrumbList, Event and JobPosting structured data where relevant.
4. Add page version history and rollback UI. Make the dialog explicit that live POS prices are not rolled back.
5. Add website settings for favicon, social image, default SEO, visibility and legal links.
6. If custom domains are required for launch, complete the provider verification/TLS state machine in PLAN-05;
   otherwise document subdomains as the launch boundary.
7. Add retention/anonymization jobs for submissions, support requests and applications.

### Phase 11 — Hardening, rollout and measurement (7–10 days)

- Unit: schemas, validation, registry, normalizers, identifier parsing, CSV escaping and schedule boundaries.
- Action: happy paths, concurrency, unique constraints, audit logging and second-tenant denials.
- Database: RLS tests for every table; anonymous access only through minimal public RPCs/routes.
- Browser: every screenshot workflow at desktop and responsive mobile widths.
- Public E2E: form submit, reservation, event, review, support request and job application.
- Accessibility: axe, focus order, modal/drawer trapping, form labels/errors, reduced motion and contrast.
- Security: stored XSS, SVG/PDF/resume handling, MIME spoofing, rate limiting, ID enumeration, signed URL expiry,
  CSV injection and analytics-id injection.
- Performance: image budgets, public TTFB, no per-section N+1 queries and list pagination under realistic volume.
- Observability: submission delivery failures, upload errors, publish errors, analytics script load failures and public
  endpoint rate-limit counts.

Roll out by subfeature flag to internal merchants, then a small pilot cohort, then general availability. Do not wait
for all six products to finish before releasing the safe independent ones.

---

## 8. Recommended build order and sizing

| Order | Phase | Estimate | Depends on |
|---:|---|---:|---|
| 1 | Stabilize/baseline | 2–3 d | current branch |
| 2 | Shared foundation/navigation | 4–6 d | 1 |
| 3 | Assets | 7–10 d | 2 |
| 4 | Section catalogue | 8–12 d | 2–3; record-backed kinds also depend on their product phase |
| 5 | Announcements | 3–5 d | 2 |
| 6 | Events | 5–7 d | 2–3 |
| 7 | Forms | 10–14 d | 2 |
| 8 | Analytics integrations | 3–4 d | 2 |
| 9 | Customer order support | 6–9 d | 2 |
| 10 | Careers | 8–12 d | 2–3 |
| 11 | Navigation/SEO/lifecycle | 5–8 d | 4–10 |
| 12 | Hardening/rollout | 7–10 d | all |

One engineer: approximately **13–19 working weeks**, depending on custom domains, malware scanning and the desired
form editor depth. With three engineers, Assets/Events/Careers, Forms/Support, and Sections/Analytics can proceed in
parallel after the shared foundation, targeting **7–10 calendar weeks** plus rollout.

Do not estimate the screenshot UI alone: the public unauthenticated paths, RLS, delivery retries, uploads and file
handling are most of the production work.

---

## 9. Feature-level acceptance criteria

### Pages and Style

- A merchant can create, edit, autosave, preview, publish and unpublish Article/Showcase/Blank pages.
- The public URL serves the published snapshot with live menu/location data.
- Replace Logo, Gallery and all image fields upload and render real optimized assets.
- Existing ordering storefront routes remain unaffected.

### Announcements

- A merchant can create, schedule, reorder, publish and stop announcements.
- Visitors see only active in-window announcements in the configured order.

### Events

- A merchant can create and publish a location-aware event with an image and dates.
- Upcoming events render on a page and each event has indexable detail metadata.

### Forms

- Contact/Event/Catering/Blank templates can be created and inserted into pages.
- A valid public submission is stored, notified and visible in the dashboard.
- Spam, unknown fields and cross-tenant reads are rejected.

### Analytics

- All four ids validate, save, reload and inject only on the merchant's built site.
- Invalid strings cannot become executable script content.

### Customer support

- A verified customer can create an order-linked request.
- The correct merchant/location can search, read, respond to and resolve it; no other tenant can see it.

### Careers

- A merchant can create a role, publish it, receive an application, view a short-lived resume link, delete an
  application and export safe CSV.
- Hidden/closed jobs cannot accept new public applications.

---

## 10. Definition of done

Full screenshot parity is complete only when:

1. The Website sidebar exposes Pages, Announcements, Events, Forms, Analytics, Customer support and Careers.
2. Every visible action in the reference views performs a persisted, authorized operation.
3. Every content-producing dashboard feature has a functioning public consumer.
4. The twelve Owner Add Section choices are available when their dependencies are configured; Dexa's FAQ and
   Location sections remain as additional useful choices.
5. All website tables pass tenant-isolation tests and anonymous users cannot read drafts or private submissions.
6. All public inputs are rate-limited, validated and sanitized; uploaded private documents use signed access.
7. Publish/public smoke tests, accessibility checks and security tests pass in staging.
8. Documentation, migrations, generated database types and operational alerts are updated.

Until these are true, describe the product as **Owner-shaped Pages and editor**, not full Owner Website feature
parity.
