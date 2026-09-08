# 10 — Analytics

`/brands/{brandId}/customer-analytics?locationId={loc}` — again, not under `/website/`.

![Analytics — tracking pixel configuration](../screenshots/21-analytics.png)

---

## 1. It is not analytics

Despite the name and the nav placement, this page shows **no data at all**. There are no charts, no visitor
counts, no traffic sources, no conversion funnels.

*"Update analytics integration settings for your website."*

It is a **tracking-pixel configuration form** — four ID fields and a Save button.

| Field | Placeholder | Purpose |
|---|---|---|
| **Facebook Pixel ID** | `1234567890` | Meta ads retargeting/conversions |
| **Google Analytics ID** | `G-` | GA4 measurement ID |
| **Google Tag Manager ID** | `GTM-` | GTM container |
| **TikTok Pixel ID** | `C4XXXXXXXXXXXXXXXXXX` | TikTok ads |

Single full-width blue **Save**. All four were empty in this account.

The placeholders double as **format documentation** — `G-`, `GTM-`, the `C4…` shape. A merchant pasting an
ID can see instantly whether they grabbed the right one. Nice touch, zero cost.

---

## 2. Why this design is defensible

Owner deliberately does **not** rebuild analytics. They give the merchant (or the merchant's marketing agency)
the four hooks that matter and get out of the way:

- The merchant's ad agency already lives in Meta Ads Manager and GA4.
- Owner's own order/revenue reporting lives under **Reports**, where it belongs and where it is far more
  accurate than pageview analytics.
- Building dashboards nobody trusts is expensive; four text inputs are not.

The split is: **Reports = your business. Analytics = your marketing pixels.** Two different audiences.

---

## 3. Parity notes

- This is a ~1-day feature and should be near the top of any parity list on effort/value.
- Four fields, brand-scoped, injected into the public site's `<head>`.
- Consider adding **Google Search Console verification** and a generic `<head>` snippet slot — both are
  frequent restaurant-marketing asks that Owner does not cover.
- **Do not name it "Analytics"** in our nav if it shows no data. `Tracking` or `Marketing pixels` is honest and
  avoids the support ticket where a merchant clicks Analytics expecting visitor numbers. Owner's naming here is
  the one clear misstep in this teardown.

---

**Prev:** [09 — Forms](09-forms.md) · **Next:** [11 — Customer support](11-customer-support.md)
