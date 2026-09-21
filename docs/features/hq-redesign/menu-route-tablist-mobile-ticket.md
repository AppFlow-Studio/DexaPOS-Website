# HQ menu route: tab strip is unreachable at phone widths

**Found during:** HQ design-system rollout, Family 3f (merchant menu route).
**Filed because:** §7 of the rollout spec — a functional defect found during
conversion gets its own ticket, never a fix inside a redesign PR.

**Not caused by the rollout.** Verified by stashing the Family 3 changes: the
markup below is byte-identical on the pre-rollout baseline, and the rollout
diff for this file touches only an import line, never `TabsList`.

## Symptom

At a 375px viewport, `/manage/merchants/[merchantId]/menu/[menuId]` renders its
tab strip 490px wide inside a 295px column. The strip is **clipped, not
scrolled**, so the right-hand tabs cannot be reached on a phone at all.

With a `?location=` selected the route shows five tabs — Overview,
Categories & Items, Schedules, Settings, OrderOut — and **OrderOut is entirely
unreachable**; Settings is partly cut. Without a location there are four tabs
and the overflow is smaller but still present.

## Measurement

At 375px, walking up from the offending element:

| Element | width | scrollWidth | overflow-x |
|---|---:|---:|---|
| `TabsList` (`inline-flex w-fit`) | 490 | 490 | visible |
| its column | 295 | 490 | visible |
| page body `space-y-6 p-6` | 343 | 514 | visible |
| layout scroll container | 375 | 530 | **hidden** |

Nothing between the strip and the layout scrolls, so the layout's
`overflow-x-hidden` simply clips the excess. `document.documentElement` reports
zero overflow, which is why a page-level overflow check does not catch this —
the content is lost rather than scrollable.

## Source

`app/manage/merchants/[merchantId]/menu/[menuId]/page.tsx` — a bare
`<TabsList>` with no horizontal scroll container:

```tsx
<TabsList>
  <TabsTrigger value="overview">Overview</TabsTrigger>
  <TabsTrigger value="categories" …>
  …
```

## Suggested fix

The merchant-detail tab host already solves exactly this: it wraps its mobile
strip in `-mx-1 overflow-x-auto` around a `min-w-max` row, which measures 317px
inside a 375px viewport and scrolls internally. Apply the same treatment here,
or drop the strip to a `Select` below `sm`.

Whichever is chosen, the acceptance check is that **every tab is reachable at
375px** — not merely that the page reports no horizontal overflow.
