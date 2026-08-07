# Ticket: Info-Icons Phase 2 — Analytics Hub (`/manage/analytics/`)

**Depends on:** Phase 1 (`/manage/transactions/`) shipped and verified  
**Reuses:** `InfoIcon` component at `components/ui/info-icon.tsx`  
**Estimated attachment points:** ~130

---

## Context

Phase 1 shipped the reusable `InfoIcon` tooltip component and wired it across the full
`/manage/transactions/` surface. Phase 2 applies the same pattern to the analytics hub
at `/manage/analytics/page.tsx` and its 15 sub-components under
`app/manage/analytics/components/`.

The analytics tab is the highest-density surface after transactions. Most merchants
and carriers visiting this page encounter unfamiliar computed metrics (GPV, concentration
risk, churn score, KDS throughput) with no explanation — Phase 2 closes that gap.

---

## Scope

### `app/manage/analytics/page.tsx` — Platform KPI strip + main page sections

**KPI Cards (top strip — `usePlatformKPIs`)**
- [ ] Total GPV (30d) — *Gross Payment Volume: total card and cash revenue across all merchants in the last 30 days*
- [ ] Active Merchants (7d) — *Merchants who processed at least one payment in the last 7 days*
- [ ] Total Orders (30d) — *Number of completed orders across all locations and merchants*
- [ ] Avg Order Value — *Mean transaction value (total revenue ÷ order count)*
- [ ] Active Devices (7d) — *POS terminals that reported activity in the last 7 days*
- [ ] Total Locations — *Number of registered merchant locations across the platform*
- [ ] Void Rate — *Percentage of orders cancelled before capture, platform-wide*
- [ ] New Merchants — *Merchants who completed onboarding and went live this period*
- [ ] Card Split — *Percentage of revenue collected via card vs cash*

**30-Day Revenue Trend chart**
- [ ] Chart title — *Daily platform-wide revenue for the last 30 days. Toggle between GPV (dollar amount) and Order Count (number of transactions) using the selector.*
- [ ] GPV metric toggle label — *Gross Payment Volume: total revenue including tips*
- [ ] Order Count metric toggle label — *Total number of completed payment transactions*

**GPV Concentration Risk section**
- [ ] Section title / Lorenz curve — *Shows how evenly revenue is distributed across merchants. A curve far from the diagonal means a few merchants generate most of the revenue — a concentration risk if they churn.*
- [ ] Whale Merchants table: Merchant, GPV (30d), % of Total, Locations, Avg Ticket, Transactions
- [ ] "Whale" badge — *Merchant whose 30-day GPV exceeds $100,000. Losing a whale merchant has an outsized impact on platform revenue.*

**Churn Warning Radar table**
- [ ] Section title — *Merchants showing early signs of churning: declining revenue, reduced activity, or support escalations. Act early — churn is easier to prevent than reverse.*
- [ ] Table columns: Merchant, Severity, Revenue Δ%, Orders Δ%, Last Order, Warning Signals, Action

---

### `app/manage/analytics/components/` — 15 sub-components

#### `VoidRefundIntelligence.tsx`
- [ ] Section title — *Detects merchants and staff members with unusually high void or refund rates compared to the platform average. Elevated rates may indicate staff error, training gaps, or intentional fraud.*
- [ ] Platform Void Rate KPI — *Percentage of all orders that were voided (cancelled before card capture)*
- [ ] Platform Refund Rate KPI — *Percentage of captured payments that were subsequently refunded*
- [ ] Void Anomalies table: Merchant, Void Rate, Void Count, Δ vs Platform, Is Anomaly
- [ ] Void Reasons bar chart — *Breakdown of the most common stated reasons for voids across all merchants*
- [ ] Top Voiding Staff table: Staff, Voids, Void Rate, Merchant

#### `MerchantOnboardingFunnel.tsx`
- [ ] Section title — *Tracks how many merchants progress through each onboarding stage. Stages where counts drop significantly indicate friction or blockers in the setup process.*
- [ ] Each funnel stage label (Invited, Business Info, MID Assigned, First Device, First Payment, etc.)
- [ ] Conversion rate between stages — *Drop-off rate from the previous stage to this one*

#### `MerchantActivationTimeline.tsx`
- [ ] Section title — *Distribution of how long it takes a merchant to go from invitation to first live payment. Median time is the most useful benchmark — outliers on the right indicate onboarding delays.*
- [ ] Histogram x-axis label (Days to Activate) — *Number of calendar days from merchant invite to first captured payment*
- [ ] Median / P90 annotations on chart

#### `PaymentMethodMix.tsx`
- [ ] Section title — *Breakdown of revenue by payment method across all merchants. Card dominance is expected; a rising cash share may indicate terminal issues or intentional cash preference.*
- [ ] Each payment method slice label (Card, Cash, etc.)

#### `VoidRefundIntelligence.tsx` *(already listed above)*

#### `DiscountAbuseDetection.tsx`
- [ ] Section title — *Flags discount codes applied at unusually high rates or by a small number of staff members. Spikes may indicate staff comping items without authorization.*
- [ ] Anomaly Score column — *Computed score (0–100) representing how far this discount pattern deviates from normal usage. Above 70 = review recommended.*
- [ ] Application Count, Application Rate, Avg Discount Amount columns

#### `StaffLaborAnalytics.tsx`
- [ ] Section title — *Compares revenue generated per staff hour across merchants and locations. Useful for identifying understaffed shifts (high revenue/hour) or overstaffed ones (low revenue/hour).*
- [ ] Revenue Per Staff Hour — *Total revenue divided by total clock-in hours for the period*
- [ ] Covers Per Hour — *Number of orders (covers) completed per staff hour worked*
- [ ] Avg Shift Duration — *Mean length of a staff clock-in to clock-out session*

#### `KDSPerformance.tsx`
- [ ] Section title — *Kitchen Display System throughput: how quickly kitchen staff receive and complete orders. High prep time means customers wait longer; a sudden increase may indicate a kitchen bottleneck.*
- [ ] Avg Prep Time — *Median time from order placed to KDS "complete" tap, in minutes*
- [ ] Items/Hour — *Number of individual menu items completed by the kitchen per hour*
- [ ] Completion Rate — *Percentage of orders completed via KDS vs voided or abandoned before completion*

#### `DeviceStabilityIndex.tsx`
- [ ] Section title — *Composite score for POS terminal reliability. Factors in crash frequency, uptime %, offline incidents, and sync lag. Score below 70 indicates a device that needs attention.*
- [ ] Stability Score — *Weighted composite of uptime, crash rate, and sync reliability (0–100)*
- [ ] Uptime % — *Fraction of scheduled operating hours the device was online and responsive*
- [ ] Crash Count — *Number of terminal application crashes logged in the period*
- [ ] Offline Incidents — *Number of times the device lost connectivity for more than 5 minutes*

#### `TerminalUtilizationHeatmap.tsx`
- [ ] Section title — *Shows which hours of the day and days of the week terminals are busiest. Use this to schedule maintenance windows in low-activity periods and to staff appropriately for peaks.*
- [ ] Heatmap legend (Low → High) — *Color intensity represents transaction volume relative to the busiest cell in this period*

#### `FleetHealthDashboard.tsx`
- [ ] Section title — *Hierarchical view of merchant → location → device health. Red = device offline or in error state. Yellow = warning (low battery, pending update). Green = operating normally.*
- [ ] Health tier badges: Healthy / Warning / Critical

#### `PaymentTerminalHealthMonitor.tsx`
- [ ] Section title — *Real-time and recent health metrics for all registered payment terminals. Monitors battery, connectivity, software version, and last heartbeat.*
- [ ] Battery Level — *Last reported battery percentage from the device*
- [ ] Last Heartbeat — *When the terminal last checked in with the Dexa backend*
- [ ] Software Version — *POS app version running on the terminal*
- [ ] Pending Updates count — *Terminals with an available software update not yet installed*

#### `AuditLogActivityMonitor.tsx`
- [ ] Section title — *Platform-wide view of admin audit activity across all merchants. Spikes in activity may indicate a bulk export or unusual access pattern worth reviewing.*
- [ ] Events/Hour — *Rate of admin actions logged in the current window*
- [ ] Unique Users — *Number of distinct admin accounts that took action in this period*
- [ ] Top Actions bar — *Most frequently performed admin actions*

#### `OrderTypeIntelligence.tsx`
- [ ] Section title — *Breaks down orders by service type (dine-in, takeout, delivery, online). Useful for understanding channel mix and staffing needs.*
- [ ] Each order type label with count and revenue share

#### `MultiLocationComparison.tsx`
- [ ] Section title — *Side-by-side comparison of all locations within a merchant, or across merchants. Sort by any column to find top and bottom performers.*
- [ ] Table columns: Location, Revenue, Orders, Avg Ticket, Void Rate, Staff Hours, Revenue/Hour

#### `LocationDensityInsights.tsx`
- [ ] Section title — *Geographic distribution of merchant locations. Clusters indicate market density; gaps indicate expansion opportunities or coverage risk.*
- [ ] Merchants per region metric — *Number of active merchants operating within a geographic area*

---

## Acceptance Criteria

- [ ] Every attachment point above has a working, plain-language tooltip
- [ ] All tooltips reuse `InfoIcon` from `components/ui/info-icon.tsx` — no new tooltip components
- [ ] "Covers per hour" explicitly explained (this was the metric that confused the room)
- [ ] Analytics page spot-checked by someone other than implementer before close
- [ ] No regressions to existing analytics data display

---

## Implementation Notes

- The analytics page renders components lazily inside Tabs — test each tab individually
- `KpiStrip` (used in analytics sub-components) does not currently accept a `tip` prop — extend its `KpiCell` interface to accept optional `tip?: string` and render `<InfoIcon />` inline with the label, same pattern as `PaymentsLedger.tsx` Tile
- Analytics sub-components are client components — `InfoIcon` works as-is (already `'use client'`)
