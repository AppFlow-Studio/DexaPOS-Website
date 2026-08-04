# Ticket: Info-Icons Phase 4 — Ops Surfaces (Platform Fees, Devices, Health, Disputes, Audit, Reports)

**Depends on:** Phase 1 shipped and verified  
**Reuses:** `InfoIcon` component at `components/ui/info-icon.tsx`  
**Estimated attachment points:** ~80 across 6 surfaces

---

## Context

Phase 4 covers the remaining operational admin surfaces not addressed in Phases 1–3.
These are smaller, more focused surfaces — each has 8–25 tooltip attachment points.
They can be shipped in any order and can be parallelised across developers.

---

## Surface A — Platform Fees (`app/manage/platform-fees/`)

**Files:** `app/manage/platform-fees/page.tsx`, `components/platform-fees/kpi-strip.tsx`,
`components/platform-fees/merchant-fees-table.tsx`, `components/platform-fees/composition-card.tsx`,
`components/platform-fees/fee-trend-chart.tsx`, `components/platform-fees/payment-fee-table.tsx`

> ⚠️ TASK 2 consistency: all fee labels in this surface must read **Net fee** / **Net deposit**.
> The existing page already uses "Card surcharge" and "Net platform fee" labels — verify these
> match or update them alongside adding tooltips.

**KPI Strip (extend `components/platform-fees/kpi-strip.tsx` to support `tip?`)**
- [ ] Net platform fee — *Total platform fees collected (net of refunds) across all merchants in the selected period. Reconciles with TSYS settlement reports.*
- [ ] Card surcharge — *Gross dual-pricing fee billed to cardholders before any refund credits. This is the fee added to the transaction at point of sale.*
- [ ] Refunded — *Platform fee credits issued when a payment was refunded. Reduces net platform fee.*
- [ ] Avg fee / payment — *Mean net platform fee per captured payment. Useful for benchmarking against expected fee rates.*
- [ ] Active merchants — *Merchants with at least one captured payment in the selected period who generated fee revenue*

**Fee Trend chart (`components/platform-fees/fee-trend-chart.tsx`)**
- [ ] Chart title — *Daily net platform fee collected over the selected period. Spikes on weekends or holidays are expected in restaurant-heavy portfolios.*
- [ ] Y-axis label — *Net fee amount in USD*

**Composition card (`components/platform-fees/composition-card.tsx`)**
- [ ] Card title — *Shows how the gross card surcharge breaks down into net collected fee and refunded credits*
- [ ] Gross Card Surcharge bar — *Total dual-pricing fee added to cardholder transactions*
- [ ] Refunded bar — *Portion of surcharge returned due to refunded orders*
- [ ] Net fee label — *Gross surcharge minus refunded credits. This is the amount actually retained.*

**Merchant Fees table (`components/platform-fees/merchant-fees-table.tsx`)**
- [ ] Merchant column — *Business name. Click to open per-location and per-payment breakdown.*
- [ ] Payments — *Number of captured card payments that incurred a platform fee*
- [ ] Gross Surcharge — *Total dual-pricing fee billed across all this merchant's card payments*
- [ ] Refunded — *Fee credits for refunded payments*
- [ ] Net fee — *Gross surcharge minus refunded credits: the amount retained for this merchant*
- [ ] Avg fee % — *Effective fee rate across all payments (Net fee ÷ total card revenue)*

**Payment fee detail table (`components/platform-fees/payment-fee-table.tsx`)**
- [ ] Net fee — *Platform fee on the order subtotal for this individual payment*
- [ ] Net fee on tip — *Platform fee applied to the gratuity for this payment*
- [ ] Net fee after refund — *Total fees retained after subtracting any refund credits*
- [ ] Net deposit — *Amount sent to the merchant's bank for this payment (gross charge minus net fee)*

---

## Surface B — Devices Registry (`app/manage/devices/`)

**Files:** `app/manage/devices/page.tsx`, `app/manage/devices/overview/page.tsx`,
`app/manage/devices/[deviceId]/page.tsx`, `app/manage/devices/components/DeviceRegistryMetricCard.tsx`

**`DeviceRegistryMetricCard.tsx` — extend to accept `tip?: string`**
- [ ] Total Devices — *All POS terminals registered on the platform regardless of current status*
- [ ] Online Now — *Devices with an active connection in the last 5 minutes*
- [ ] Offline — *Devices that last reported more than 5 minutes ago. May be powered off, out of range, or experiencing connectivity issues.*
- [ ] Error State — *Devices that reported a fault code in their last heartbeat. Requires investigation.*
- [ ] Low Battery — *Devices reporting less than 20% battery charge*
- [ ] Pending Update — *Devices with an available software version that has not yet been installed*

**Device list table (`app/manage/devices/page.tsx`)**
- [ ] Serial # — *Hardware serial number unique to this physical terminal*
- [ ] Model — *Terminal manufacturer and model (e.g. Dejavoo Z11, PAX A920)*
- [ ] Status — *Online / Offline / Error / Idle — see metric card definitions above*
- [ ] Category — *Terminal type classification (e.g. countertop, handheld, kiosk)*
- [ ] Location — *The merchant location this device is assigned to*
- [ ] Merchant — *The merchant who owns this device*
- [ ] Last Seen — *Timestamp of the device's most recent heartbeat to the Dexa backend*
- [ ] Storage — *Available local storage on the device. Low storage may cause app instability.*
- [ ] Battery — *Last reported charge level*

**Device detail page (`app/manage/devices/[deviceId]/page.tsx`)**
- [ ] Stability Score — *Composite reliability score (0–100). Factors in uptime, crash frequency, and sync lag. Below 70 = device needs attention.*
- [ ] Uptime % — *Fraction of scheduled operating hours the device was online*
- [ ] Crash Count — *Number of POS app crashes logged in the period*
- [ ] Last Sync — *When the device last successfully synced menu, orders, and settings with the Dexa backend*
- [ ] Software Version — *Currently running POS app version on this terminal*
- [ ] TPN — *Terminal Processing Number: the acquirer's unique identifier for this specific terminal*

---

## Surface C — Merchant Health Dashboard (`app/manage/health/page.tsx`)

**Health grid cards**
- [ ] Page title / intro — *Health scores give each merchant a single number (0–100) summarising their operational status. Below 60 is at risk; below 40 warrants proactive outreach.*
- [ ] Health Score circle — *Composite score combining revenue trend (40%), void rate (20%), device uptime (20%), and support escalations (20%)*
- [ ] Revenue metric on card — *30-day revenue for this merchant*
- [ ] Orders metric on card — *30-day completed order count*
- [ ] Health tier badges — *Healthy (≥80): operating normally. Watch (60–79): monitor for decline. At Risk (<60): proactive intervention recommended.*

**Health Score Legend card**
- [ ] Each score tier (Healthy / Watch / At Risk) — explain the thresholds and what action is recommended

**Health Score Factors card**
- [ ] Revenue Trend (40% weight) — *How revenue this period compares to the prior equivalent period. Declining trend reduces the score proportionally.*
- [ ] Void Rate (20% weight) — *Higher void rate = lower contribution. Threshold: >5% starts deducting.*
- [ ] Device Uptime (20% weight) — *Average uptime across all devices for this merchant. Devices offline more than 10% of operating hours reduce the score.*
- [ ] Support Escalations (20% weight) — *Open P1/P2 support tickets in the last 30 days. Each unresolved ticket reduces the contribution.*

---

## Surface D — Platform Disputes (`app/manage/disputes/page.tsx`)

This page renders `ChargebacksSection` from Phase 1 with a page-level summary strip.

**Page-level KPI strip**
- [ ] Total Open — *Chargebacks in Notified or Under Review status that still require action*
- [ ] Urgent — *Open chargebacks whose defense deadline is within 72 hours*
- [ ] Under Review — *Chargebacks where evidence has been requested but not yet submitted*
- [ ] Total $ in Dispute — *Total dollar value of all open chargebacks. Represents maximum potential loss if all are lost.*

> The embedded `ChargebacksSection` already has tooltips from Phase 1. Only the page-level strip needs addition here.

---

## Surface E — Platform Audit Logs (`app/manage/audit-logs/`)

**Files:** `app/manage/audit-logs/page.tsx`, `app/manage/audit-logs/impersonation/page.tsx`

**Main audit log page** (the page-level `AuditLogSection` already has Phase 1 tooltips; only page-level additions needed)
- [ ] Page-level filter: Severity badge — *Info: routine access. Warning: unusual but not necessarily malicious. Critical: high-risk action (bulk export, delete, impersonation).*
- [ ] Action Category filter — *The class of action: read (viewed), write (mutated data), export (downloaded), auth (login/impersonation)*

**Impersonation audit trail (`app/manage/audit-logs/impersonation/page.tsx`)**
- [ ] Impersonator — *The HQ admin who initiated the impersonation session*
- [ ] Target User — *The merchant account that was impersonated*
- [ ] Duration — *How long the impersonation session lasted*
- [ ] Actions Taken — *Number of actions performed while impersonating. Impersonation sessions are fully logged for compliance.*
- [ ] Reason — *Stated reason for the impersonation, required before a session can begin*

---

## Surface F — Tax Reports (`app/manage/reports/tax/page.tsx`)

- [ ] Taxable Sales — *Revenue from items subject to sales tax after discounts are applied*
- [ ] Tax Collected — *Sales tax billed to customers in the period*
- [ ] Exempt Sales — *Revenue from tax-exempt items or tax-exempt customers*
- [ ] Effective Tax Rate — *Weighted average actual tax rate: Tax Collected ÷ Taxable Sales. May differ from configured rates due to exempt items.*
- [ ] Location filter — *Narrow the tax report to a single location. Each location may have different tax configurations.*
- [ ] Table columns: Date, Location, Merchant, Taxable Amount, Tax Rate, Tax Collected, Exempt Amount

---

## Acceptance Criteria

- [ ] All attachment points in Surfaces A–F have working plain-language tooltips
- [ ] `components/platform-fees/kpi-strip.tsx` extended to support `tip?` on each cell (separate file from the merchant `KpiStrip` — both need updating)
- [ ] `DeviceRegistryMetricCard.tsx` extended to support `tip?`
- [ ] Platform Fees surface uses "Net fee" / "Net deposit" everywhere (zero legacy surcharge label text in tooltips)
- [ ] Each surface spot-checked independently before that surface is marked done
- [ ] No new tooltip components introduced — only `InfoIcon` from `components/ui/info-icon.tsx`

---

## Implementation Notes

- Surfaces D and E largely **reuse Phase 1 components** already tooltipped. Only the page-level
  additions listed above are needed — do not re-tooltip the embedded sections.
- Surface A (Platform Fees) has two separate `KpiStrip` implementations:
  - `components/platform-fees/kpi-strip.tsx` — used by the platform fees page
  - `app/manage/merchants/[merchantId]/components/sections/KpiStrip.tsx` — used by merchant detail (Phase 3)
  Both share the same extension pattern: add optional `tip?: string` to the cell interface and render
  `<InfoIcon tip={tip} />` inline with the label, no-op when omitted.
- Surface C (Health Dashboard) is a single-file page — straightforward to update.
- Surfaces can be shipped in any order and parallelised — they have no cross-surface dependencies.
