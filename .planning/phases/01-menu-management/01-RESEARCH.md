# Phase 1: Menu Management (Admin) - Research

**Researched:** 2026-01-25
**Domain:** Admin Menu Management, Multi-Tenant SaaS, Location-Scoped Pricing
**Confidence:** HIGH

## Summary

This phase builds on existing infrastructure: the merchant dashboard at `/app/dashboard/menu/` serves as the reference implementation. The admin view at `/app/manage/merchants/[merchantId]/components/MenuTab` already exists with basic structure and must be enhanced to match merchant capabilities plus admin-specific features (audit trails, cross-merchant operations).

The critical technical challenges are:
1. **5-Level Price Cascade System** - Base price → Location item override → Category price → Location+Category → Location+Menu
2. **Location-Scoped Context** - All operations must respect "All Locations" vs specific location view
3. **Server Actions Pattern** - All mutations use server actions with RLS enforcement and audit logging via `assertHQPermission()`
4. **Bottom Sheet UI Pattern** - Form interactions use `BottomSheet` component for mobile-optimized UX

**Primary recommendation:** Leverage existing server actions in `app/manage/actions/admin-merchant/menus.ts`, extend existing tables in `/app/manage/merchants/[merchantId]/components/MenuTab/*`, and follow established patterns for location-scoped pricing and audit logging.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.5.9 | App Router, Server Components | Project foundation |
| React | 19.1.0 | UI framework | Latest stable |
| TanStack Query | 5.90.2 | Server state management | Used throughout admin hooks |
| Supabase Client | 2.75.0 | Database operations, RLS | Multi-tenant data layer |
| React Hook Form | 7.65.0 | Form state management | Used in all existing forms |
| Zod | 3.25.76 | Schema validation | Type-safe form validation |
| Shadcn/UI | Latest | Component library | Project design system |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Sonner | 2.0.7 | Toast notifications | Success/error feedback |
| Recharts | 2.15.4 | Charts/analytics | Menu analytics visualizations |
| @dnd-kit | 6.3.1 | Drag and drop | Menu/category reordering |
| Lucide React | 0.545.0 | Icons | Consistent icon system |
| Class Variance Authority | 0.7.1 | Component variants | Button/badge styling |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bottom Sheet | Dialog/Modal | Bottom sheets are mobile-optimized, project standard |
| TanStack Query | SWR | TanStack Query already used throughout, provides better devtools |
| React Hook Form | Formik | RHF is lighter, better TypeScript support, project standard |

**Installation:**
```bash
# All dependencies already installed
# No additional packages needed for this phase
```

## Architecture Patterns

### Recommended Project Structure
```
app/manage/merchants/[merchantId]/components/
├── MenuTab.tsx                          # Main container (EXISTS)
├── MenuTab/
│   ├── MenusTable.tsx                   # Menus list (EXISTS, BASIC)
│   ├── ItemsTable.tsx                   # Items list (EXISTS)
│   ├── CategoriesTable.tsx              # Categories list (EXISTS)
│   ├── ModifiersTable.tsx               # Modifiers list (EXISTS)
│   ├── sheets/
│   │   ├── MenuFormSheet.tsx            # Create/edit menu (EXISTS, BASIC)
│   │   ├── CategoryFormSheet.tsx        # Create/edit category (EXISTS)
│   │   ├── ItemFormSheet.tsx            # Create/edit item (EXISTS)
│   │   ├── ItemDetailSheet.tsx          # View item details (EXISTS)
│   │   ├── MenuSchedulesSheet.tsx       # NEW: Assign schedules to menu
│   │   └── PriceOverrideSheet.tsx       # NEW: Location price overrides
│   └── dialogs/
│       ├── AssignItemsDialog.tsx        # NEW: Bulk assign items to categories
│       └── MenuScheduleDialog.tsx       # NEW: Create/edit schedules

app/manage/actions/admin-merchant/
├── menus.ts                             # Menu CRUD (EXISTS, COMPREHENSIVE)
├── schedules.ts                         # NEW: Schedule operations
└── audit.ts                             # EXISTS: Audit logging

lib/queries/
├── use-admin-merchant.ts                # Admin hooks (EXISTS)
└── admin-keys.ts                        # Query keys (EXISTS)
```

### Pattern 1: Location-Scoped Data Fetching

**What:** All queries must respect the selected location context (`all` or specific locationId)

**When to use:** Every data fetch operation in admin menu management

**Example:**
```typescript
// Source: app/manage/merchants/[merchantId]/components/MenuTab.tsx (lines 47-66)
const [selectedLocationId, setSelectedLocationId] = useState<string>('all')

const isAllLocations = selectedLocationId === 'all'

const { data: stats, isLoading: statsLoading } = useAdminMenuStats(
  merchantId,
  isAllLocations ? null : selectedLocationId  // Convert 'all' to null
)

// Server action pattern
// Source: app/manage/actions/admin-merchant/menus.ts (lines 271-286)
export async function getAdminMenuItems(
  merchantId: string,
  locationId?: string | null,  // null = global, string = specific location
  filters: AdminMenuItemsFilters = {}
): Promise<AdminMenuItemsResponse> {
  await assertHQPermission('hq.merchant.view')

  const supabase = createServerSupabaseClient()
  const effectiveLocationId = locationId === 'all' ? null : locationId

  // Use RPC that implements location-scoped pricing
  const { data, error } = await supabase.rpc('get_items_for_location_library', {
    p_merchant_id: merchantId,
    p_location_id: effectiveLocationId || null,
  })
  // ... returns items with effective prices based on location
}
```

### Pattern 2: Price Cascade Display (5 Levels)

**What:** Display the effective price and which level it comes from (L1-L5)

**When to use:** Displaying item prices in tables and detail views

**Example:**
```typescript
// Source: app/manage/merchants/[merchantId]/components/MenuTab/ItemsTable.tsx (lines 87-116)
const PRICE_SOURCE_CONFIG: Record<PriceSource, {
  label: string
  shortLabel: string  // L1, L2, L3, L4, L5
  className: string
}> = {
  base: {
    label: 'Base Price',
    shortLabel: 'L1',
    className: 'bg-slate-100 text-slate-700',
  },
  location_item: {
    label: 'Location Override',
    shortLabel: 'L2',
    className: 'bg-blue-100 text-blue-700',
  },
  category: {
    label: 'Category Price',
    shortLabel: 'L3',
    className: 'bg-green-100 text-green-700',
  },
  location_category: {
    label: 'Location + Category',
    shortLabel: 'L4',
    className: 'bg-purple-100 text-purple-700',
  },
  location_menu: {
    label: 'Location + Menu',
    shortLabel: 'L5',
    className: 'bg-orange-100 text-orange-700',
  },
}

// Display in table
<Badge variant="outline" className={sourceConfig.className}>
  {sourceConfig.shortLabel}
</Badge>
```

### Pattern 3: Server Actions with Audit Logging

**What:** All mutations go through server actions that enforce permissions and log changes

**When to use:** Any create/update/delete operation

**Example:**
```typescript
// Source: app/manage/actions/admin-merchant/menus.ts (lines 1301-1368)
export async function createAdminMenuItem(
  merchantId: string,
  data: CreateMenuItemData
): Promise<{ data: AdminMenuItem | null; error: string | null }> {
  // 1. Permission check (throws if unauthorized)
  await assertHQPermission('hq.merchant.update')

  // 2. Create server supabase client (respects RLS)
  const supabase = createServerSupabaseClient()

  // 3. Execute mutation
  const { data: item, error } = await supabase
    .from('menu_items')
    .insert({
      merchant_id: merchantId,
      name: data.name,
      // ... other fields
    })
    .select()
    .single()

  if (error) {
    console.error('[createAdminMenuItem] Error:', error)
    return { data: null, error: error.message }
  }

  // 4. Audit logging happens via database triggers or explicit call
  // (Check database.types.ts audit_logs table)

  // 5. Return typed result
  return {
    data: {
      id: item.id,
      // ... transform to AdminMenuItem format
    },
    error: null,
  }
}
```

### Pattern 4: Bottom Sheet Form Pattern

**What:** Mobile-optimized slide-up sheets for forms, matching merchant dashboard UX

**When to use:** Creating/editing entities (items, categories, menus, modifiers)

**Example:**
```typescript
// Source: app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetSection,
} from '@/components/ui/bottom-sheet'

export function ItemFormSheet({ open, onClose, merchantId, locationId, mode, item }: Props) {
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { /* ... */ }
  })

  return (
    <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BottomSheetContent height="95">  {/* 95% height for large forms */}
        <BottomSheetHeader>
          <BottomSheetTitle>Create/Edit Item</BottomSheetTitle>
          <BottomSheetDescription>Subtitle here</BottomSheetDescription>
        </BottomSheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <BottomSheetBody className="space-y-6">
              {/* Sections with BottomSheetSection for logical grouping */}
              <BottomSheetSection title="Basic Information">
                <FormField ... />
              </BottomSheetSection>

              <BottomSheetSection title="Pricing">
                <FormField ... />
              </BottomSheetSection>
            </BottomSheetBody>

            <BottomSheetFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit">Save</Button>
            </BottomSheetFooter>
          </form>
        </Form>
      </BottomSheetContent>
    </BottomSheet>
  )
}
```

### Pattern 5: Query Key Management

**What:** Centralized query key factory for cache invalidation

**When to use:** Defining TanStack Query hooks, invalidating caches after mutations

**Example:**
```typescript
// Source: lib/queries/admin-keys.ts (inferred pattern)
export const adminKeys = {
  merchantMenus: (merchantId: string, locationId: string | null) =>
    ['admin', 'merchant', merchantId, 'menus', locationId] as const,

  merchantMenuItems: (merchantId: string, locationId: string | null) =>
    ['admin', 'merchant', merchantId, 'menuItems', locationId] as const,

  merchantCategories: (merchantId: string, locationId: string | null) =>
    ['admin', 'merchant', merchantId, 'categories', locationId] as const,

  merchantMenuStats: (merchantId: string, locationId: string | null) =>
    ['admin', 'merchant', merchantId, 'menuStats', locationId] as const,
}

// Usage in hook
export function useAdminMenuItems(merchantId: string, locationId: string | null, filters: Filters) {
  return useQuery({
    queryKey: [...adminKeys.merchantMenuItems(merchantId, locationId), filters],
    queryFn: () => getAdminMenuItems(merchantId, locationId, filters),
    enabled: !!merchantId,
  })
}

// Invalidation after mutation
const queryClient = useQueryClient()
queryClient.invalidateQueries({
  queryKey: adminKeys.merchantMenuItems(merchantId, locationId)
})
```

### Anti-Patterns to Avoid

- **Direct Supabase calls in components:** Always use server actions for mutations
- **Skipping permission checks:** Every admin action MUST call `assertHQPermission()`
- **Hardcoding 'all' in queries:** Convert to null before passing to server actions
- **Forgetting to invalidate queries:** After mutations, invalidate related query keys
- **Mixing price levels in display:** Always show which level (L1-L5) the price comes from
- **Ignoring location context:** Every UI must handle both "All Locations" and specific location views

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Menu item pricing logic | Custom price calculator | RPC `get_items_for_location_library` | Implements full 5-level cascade, tested in production |
| Location override management | Manual override tables | Existing `location_item_overrides`, `location_category_overrides` | RLS policies already configured |
| Audit logging | Custom logging system | Database triggers on audit_logs table | Automatic capture of actor, changes, timestamps |
| Schedule assignment | Custom schedule picker | RPC `get_schedules` with location filtering | Handles global + location-specific schedules |
| Price level badges | Custom badge component | `PRICE_SOURCE_CONFIG` constant (ItemsTable.tsx) | Standardized colors, labels across admin UI |
| Form validation | Manual validation | Zod schemas + React Hook Form | Type-safe, reusable, follows project patterns |
| Permission enforcement | Manual role checks | `assertHQPermission('hq.merchant.update')` | Centralized, throws on unauthorized, consistent |
| Query invalidation | Manual refetch calls | TanStack Query key factory pattern | Granular control, prevents over-fetching |

**Key insight:** The merchant dashboard at `/app/dashboard/menu/` already solved these problems for merchant users. Admin views add permission checks, cross-merchant context, and audit info but reuse the same server actions and database RPCs.

## Common Pitfalls

### Pitfall 1: Ignoring Price Cascade Levels

**What goes wrong:** Displaying only base price or effective price without showing source

**Why it happens:** Price cascade is complex (5 levels), easy to simplify incorrectly

**How to avoid:**
- Always fetch `price_source` field from RPCs
- Display price level badge (L1-L5) next to effective price
- Show "Base: $X → Effective: $Y (L2)" when override exists
- Use `PRICE_SOURCE_CONFIG` for consistent styling

**Warning signs:**
- Merchants/admins confused about why prices differ across locations
- Unable to identify which override is controlling the price
- Testing shows wrong prices on POS

### Pitfall 2: Location Context Mismatch

**What goes wrong:** Fetching global data when location is selected, or vice versa

**Why it happens:** "All Locations" represented as string `'all'` but server expects `null`

**How to avoid:**
```typescript
// CORRECT
const isAllLocations = selectedLocationId === 'all'
const effectiveLocationId = isAllLocations ? null : selectedLocationId

useAdminMenus(merchantId, effectiveLocationId)  // null or UUID

// WRONG
useAdminMenus(merchantId, selectedLocationId)  // passes 'all' string
```

**Warning signs:**
- Location selector doesn't filter data
- Seeing duplicate items (global + location-specific)
- RPC functions throwing type errors

### Pitfall 3: Forgetting Permission Checks

**What goes wrong:** Server actions execute without authorization, RLS allows operation but audit trail is wrong

**Why it happens:** Easy to copy merchant dashboard code which doesn't need permission checks

**How to avoid:**
- Every admin server action MUST start with `await assertHQPermission('hq.merchant.view' | 'hq.merchant.update')`
- Use 'view' for read operations, 'update' for mutations
- Never use `createServiceRoleClient()` unless bypassing RLS is explicitly required

**Warning signs:**
- Audit logs missing or showing wrong user
- Security review flags unauthorized access
- RLS tests pass but permission tests fail

### Pitfall 4: Sheet State Management

**What goes wrong:** Form doesn't reset when reopening, or holds stale data

**Why it happens:** Bottom sheets don't auto-reset, React state persists across open/close

**How to avoid:**
```typescript
// Reset form when sheet opens/closes
useEffect(() => {
  if (open) {
    if (isEdit && item) {
      form.reset({ /* item data */ })
    } else {
      form.reset({ /* defaults */ })
    }
  }
}, [open, isEdit, item, form])

// Also reset on close
<BottomSheet
  open={open}
  onOpenChange={(isOpen) => {
    if (!isOpen) {
      form.reset()  // Clear before closing
      onClose()
    }
  }}
>
```

**Warning signs:**
- Creating new items pre-fills last edited item's data
- Editing item A then item B shows A's data briefly
- Form validation errors persist after closing sheet

### Pitfall 5: Query Cache Stale Data

**What goes wrong:** After creating/updating, UI doesn't reflect changes

**Why it happens:** TanStack Query caches responses, mutations don't auto-invalidate

**How to avoid:**
```typescript
const queryClient = useQueryClient()

const handleCreate = async () => {
  const result = await createAdminMenuItem(merchantId, data)

  if (result.error) {
    toast.error('Failed')
    return
  }

  // Invalidate ALL related queries
  queryClient.invalidateQueries({
    queryKey: adminKeys.merchantMenuItems(merchantId, locationId)
  })
  queryClient.invalidateQueries({
    queryKey: adminKeys.merchantMenuStats(merchantId, locationId)
  })
  // If item added to category, invalidate category queries too
  queryClient.invalidateQueries({
    queryKey: adminKeys.merchantCategories(merchantId, locationId)
  })

  toast.success('Created')
  onClose()
}
```

**Warning signs:**
- Need to manually refresh page to see changes
- Stats cards show old counts
- Items appear/disappear when switching location selector

## Code Examples

Verified patterns from official sources:

### Location-Scoped Stats Display
```typescript
// Source: app/manage/merchants/[merchantId]/components/MenuTab.tsx (lines 131-173)
<div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
  <StatsCard
    title="Total Items"
    value={stats?.totalItems ?? 0}
    icon={<Package className="h-4 w-4" />}
    isLoading={statsLoading}
  />
  {!isAllLocations && (
    <StatsCard
      title="With Overrides"
      value={stats?.itemsWithOverrides ?? 0}
      icon={<Sliders className="h-4 w-4" />}
      variant="info"
      isLoading={statsLoading}
    />
  )}
  {/* Only show override count when location selected */}
</div>

{/* Price level legend - only when location selected */}
{!isAllLocations && (
  <Card className="bg-muted/50">
    <CardContent className="py-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-muted-foreground">Price Levels:</span>
        <PriceLevelBadge level="L1" label="Base" color="slate" />
        <PriceLevelBadge level="L2" label="Location" color="blue" />
        <PriceLevelBadge level="L3" label="Category" color="green" />
        <PriceLevelBadge level="L4" label="Loc+Cat" color="purple" />
        <PriceLevelBadge level="L5" label="Loc+Menu" color="orange" />
      </div>
    </CardContent>
  </Card>
)}
```

### Item Table with Price Source
```typescript
// Source: app/manage/merchants/[merchantId]/components/MenuTab/ItemsTable.tsx (lines 470-502)
{/* Base Price (L1) */}
<TableCell>
  <div className="space-y-1">
    <span className={hasOverride && !isAllLocations ? 'text-muted-foreground line-through' : 'font-medium'}>
      {formatCurrency(item.base_price)}
    </span>
    {item.base_cash_price && item.base_cash_price !== item.base_price && (
      <p className="text-xs text-muted-foreground">
        Cash: {formatCurrency(item.base_cash_price)}
      </p>
    )}
  </div>
</TableCell>

{/* Effective Price (when location selected) */}
{!isAllLocations && (
  <TableCell>
    <div className="space-y-1">
      <span className="font-medium">{formatCurrency(item.effective_price)}</span>
      {item.effective_cash_price && (
        <p className="text-xs text-muted-foreground">
          Cash: {formatCurrency(item.effective_cash_price)}
        </p>
      )}
      {/* Price Source Badge */}
      <div>
        <Badge variant="outline" className={sourceConfig.className}>
          {sourceConfig.shortLabel}
        </Badge>
      </div>
    </div>
  </TableCell>
)}
```

### Location Override Form
```typescript
// Source: app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx (lines 461-549)
{isLocationView && isEdit ? (
  // Location override pricing
  <>
    <div className="rounded-lg border p-3 mb-3 bg-muted/30">
      <p className="text-xs text-muted-foreground">
        Base Price: <span className="font-medium">${item?.base_price.toFixed(2)}</span>
        {item?.base_cash_price && (
          <> | Cash: <span className="font-medium">${item.base_cash_price.toFixed(2)}</span></>
        )}
      </p>
    </div>

    <FormField
      control={form.control}
      name="override_price"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Location Price Override</FormLabel>
          <FormControl>
            <Input
              type="number"
              step="0.01"
              placeholder="Leave empty to use base price"
              {...field}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
            />
          </FormControl>
          <FormDescription>
            Set a custom price for this location
          </FormDescription>
        </FormItem>
      )}
    />

    <FormField
      control={form.control}
      name="override_availability"
      render={({ field }) => (
        <FormItem className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <FormLabel>Available at Location</FormLabel>
            <FormDescription>Item can be ordered at this location</FormDescription>
          </div>
          <FormControl>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </FormControl>
        </FormItem>
      )}
    />
  </>
) : (
  // Base pricing (create or global edit)
  <FormField ... />
)}
```

### Server Action Permission Pattern
```typescript
// Source: app/manage/actions/admin-merchant/menus.ts (lines 1003-1050)
export async function createAdminCategory(
  merchantId: string,
  data: CreateCategoryData
): Promise<{ data: AdminCategory | null; error: string | null }> {
  // Permission check FIRST
  await assertHQPermission('hq.merchant.update')

  // Server client (respects RLS)
  const supabase = createServerSupabaseClient()

  // Mutation
  const { data: category, error } = await supabase
    .from('categories')
    .insert({
      merchant_id: merchantId,
      name: data.name,
      description: data.description || null,
      image: data.image || null,
      location_id: data.location_id || null,
      is_active: data.is_active ?? true,
      is_global: !data.location_id,
      display_order: data.display_order || 0,
    })
    .select(`
      id, name, description, image, is_active, is_global, location_id, display_order, created_at,
      locations(name)
    `)
    .single()

  if (error) {
    console.error('[createAdminCategory] Error:', error)
    return { data: null, error: error.message }
  }

  // Transform to typed response
  return {
    data: {
      id: category.id,
      name: category.name,
      // ... other fields
      location_name: (category as any).locations?.name || null,
      items_count: 0,
      created_at: category.created_at,
    },
    error: null,
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Menu price in single field | 5-level price cascade with source tracking | Initial DB design (Phase 0) | Enables complex location pricing, POS sync |
| Client-side permission checks | Server-side `assertHQPermission()` | Admin auth refactor (v0.1) | Enforces RLS + audit logging |
| Dialog modals | Bottom sheets | UI redesign (React 19 upgrade) | Better mobile UX, consistent with merchant dashboard |
| Manual RPC calls | TanStack Query hooks with keys | Query optimization | Automatic caching, background refetch |
| Service role client everywhere | Server client + RLS | Security audit (Dec 2025) | Proper multi-tenant isolation |

**Deprecated/outdated:**
- `createServiceRoleClient()` for admin operations: Now uses `createServerSupabaseClient()` + RLS
- Direct Supabase mutations in components: Now uses server actions exclusively
- Hardcoded permission strings: Now uses `assertHQPermission()` helper
- Simple menu_items join queries: Now uses `get_items_for_location_library` RPC for price cascade

## Open Questions

Things that couldn't be fully resolved:

1. **Schedule Implementation Depth**
   - What we know: Menu schedules table exists, merchant dashboard has schedule UI
   - What's unclear: Whether admin should create NEW schedules or only assign existing ones
   - Recommendation: Start with assignment only (select existing schedule → assign to menu). Admin can create schedules in Phase 7 (Advanced Menu Features) if needed

2. **Modifier Group Inline Creation**
   - What we know: Modifier groups exist, can be assigned to items
   - What's unclear: Create modifier groups inline when editing item, or only assign existing groups?
   - Recommendation: Assignment only in Phase 1 (matches merchant dashboard pattern). Inline creation can be Phase 7 enhancement

3. **Bulk Operations Priority**
   - What we know: Admins manage multiple merchants, bulk operations save time
   - What's unclear: Which bulk operations are most valuable (bulk price update? bulk category assignment?)
   - Recommendation: Gather user feedback during Phase 1 testing. Add bulk features in Phase 2 if requested

4. **Image Upload vs URL Input**
   - What we know: Current forms accept image URL as text input
   - What's unclear: Should admin have drag-drop image upload with storage?
   - Recommendation: Match merchant dashboard (URL input only) for Phase 1. Merchant dashboard uses URL input, so admin should too. Image upload can be separate enhancement across both dashboards

## Sources

### Primary (HIGH confidence)
- Existing codebase at `/Users/temurbeksayfutdinov/Documents/AppFlowStudios/dexapos-website`
  - `app/manage/merchants/[merchantId]/components/MenuTab.tsx` - Main admin menu container
  - `app/manage/merchants/[merchantId]/components/MenuTab/ItemsTable.tsx` - Price level badges pattern
  - `app/manage/merchants/[merchantId]/components/MenuTab/sheets/ItemFormSheet.tsx` - Bottom sheet form pattern
  - `app/manage/actions/admin-merchant/menus.ts` - All server actions and types
  - `lib/queries/use-admin-merchant.ts` - TanStack Query hooks
  - `database.types.ts` - Full database schema (menu_items, menu_schedules, audit_logs)
- `/Users/temurbeksayfutdinov/Documents/AppFlowStudios/dexapos-website/CLAUDE.md` - Project architecture decisions
- `/Users/temurbeksayfutdinov/Documents/AppFlowStudios/dexapos-website/package.json` - Dependency versions

### Secondary (MEDIUM confidence)
- Merchant dashboard reference implementation at `app/dashboard/menu/`
- Phase context document at `.planning/phases/01-menu-management/01-CONTEXT.md`

### Tertiary (LOW confidence)
- None - all research based on existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All dependencies in package.json, versions confirmed
- Architecture: HIGH - Patterns extracted from working production code
- Pitfalls: HIGH - Identified from existing code comments and patterns

**Research date:** 2026-01-25
**Valid until:** 60 days (stable domain, existing codebase, unlikely to change rapidly)

---

*Note: This research leverages existing merchant dashboard at `/app/dashboard/menu/` as reference. The admin implementation is "merchant dashboard + permission checks + audit info" rather than a greenfield build.*
