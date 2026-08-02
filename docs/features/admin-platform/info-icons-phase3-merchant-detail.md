# Ticket: Info-Icons Phase 3 — Merchant Detail Pages (`/manage/merchants/`)

**Depends on:** Phase 1 shipped and verified  
**Reuses:** `InfoIcon` component at `components/ui/info-icon.tsx`  
**Estimated attachment points:** ~200 (merchants list + full detail page with all tabs)

---

## Context

The merchant detail page at `/manage/merchants/[merchantId]/` is the second-largest analytics
surface in the admin UI. Carriers and HQ staff spend most of their time here when
onboarding or troubleshooting a merchant. Many of the metrics — health scores, risk strips,
KPI cells, billing terms — have no explanation inline.

This ticket covers:
1. The merchant **list page** (`/manage/merchants/page.tsx`) — stats + table
2. The merchant **detail page** (`/manage/merchants/[merchantId]/page.tsx`) — all tabs

---

## Surface 1 — Merchants List (`app/manage/merchants/page.tsx`)

**Summary stat cards**
- [ ] Total Merchants — *All merchants registered on the platform regardless of status*
- [ ] Active — *Merchants who processed at least one payment in the last 30 days*
- [ ] Inactive — *Registered merchants with no payment activity in the last 30 days*
- [ ] Onboarding — *Merchants in progress through the setup flow who have not yet taken a live payment*

**Merchant list table columns**
- [ ] Name — *Legal business name as registered. Click to open the merchant detail page.*
- [ ] Status — *Current lifecycle status: Active (live), Inactive (dormant), Onboarding (setup in progress), Suspended (access blocked)*
- [ ] Revenue (30d) — *Total card and cash revenue across all locations in the last 30 calendar days*
- [ ] Orders — *Number of completed orders in the same 30-day window*
- [ ] Health Score — *Composite merchant health score (0–100) factoring in revenue trend, device uptime, void rate, and support ticket volume. Below 60 = at risk.*
- [ ] Last Activity — *Timestamp of the most recent payment or order on any location of this merchant*

---

## Surface 2 — Merchant Detail Tabs

### `OverviewTab.tsx`

**KPI Strip (`sections/KpiStrip.tsx` cells — extend `KpiCell` interface to support `tip?: string`)**
- [ ] GPV (30d) — *Gross Payment Volume: total revenue across all locations in the last 30 days*
- [ ] Orders (30d) — *Total completed orders across all locations*
- [ ] Avg Ticket — *Mean order value (total revenue ÷ order count)*
- [ ] Tip Rate — *Tips as a percentage of pre-tip order subtotals*
- [ ] Void Rate — *Voids as a percentage of total orders. Above 5% warrants investigation.*
- [ ] Active Locations — *Locations with at least one order in the last 7 days out of all registered locations*
- [ ] Active Devices — *POS terminals that reported activity in the last 7 days*

**`RiskStrip.tsx` (risk indicator cards)**
- [ ] Risk Score — *Composite score (0–100) combining chargeback rate, void rate, revenue decline, and support escalations. Above 70 = elevated risk.*
- [ ] Chargeback Rate — *Chargebacks as a percentage of captured payments. Card networks flag merchants above 1% for remediation.*
- [ ] Revenue Trend — *Direction and magnitude of revenue change vs the previous equivalent period*
- [ ] Support Tickets — *Open support tickets for this merchant in the current month*

**`OnboardingStatusCard.tsx`**
- [ ] Each onboarding stage checkpoint — *Status of this setup step: complete, in-progress, or not started*

---

### `AnalyticsTab.tsx`

**Financial KPIs row**
- [ ] Gross Revenue — *Total billed amount including tips, before fees or refunds*
- [ ] Net Revenue — *Gross revenue minus refunds*
- [ ] Refund Amount — *Total value of refunds issued in the period*
- [ ] Refund Rate — *Refunds as a percentage of gross revenue*

**Sales by Date chart**
- [ ] Chart title / date axis — *Daily revenue for the selected period. Each bar or point is the total collected that calendar day.*

**Payment Methods pie chart**
- [ ] Chart title — *Breakdown of revenue by payment method. A high cash share may indicate terminal issues or customer preference.*
- [ ] Each slice label (Card, Cash, Other)

**Transaction Summary table**
- [ ] Status column — *Payment outcome: Captured (funds collected), Refunded, Voided, Declined*
- [ ] Count column — *Number of transactions in this status*
- [ ] Amount column — *Total dollar value of transactions in this status*

---

### `TransactionsTab.tsx`

- [ ] Table: Transaction ID, Date, Amount, Method, Card, Tip, Status — use same tooltip text as Phase 1 transactions table

---

### `OrdersTab.tsx`

- [ ] Order #, Date, Status, Items, Subtotal, Tax, Tip, Discount, Total, Staff, Location — tooltip each column header

---

### `TipsTab.tsx`

- [ ] Tip Total KPI — *Total gratuity collected in the period across all payment methods*
- [ ] Tip Rate KPI — *Average tip as a percentage of pre-tip order value*
- [ ] Tip Distribution chart — *Distribution of tip percentages chosen by customers. Peaks show which tip options are most commonly selected.*
- [ ] Table columns: Date, Order #, Pre-Tip Amount, Tip, Tip %, Staff

---

### `PaymentsTab.tsx` / `sections/PaymentsTable.tsx`

- [ ] Table columns: same as Phase 1 PaymentsLedger (Payment ID, Date, Method, Card, Auth, Batch, Total, Status, Settled, TSYS) — reuse same tooltip text

---

### `InvoicesTab.tsx`

- [ ] Invoice #, Issued, Due, Amount, Status, Type — tooltip each header

---

### `CashDrawersTab.tsx`

- [ ] Opening Balance — *Cash in the drawer at the start of the shift*
- [ ] Closing Balance — *Cash counted at end of shift*
- [ ] Net Cash — *Closing minus opening balance. Should match cash sales minus cash payouts for the shift.*
- [ ] Variance — *Difference between expected cash (calculated from transactions) and actual counted cash. A negative variance means money is missing.*
- [ ] Cash In / Cash Out — *Manual cash additions (e.g. change fund) and removals (e.g. drops to safe)*

---

### `StaffTab.tsx`

- [ ] Table columns: Name, Role, PIN Status, Clock-in Count, Hours (30d), Revenue (30d), Void Rate
- [ ] PIN Status — *Whether this staff member has an active POS PIN. Staff without a PIN cannot log in to the POS tablet.*
- [ ] Hours (30d) — *Total clocked hours this staff member logged in the last 30 days*
- [ ] Revenue (30d) — *Total revenue attributed to orders this staff member processed*
- [ ] Void Rate — *Voids as a percentage of this staff member's total orders. Compare against merchant average to spot outliers.*

---

### `SchedulesTab.tsx`

- [ ] Published / Draft status badge — *Published schedules are visible to staff on the POS app. Draft schedules are only visible to managers.*
- [ ] Hours Scheduled — *Total hours across all shifts in this schedule period*
- [ ] Coverage Gap indicator — *A shift period with no staff scheduled during normally busy hours*

---

### `TaxReportTab.tsx`

- [ ] Taxable Sales — *Revenue subject to sales tax after discounts*
- [ ] Tax Collected — *Total tax billed to customers in the period*
- [ ] Exempt Sales — *Revenue from items or customers marked tax-exempt*
- [ ] Effective Tax Rate — *Average actual tax rate across all taxable orders (Tax Collected ÷ Taxable Sales)*
- [ ] Table columns: Date, Location, Taxable Amount, Tax Rate, Tax Collected, Exempt Amount

---

### `DevicesTab.tsx`

- [ ] Table columns: Serial, Model, Terminal Type, Status, Battery, Last Seen, Location, Software Version
- [ ] Status badge — *Online = currently connected. Offline = not reachable. Error = reported a fault. Idle = connected but no recent activity.*
- [ ] Battery — *Last reported charge level. Below 20% = low; below 10% = critical.*
- [ ] Last Seen — *When the device last sent a heartbeat to the Dexa backend*

---

### `sections/LuqraTransactionsTable.tsx`

- [ ] Luqra Transaction ID — *TSYS's internal identifier for this payment. Used to cross-reference Dexa and TSYS records during reconciliation.*
- [ ] Net Deposit — *Amount deposited into the merchant's bank account for this payment after fees. Reconciles line-for-line with TSYS settlement reports.*
- [ ] Net fee — *Platform fee charged on this payment (replaces any "Dual Pricing Fee" labels)*
- [ ] TSYS Status — *Whether TSYS has confirmed capture and settlement of this payment*

### `sections/LuqraDepositsTable.tsx`

- [ ] Deposit Amount — *Total funds transferred to the merchant's bank in this TSYS settlement run*
- [ ] Net Deposit — *Deposit amount after all platform fees have been deducted*
- [ ] Settlement Date — *Date the funds were credited to the merchant's bank account*
- [ ] Payment Count — *Number of individual payments included in this deposit batch*

### `sections/LuqraBatchesTable.tsx`

- [ ] Same as Phase 1 Batch Reconciliation — reuse tooltip text

### `sections/DisputesSection.tsx`

- [ ] Same as Phase 1 Chargebacks — reuse tooltip text

### `sections/MidsSection.tsx`

- [ ] MID — *Merchant Identification Number: the unique ID assigned by the card network acquirer to identify this merchant in payment processing*
- [ ] Acquirer — *The bank or payment processor that manages this MID on behalf of the merchant*
- [ ] Status — *Active = accepting payments. Suspended = card network has temporarily blocked processing. Closed = MID decommissioned.*
- [ ] Processing Limit — *Maximum monthly volume allowed by the acquirer before additional review is required*

### `BillingTab.tsx` / `SubscriptionTab.tsx`

- [ ] Plan — *The subscription tier this merchant is on, determining feature access and billing rate*
- [ ] Billing Cycle — *Whether the merchant is billed monthly or annually*
- [ ] MRR — *Monthly Recurring Revenue: the predictable monthly subscription revenue from this merchant*
- [ ] Next Invoice Date — *When the merchant's next billing charge will be issued*
- [ ] Usage Fees — *Variable charges above the base plan (e.g. per-transaction fees, overage charges)*

---

## Acceptance Criteria

- [ ] All attachment points above have working plain-language tooltips
- [ ] `KpiStrip` (`components/sections/KpiStrip.tsx`) has `tip?: string` added to `KpiCell` interface and renders `<InfoIcon />` inline — no behavior change if `tip` is omitted
- [ ] "Net fee" / "Net deposit" wording used everywhere (zero legacy "Dual Pricing Fee" or "Card Surcharge" label text visible in tooltips)
- [ ] Merchant detail page spot-checked by someone other than implementer (all tabs opened) before close

---

## Implementation Notes

- `KpiStrip` at `app/manage/merchants/[merchantId]/components/sections/KpiStrip.tsx` is the
  merchant-scoped one. The platform-fees page uses a separate `components/platform-fees/kpi-strip.tsx`.
  Both need the `tip` extension but are separate files — update both.
- Many tabs are behind a tab router — verify each tab renders after clicking before marking complete.
- `LuqraTransactionsTable` and related TSYS components: use "Net fee" / "Net deposit" in tooltips,
  not "Card Surcharge" or "Dual Pricing Fee" — consistency with TASK 2.
