# Research — Owner.com as the reference product

**Date:** 2026-08-12
**Why:** Named as the inspiration for this feature. This is what they actually sell, what to copy, and — as
importantly — where they are deliberately weak.
**Sources:** [owner.com](https://www.owner.com/) · [owner.com/pricing](https://www.owner.com/pricing) ·
[owner.com/restaurant-website-ai](https://www.owner.com/restaurant-website-ai) ·
[Sauce review](https://www.getsauce.com/post/owner-com-reviews) ·
[Sacra company profile](https://sacra.com/c/owner/)

---

## 1. What Owner.com is

An all-in-one growth platform for **independent restaurants**. The pitch is not "we build you a website" — it is
**"stop paying DoorDash 25–40% commission; own your customers and your direct orders."** The website is the delivery
mechanism for that pitch, not the product.

That framing matters for this project. A merchant does not buy a website builder. They buy more direct orders. The
builder is how you get there.

## 2. Feature inventory

Verbatim, from their own navigation:

| Category | Features |
|---|---|
| **Website & discovery** | Restaurant Website (AI-powered) · Restaurant SEO · Online Menu · Reviews Engine · Listings Management |
| **Ordering** | Online Ordering · Smart Upsells · Delivery · Catering |
| **Marketing** | Branded Restaurant App · Marketing Campaigns · Email & SMS Marketing · Push Notifications · Loyalty & Rewards |
| **Operations** | Owner App (mobile management) · Reporting & Analytics · Kitchen Tablet · POS Integrations |

## 3. The website product specifically — and its deliberate limitation

The most useful finding in this research, quoted from their own page:

> *"We give you a proven design that you can personalize with your branding."*
>
> *"If you're looking for a lot of design freedom, Owner is not the right fit for your business."*

**Owner.com is not a website builder. It is a website *service*.** No drag-and-drop. No canvas. No section library.
Merchants get a proven layout, apply branding, and that is it. Setup takes "about a week or two" and is done *for*
them from a domain, a Google Business listing, and Yelp details.

Their reasoning is defensible: they analyzed *"nearly $1 billion in restaurant sales data"* and concluded that a
converting restaurant site *"looks a certain way."* Design freedom is how restaurants build sites that do not
convert. So they removed it.

### 3.1 What this means for us — the most important strategic point in this document

**The MockBuilder spec is a *more ambitious* product than Owner.com's website, not a copy of it.** 17 section kinds,
drag-and-drop, multi-page, and a canvas is a category Owner.com explicitly declined to enter.

That is a genuine choice with two edges:

| | Builder (MockBuilder direction) | Service (Owner.com direction) |
|---|---|---|
| Merchant effort | Hours, and they must have taste | Minutes, none required |
| Conversion outcome | Variable — depends entirely on the merchant | Consistent, optimized |
| Support burden | High: "my site looks broken" | Low: nothing to break |
| Differentiation | Against Wix, which is free-ish and better at building | Against Toast/ChowNow, on results |
| Churn risk | They built it; they own the sunk cost | They can leave more easily |

**Recommendation: build the builder, sell the service.** The infrastructure plans support both, and the sequencing
is natural:

1. Generate a proven, converting site from the merchant's own POS data
   ([VISION-UNBOUNDED.md](VISION-UNBOUNDED.md) §2). This is the default path and the sales demo.
2. Ship starter templates that are already good ([PLAN-06](PLAN-06-FRONTEND-BUILDER.md) §4).
3. Let the merchants who *want* control have the canvas.

Most will never open it. The ones who do are the ones who would otherwise have chosen Wix. You capture both segments
with one product — and the guardrails in [PLAN-01](PLAN-01-INFRA-SECTION-CONTRACT.md) §3 (enum-constrained styling,
no free CSS, no `custom_html`) are what stop the freedom from producing bad sites.

## 4. What to copy

| Owner.com does | Copy it because | Where |
|---|---|---|
| **AI generation from business data** | Their "AI SEO" is largely *"we know what a restaurant page should contain"* applied automatically. **We have far better inputs than they do — the actual POS.** This is the single most copyable idea | [VISION](VISION-UNBOUNDED.md) §2 |
| **Automated SEO pages** | Programmatic per-item / per-cuisine / per-neighborhood pages. Claimed +30% SEO traffic in 28 days | [VISION](VISION-UNBOUNDED.md) §5.1 |
| **SEO as the headline benefit** | They lead with Google rankings, not with design. Merchants understand traffic | [PLAN-04](PLAN-04-INFRA-PUBLISH-ROUTING.md) §6 |
| **Done-for-you onboarding** | "About a week or two", they handle domain + listings. Removes the reason merchants stall | Ops, not code |
| **Continuous platform-wide improvement** | *"When we learn something new, we add it to your website right away"* — only possible if sites are structured data, not hand-built HTML. **Our section registry gives us this by construction** | [VISION](VISION-UNBOUNDED.md) §5.2 |
| **The branded app** | Their most-cited differentiator. This platform already ships React Native | [VISION](VISION-UNBOUNDED.md) §4 |
| **Marketing loop off order data** | Reviewers consistently name automated email/SMS as what separates Owner from ChowNow. Resend + Telnyx are already integrated here | [VISION](VISION-UNBOUNDED.md) §5.3 |
| **Smart Upsells** | Checkout-time item recommendations. Directly raises ticket size, and the order history to power it exists | Online-ordering, not builder |
| **Chargeback protection, 24/7 support** | Sold as part of the platform, not as the website. Frames the whole product as risk removal | Positioning |

## 5. What not to copy

- **Removing design control entirely.** Their weakness, and the space MockBuilder occupies. Guardrails, not a cage.
- **A 1–2 week human-assisted setup.** It does not scale and it is a hiring commitment. Automate it
  ([VISION](VISION-UNBOUNDED.md) §2) and keep humans for the merchants who want hand-holding.
- **Their pricing shape** (§6) — it is designed for a standalone product, not a POS add-on.
- **Building a separate ordering stack.** They had to. This platform already has one — **D1** says use it.

## 6. Pricing — and why it does not transfer

| Plan | Price | Terms |
|---|---|---|
| Flexible | **$249/mo** | + 5% restaurant fee per order. For lower online volume |
| Flat Rate | **$499/mo** | No restaurant fees. For $5k+/mo in online orders |

Month-to-month, no contract. Guests pay a 5% order support fee on both. Every feature is included on both tiers —
website, ordering, branded app, SEO pages, loyalty, AI marketing, catering, migration, chargeback protection, 24/7
support. **No feature gating whatsoever.**

**The relevant lesson for B9 is that lesson, not the numbers.** Owner.com gates on *volume*, never on *capability* —
because a restaurant that cannot use the marketing tools does not grow, and a restaurant that does not grow churns.

Applied here ([PLAN-00](PLAN-00-GENERAL.md) §4.1): **every tier gets the builder.** Tiers set quotas — page count,
asset storage, custom-domain eligibility — not features. A merchant on the lowest tier who cannot have a website is a
merchant who has no reason to stay.

The prices themselves do not transfer at all: $249–$499/mo is standalone-platform pricing for a product replacing
DoorDash commissions. Here the website is an attach to an existing POS subscription, and it should be priced as one.

## 7. Where this platform can beat them outright

Three things Owner.com structurally cannot do, because they integrate with a POS rather than being one:

1. **Real-time menu truth.** Owner.com syncs from the POS periodically and imperfectly — every POS integration is a
   lossy pipe. Here the website reads the same tables the terminal writes. 86 an item and it is gone from the site in
   under a minute, always, with no sync to fail. **This is the demo.**
2. **One content graph across website, app, kiosk, QR dine-in, digital signage, and printed menu.** They own the web
   and the app. This platform owns the whole in-store surface too, and `app/sites/[slug]/t/[token]/` already proves
   the QR path works.
3. **Attribution that closes.** They can attribute a campaign to an online order. This platform can attribute it to
   an online order *and* the in-store visit that followed, because both are rows in the same `orders` table. Nobody
   who is not the POS can measure that.

---

## Sources

- [Owner.com — homepage](https://www.owner.com/)
- [Owner.com — pricing](https://www.owner.com/pricing)
- [Owner.com — AI restaurant website builder](https://www.owner.com/restaurant-website-ai)
- [Sauce — Owner.com reviews](https://www.getsauce.com/post/owner-com-reviews)
- [Sacra — Owner revenue, valuation & funding](https://sacra.com/c/owner/)
- [Software Finder — Owner.com pricing & features](https://softwarefinder.com/retail/owner-com)
- [G2 — Owner.com features](https://g2.com/products/owner-com/features)
