# Infra Plan 05 — Assets, Domains & Forms

**Stage 7** · Est. 2–3 weeks · Depends on [PLAN-02](PLAN-02-INFRA-DATA-MODEL.md),
[PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md)
Parent: [PLAN-00-GENERAL.md](PLAN-00-GENERAL.md)

> The three infrastructure pieces that are not about rendering. Domains (**B8**) is the long pole and is
> vendor-dependent — start its spike early, in parallel with Stage 4, because the answer may take a week of
> back-and-forth with the hosting platform.

---

## 2. Asset pipeline

### 2.1 What exists

[lib/cdn/server.ts](../../../lib/cdn/server.ts) already does validated upload → Supabase Storage → CDN URL, with
MIME allowlists (`png/jpeg/webp/svg+xml/gif`), a 5 MB image cap, extension sanitization, and per-organization paths.
[lib/cdn/use-merchant-cdn-image-upload.ts](../../../lib/cdn/use-merchant-cdn-image-upload.ts) is the client hook.
Bunny CDN migration is documented in [docs/features/cdn-assets/](../cdn-assets/README.md).

**Reuse it.** The genuinely new parts are: a registry table, quota accounting, derivative generation, and alt text.

### 2.2 `site_assets`

```sql
CREATE TABLE public.site_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.merchant_sites(id) ON DELETE SET NULL,  -- NULL = merchant-wide library

  storage_path text NOT NULL UNIQUE,
  cdn_url text NOT NULL,
  original_filename text,
  mime_type text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes > 0),
  width integer, height integer,

  alt_text text,
  /* { "webp_800": {url,bytes}, "avif_1600": {...} } — populated by the derivative job */
  variants jsonb NOT NULL DEFAULT '{}'::jsonb,

  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_site_assets_merchant ON public.site_assets(merchant_id, created_at DESC);
```

Sections reference assets by **id**, not by URL:

```ts
export interface AssetRef { assetId: string; alt?: string; focal?: { x: number; y: number } }
```

Same reasoning as bindings: an asset re-uploaded at higher quality, or moved to a new CDN, updates every page at once.
URLs baked into JSONB across hundreds of pages are the thing you cannot fix later. `alt` on the ref (overriding
`site_assets.alt_text`) lets the same photo carry context-appropriate alt text in different sections — which is the
correct accessibility model, not a nicety.

### 2.3 Quota (B9)

Enforced at upload, in one place:

```ts
// SELECT coalesce(sum(bytes),0) FROM site_assets WHERE merchant_id = $1
// reject if used + file.size > merchant_sites.max_asset_bytes
```

`NULL` = unlimited. Ship with `NULL` everywhere; the column existing from day one is what makes turning limits on
later a config change rather than a migration plus a customer conversation.

Return a structured error the UI can render properly: `{ error: 'quota_exceeded', usedBytes, limitBytes }` — not a
string. Merchants hitting a wall need to see *how much* they have used.

### 2.4 Derivatives

The mock shipped 3.27 MB / 2.96 MB / 2.43 MB PNGs (ANALYSIS §5.1). Merchants will upload photos straight off a
phone. On a page that is supposed to rank on Core Web Vitals, this is the single biggest performance risk in the
feature.

**Recommendation: use Bunny Optimizer / CDN URL-based transforms rather than generating derivatives yourself.**
Query-parameter resizing (`?width=800&format=webp`) means no job queue, no storage multiplication, no sharp/libvips
in the Next runtime, and no cache-warming problem. Fall back to a `sharp`-in-an-Edge-Function job only if the CDN
plan does not include transforms.

Either way, sections must never emit a raw original. A single `<SiteImage>` component owns `srcset`, `sizes`,
`loading="lazy"` (except the hero, which gets `priority`), and explicit `width`/`height` to prevent layout shift.
**Make it the only way a section can render an image** — if a renderer can reach a bare `<img>`, one eventually will.

### 2.5 Cleanup

Deleting an asset that pages reference must not break them. Reuse [PLAN-03](PLAN-03-INFRA-RESOLVER-RENDERER.md)'s
`Resolved` pattern: a missing asset renders as nothing (or a neutral placeholder in builder mode), never a broken
image icon on a live site. Orphan sweeping — assets referenced by no draft or published version, older than 30 days —
is a later cron, not v1.

---

## 3. Custom domains (B8) — routed today, **not provisioned**

### 3.1 The actual gap

[proxy.ts:113-142](../../../proxy.ts) resolves a hostname against `online_store_config.custom_domain` and rewrites
correctly. What does not exist: no host-platform API call, no certificate issuance, no domain-verification flow. A
merchant types a domain into a field and **someone adds it to the hosting platform by hand.** That works at ten
merchants and fails at five hundred.

This is also a **security** gap, not only an operational one: today, nothing verifies the merchant controls the
domain they typed. Without verification, merchant A can claim `merchantB.com` and — depending on the host's
behavior — intercept traffic or block the real owner from ever adding it.

### 3.2 `site_domains` — a state machine, not a text field

```sql
CREATE TABLE public.site_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.merchant_sites(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,

  hostname text NOT NULL UNIQUE,          -- normalized lowercase, punycode, no port, no trailing dot
  is_primary boolean NOT NULL DEFAULT false,

  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN (
    'pending_verification','verifying','verified','provisioning_tls','active','failed','removed')),

  verification_token text NOT NULL,       -- for the _dexa-verify TXT record
  verification_method text CHECK (verification_method IN ('txt','cname')),
  required_dns jsonb NOT NULL DEFAULT '[]'::jsonb,   -- exact records to show the merchant

  host_provider_id text,                  -- id returned by Vercel/Cloudflare/etc.
  tls_status text, tls_issued_at timestamptz, tls_expires_at timestamptz,

  last_checked_at timestamptz, last_error text, check_attempts integer NOT NULL DEFAULT 0,
  verified_at timestamptz, activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_site_domains_primary ON public.site_domains(site_id) WHERE is_primary;
```

`hostname UNIQUE` globally is the anti-hijack constraint: two merchants can never both claim a domain.

### 3.3 Flow

```
merchant enters domain
  → normalize + reject (own apex, reserved, already claimed, invalid)
  → row created, verification_token generated, required_dns computed
  → UI shows exact records to add:
        TXT  _dexa-verify.example.com   dexa-verify=<token>
        A    example.com                <platform ip>       (or CNAME for www)
  → cron polls DNS every 60s for 24h, backing off      [status: verifying]
  → TXT matches                                        [status: verified]
  → call host provider API to add the domain           [status: provisioning_tls]
  → poll cert issuance                                 [status: active]
  → write hostname into online_store_config.custom_domain so proxy.ts picks it up
```

**Only write `online_store_config.custom_domain` at `active`.** That column is what `proxy.ts` reads, so writing it
early points a live hostname at a site with no certificate — a browser security warning on the merchant's own domain.
The state machine exists precisely to keep that column trustworthy.

### 3.4 The vendor spike — do this first

The whole design above assumes an API. Before Stage 7, spend two days answering:

- Which host serves production, and does its API support programmatic domain add + automatic TLS?
  (Vercel: `POST /v10/projects/{id}/domains` + auto-issued certs. Cloudflare: Custom Hostnames / SSL for SaaS, built
  exactly for this. Both are viable; the platform's actual host decides.)
- Is there a domain-count limit on the current plan? Wildcard cert vs. per-domain?
- What is the propagation and issuance latency the merchant will experience?
- Rate limits on the add-domain endpoint?

**Cloudflare SSL-for-SaaS is purpose-built for this shape of problem** (many customer domains fronting one origin)
and is worth evaluating even if the app is hosted elsewhere. This spike gates the design, so run it in parallel with
Stage 4 rather than waiting.

### 3.5 Interim

Until §3.4 is answered, ship `site_domains` with an `'awaiting_manual_setup'` path: the merchant self-serves DNS
verification (which is the security-critical half and needs no vendor API), and an HQ queue shows verified domains
awaiting a manual add. That removes the hijack risk immediately and turns the manual step into a tracked task rather
than an email.

---

## 4. Form runtime

Acceptance criterion: *"a form submission on a live site is delivered and recorded."*

### 4.1 Tables

```sql
CREATE TABLE public.site_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.merchant_sites(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  template_key text,                       -- 'contact' | 'reservation' | 'event' | 'catering' | 'custom'
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  notify_emails text[] NOT NULL DEFAULT '{}',
  notify_sms text[] NOT NULL DEFAULT '{}',
  confirmation_message text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.site_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.site_forms(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.merchant_sites(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,                  -- sanitizeText applied to every value
  submitter_ip inet, user_agent text, referer text,
  spam_score numeric, is_spam boolean NOT NULL DEFAULT false,
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','sent','failed','skipped_spam')),
  delivery_error text, delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Record first, deliver second.** The submission row is written before any email is attempted, and delivery status is
tracked on it. A merchant losing a catering lead because Resend was down for ten seconds is a business-impacting bug;
storing first makes delivery retryable and makes "did anyone contact me?" answerable from the dashboard.

### 4.2 Security

`app/sites/[slug]/api/forms/[formId]/route.ts` — public, unauthenticated, on a merchant's own domain. Treat it as
hostile:

- **`sanitizeText` every value** before storage ([lib/cms/sanitize.ts](../../../lib/cms/sanitize.ts)). Stored XSS
  here would fire in the merchant's dashboard, which is the higher-privilege surface
- **Validate against `site_forms.fields`** server-side — never trust the posted field list
- **Rate limit** per IP and per form (e.g. 5/min, 50/hour)
- **Honeypot + minimum time-to-submit**, then optional Turnstile. Restaurant contact forms are spam magnets
- **Cap payload size**; reject file uploads in v1
- Reuse [lib/cms/form-security.ts](../../../lib/cms/form-security.ts) — 179 lines already solving this for the
  marketing contact form
- **Never echo submitted content back into the response**

### 4.3 Delivery

Resend for email (the repo's mailer — Telnyx is SMS only, per prior work). Template it like existing merchant
notifications so it looks like the rest of the product. Include the submission's dashboard link.

An inbox lives at `app/dashboard/website/forms/` — list, read, mark read, export CSV, resend. Wire the unread count
into the sidebar badge; a form nobody checks is worse than no form.

### 4.4 Reservations

The `reservations` section should **not** become a second reservation system. This repo has `lib/reservations/`.
Recommend: the section renders a real reservation widget writing to the existing tables, and only falls back to a
generic `site_forms` form if the merchant has reservations disabled. Same principle as **D1** — the builder is a new
surface onto existing capability, not a parallel implementation.

---

## 5. Verification

**Assets**
- [ ] Upload > quota → `quota_exceeded` with used/limit; nothing written to storage
- [ ] Uploading a `.svg` containing a `<script>` is rejected or sanitized (SVG is an XSS vector and it is in the current allowlist)
- [ ] A 4 MB JPEG renders as WebP/AVIF under ~200 KB at display size, with `srcset`
- [ ] Deleted asset → page still renders 200, no broken image
- [ ] `grep -rn "<img" components/site-builder/sections/` returns nothing (all go through `<SiteImage>`)

**Domains**
- [ ] Merchant A cannot add a hostname merchant B already has
- [ ] Verification fails cleanly when the TXT record is absent; retries back off; error is human-readable
- [ ] `online_store_config.custom_domain` is written **only** at `active`
- [ ] Removing a domain reverts to the subdomain without downtime
- [ ] Apex + `www` both resolve, one canonical, the other 301s ([PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §6.4)

**Forms**
- [ ] Submission on a live site → row stored → email delivered → visible in dashboard inbox
- [ ] Resend outage → row stored, `delivery_status = 'failed'`, retry succeeds
- [ ] `<script>` in a field is neutralized in storage **and** in the dashboard viewer
- [ ] Rate limit returns 429 without leaking whether the form exists
- [ ] Submitting a field not in the definition is rejected

## 6. Open questions

1. **Merchant-wide asset library or per-site?** Schema supports both (`site_id` nullable). Recommend merchant-wide —
   a 5-location merchant uploads their logo once.
2. **Is SVG upload worth the risk?** It is in the existing allowlist. For merchant-authored public pages,
   recommend **logos only, sanitized**, and no SVG in general image fields.
3. **Should form submissions create CRM contacts?** Every one is a customer with an email address. Out of scope, but
   the shape here should not preclude it — see [VISION-UNBOUNDED.md](VISION-UNBOUNDED.md) §4.
4. **Domain registration** (buying a domain in-product, as Owner.com effectively does) vs. connecting one. v1 is
   connect-only. Registration is a reseller relationship and a support burden.
