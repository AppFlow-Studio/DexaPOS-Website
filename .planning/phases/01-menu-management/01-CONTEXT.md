# Phase 1: Menu Management (Admin) - Context

**Gathered:** 2026-01-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can view and fully manage any merchant's menu structure — menus, categories, items, modifiers, pricing (including location-specific overrides), and menu schedules. This mirrors the merchant dashboard capabilities at `/dashboard/menu/` but operates from the HQ admin context at `/manage/merchants/[merchantId]/`.

</domain>

<decisions>
## Implementation Decisions

### Item Editing Flow
- **Match merchant dashboard pattern** — Use the same interface style (likely side sheet/drawer based on existing patterns)
- **Add audit info for admins** — Show who last edited the item, when, and provide space for admin notes
- **Same image upload flow** — Use existing merchant image upload pattern, no bulk upload needed

### Location Price Overrides
- **Match merchant dashboard presentation** — Follow existing location-scoped pricing patterns
- **Location selector approach** — Admin picks a location from dropdown/selector, then sees/edits prices for that location
- **Edit one location at a time** — No bulk price updates across multiple locations
- **Show base price value directly** — When no location override exists, display the actual base price number (not "using base" indicator)

### Schedule Configuration
- **Match merchant dashboard approach** — Follow existing schedule UI patterns
- **Full schedule management** — Admin can create, edit, delete schedules AND assign them to menus
- **Immediate activation** — Schedule changes apply immediately upon save (no draft mode)
- **Per-location schedules supported** — A menu can have different active schedules per location

### Claude's Discretion
- Modifier group management approach (inline creation vs assignment of existing groups)
- Menu navigation structure (tabs vs sidebar vs other patterns — follow existing)
- Category management UI details
- Exact audit info display format

</decisions>

<specifics>
## Specific Ideas

- "Match merchant dashboard" was the consistent answer — this is about parity, not reinvention
- Audit info is the key admin differentiator — merchants don't see who edited what, admins should
- The existing merchant dashboard at `app/dashboard/menu/` serves as the reference implementation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-menu-management*
*Context gathered: 2026-01-25*
