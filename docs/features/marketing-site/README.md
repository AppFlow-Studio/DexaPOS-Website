# Marketing Site

Public marketing site at `dexaposai.com` — routes in [`app/(marketing)/`](../../../app/(marketing)/), components in [`components/marketing/`](../../../components/marketing/), styles in `app/(marketing)/marketing.css`.

Not to be confused with `/sites/*` (per-merchant public storefronts) or `/dashboard/*` (merchant app).

| Document | Scope |
| --- | --- |
| [FEATURE-2026-08-24-MARKETING-SITE-MOTION-AND-RESPONSIVE-FIXES.md](FEATURE-2026-08-24-MARKETING-SITE-MOTION-AND-RESPONSIVE-FIXES.md) | Scroll/hover motion polish, mid-width header overlap, invisible-text bug, color consistency (from Aug 17 2026 1:1 feedback) |

## Key context

- **Motion primitives already exist:** `components/marketing/Reveal.tsx` (IntersectionObserver fade-in) and `components/marketing/AnimatedCounter.tsx` (scroll-triggered count-up). Reuse these — do not write new ones.
- **Known trap:** `.reveal` is `opacity: 0` and only `.reveal.in` makes it visible. Markup that hardcodes `className="reveal in"` never animates; markup with `reveal` and no `in` is permanently **invisible**. See the feature doc.
- **Nav is CMS-driven** via `data-cms-*` attributes backed by `lib/cms/site-settings-data`. Preserve those attributes when editing nav markup.
