# [HQ-DATA] `/manage/organizations` shows hardcoded KPIs and per-row metrics

**Surface:** DEXA HQ Admin portal, `app/manage/organizations/page.tsx`
**Type:** Data defect / placeholder content shipped to a live page
**Priority:** Medium — the page currently displays invented business figures
**Found during:** HQ portal design-system rollout, Family 2 (deliberately **not**
fixed there, per the redesign ticket's §7 behaviour freeze)

---

## Summary

The Organizations page presents fabricated numbers as if they were live data.
Four headline KPIs and three per-row metrics are hardcoded literals, not query
results. An HQ operator reading this page cannot tell which figures are real.

## Evidence

The four KPI tiles are literals with invented month-over-month deltas:

| Tile | Displayed value | Source |
|---|---|---|
| Total Partners | `1,234` | hardcoded; `+12.5% from last month` also hardcoded |
| Total Sales | `$2.4M` | hardcoded; `+8.2% from last month` |
| Avg. Conversion | `11.2%` | hardcoded; `+2.1% from last month` |
| Active Partners | `1,156` | hardcoded; `+5.3% from last month` |

These are contradicted by the table directly beneath them, which renders the
**two** organizations that actually exist in the local dataset. "1,234 total
partners" above a two-row table is the clearest symptom.

Three table columns are also placeholders, with the real expressions left
commented out in the source:

```tsx
// Sales
{/* ${org.sales.toLocaleString()} */}
$0
// Conversion
{/* <span>{org.conversions}%</span> */}
<span>0%</span>
// Growth — the arrow direction still reads the real `org.growth`
{org.growth > 0 ? <ArrowUpRight …/> : <ArrowDownRight …/>}
{/* {org.growth > 0 ? '+' : ''}{org.growth}% */}
<span>0%</span>
```

Note the Growth cell is half-wired: the **arrow** reads real `org.growth`, but
the **number** beside it is always `0%`. So a row can show a downward arrow next
to "0%".

## Why this was not fixed in the HQ rollout

The rollout ticket freezes behaviour: presentation only, no change to queries,
server actions or displayed values. Wiring these to real data would change what
the page reports — a data change inside a redesign diff, which §7 forbids.

The Family 2 conversion therefore ported every value verbatim, including the
deltas. One presentation-level change was made: the deltas lost their green
tint, because the design system reserves colour for real severity (D-03) and a
hardcoded "+12.5%" is not a severity signal. The literal text is unchanged.

## Proposed fix

1. Decide which of these metrics HQ actually wants. `sales`, `conversions` and
   `growth` are referenced on the row type but are not populated by
   `GetCarrierOrganizations` — confirm whether the data exists anywhere before
   building UI for it.
2. Derive the four KPIs from the real organization list (total, active) and from
   whatever revenue source is authoritative — not from literals.
3. Either implement the month-over-month comparison or drop the delta line.
   A fabricated trend is worse than no trend.
4. For any metric with no data source yet, render an explicit empty state
   (`—`, or "Not tracked") rather than `$0` / `0%`. A zero reads as a measured
   value; a dash reads as "unknown", which is the truth.
5. Fix the half-wired Growth cell so the glyph and the number come from the same
   value.

## Acceptance criteria

- [ ] No hardcoded business figure remains in `app/manage/organizations/page.tsx`
- [ ] Every displayed metric traces to a query, or renders an explicit unknown state
- [ ] KPI totals are consistent with the row count in the table beneath them
- [ ] Growth arrow direction and Growth value derive from one expression
- [ ] `grep -nE '1,234|\$2\.4M|11\.2%|1,156' app/manage/organizations/page.tsx`
      returns nothing

## Out of scope

- Any layout or styling change. Family 2 already converted this page to the
  design system; this ticket changes only where the numbers come from.
