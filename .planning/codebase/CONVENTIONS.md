# Coding Conventions

**Analysis Date:** 2026-01-25

## Naming Patterns

**Files:**
- PascalCase for components: `ShiftCard.tsx`, `ItemFormSheet.tsx`
- camelCase for hooks, utilities, and actions: `use-discounts.ts`, `inventory.ts`, `schedules.ts`
- camelCase with hyphens for multi-word files: `menu-items.ts`, `location-store.ts`, `audit-logs.ts`
- Type definition files use hyphenated descriptors: `db-models.ts`, `order-management.ts`, `clerk-metadata.ts`

**Functions:**
- PascalCase for React components: `export default function CustomersPage() {}`
- PascalCase for exported async functions: `export async function GetInventoryItems()`, `export async function CreateDiscount()`
- camelCase for helper/utility functions: `createBrowserSupabaseClient()`, `parseISO()`
- Hooks use `use` prefix in camelCase: `useCustomers()`, `useLocationStore()`, `useDiscounts()`

**Variables:**
- camelCase for all variables and constants: `selectedLocationId`, `merchantId`, `filteredData`
- All caps with underscores for database column names in interfaces: `is_primary_location`, `price_modifier_type`, `created_at`
- Descriptive names for boolean flags: `isLoading`, `isInitialized`, `isActive`

**Types:**
- PascalCase for type names: `LocationState`, `Shift`, `MenuItem`, `DiscountFormValues`
- PascalCase for interface names: `ShiftCardProps`, `LocationItemOverride`, `MenuModifierGroup`
- UPPERCASE for enum-like literal unions: `type StockTrackingMode = "quantity" | "in_stock" | "out_of_stock"`
- Suffix `_with_*` for joined/denormalized views: `InventoryItemWithVendor`, `AdminMenuItemWithDetails`

## Code Style

**Formatting:**
- Prettier is NOT configured; no strict formatting tool enforced
- TypeScript strict mode enabled (see `tsconfig.json`)
- Consistent 2-space indentation observed throughout codebase
- Double quotes for strings (observed pattern in most files)
- Semicolons used consistently

**Linting:**
- ESLint configured with Next.js core-web-vitals preset (`eslintrc.json`)
- Run with: `npm run lint`
- Plugin: `@tanstack/eslint-plugin-query` (for React Query best practices)

## Import Organization

**Order:**
1. External packages (React, Next.js, third-party): `import { useQuery } from "@tanstack/react-query"`
2. Internal utilities and lib files: `import { cn } from "@/lib/utils"`
3. Local components: `import { ItemFormSheet } from "./components/ItemFormSheet"`
4. Type imports (at end): `import type { MenuItem } from "@/types/menu"`

**Path Aliases:**
- Configured in `tsconfig.json`: `@/*` maps to root directory
- Used throughout codebase for clean imports: `@/lib/supabase/server`, `@/types/menu`, `@/components/ui/button`

**Example (from `hooks/use-discounts.ts`):**
```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDiscounts, getDiscountById, createDiscount } from "@/app/dashboard/actions/discounts";
import { Discount, DiscountFormInput } from "@/types/discount";
import { toast } from "sonner";
```

## Error Handling

**Patterns:**
- Server actions return typed objects with `success` flag and optional `error` field:
  ```typescript
  const result = await createDiscount(input);
  if (result.success) {
    // Handle success
  } else {
    toast.error(result.error || "Failed to create discount");
  }
  ```
- Console errors for server-side issues: `console.error("Error getting merchant:", merchantError)`
- Supabase errors checked via `error` property on response: `if (merchantError || !merchant) { return [] }`
- No explicit try/catch blocks observed; errors handled via Supabase error responses

**User Feedback:**
- Sonner toast library for all user-facing feedback: `toast.success()`, `toast.error()`
- Success/error messages paired with mutations: See `hooks/use-discounts.ts` onSuccess/onError handlers

## Logging

**Framework:** console (console.error for errors)

**Patterns:**
- Server-side errors logged to console: `console.error("Error getting inventory items:", error)`
- No request/response logging library observed
- Audit logging via dedicated action: `LogAuditEvent()` called in inventory/menu operations

**When to Log:**
- Database query failures
- Permission check failures
- RLS policy violations (implied by returns)

## Comments

**When to Comment:**
- Section headers with visual dividers: `// ============================================================================`
- Logic explanations in complex functions
- JSDoc comments on exported functions with parameters and descriptions

**JSDoc/TSDoc:**
- JSDoc comments used for public API functions:
  ```typescript
  /**
   * Get all inventory items for a merchant
   * - All Locations view: returns global items with AGGREGATE stock across all locations
   * - Specific Location view: returns global items + local items with LOCATION-SPECIFIC stock
   */
  export async function GetInventoryItems(
    clerkOrgId: string,
    locationId?: string | null,
  ): Promise<InventoryItemWithVendor[]> {
  ```
- Parameter descriptions with bullet points for complex logic

## Function Design

**Size:** Functions average 30-100 lines for server actions, 5-20 lines for utility functions

**Parameters:**
- Required parameters first, optional parameters with `?` or trailing undefined
- Descriptive names reflecting business concepts: `clerkOrgId`, `locationId`, `merchantId`
- Type annotations required (strict mode): `function GetInventoryItems(clerkOrgId: string, locationId?: string | null)`

**Return Values:**
- Server actions return typed result objects: `Promise<InventoryItemWithVendor[]>`
- React hooks return data with loading state: `{ data, isLoading, error }`
- Mutations return result with success flag: `{ success: boolean, data?: T, error?: string }`

## Module Design

**Exports:**
- Named exports for utility functions and types
- Default exports for page components: `export default function CustomersPage() {}`
- Named exports for hooks: `export function useCustomers() {}`
- Type exports: `export type DiscountFormSchema = typeof discountFormSchema`

**Barrel Files:**
- Not observed; imports use direct file paths
- Each action file exports multiple related functions
- Example `lib/supabase/queries/menus.ts` exports `getMenuWithRelations()` and `getMenusWithStats()`

## Server Actions

**Pattern (`"use server"` directive):**
- All files in `app/dashboard/actions/` and `app/manage/actions/` start with `"use server"`
- Functions named with PascalCase: `CreateDiscount()`, `GetInventoryItems()`
- Always accept clerk context (org ID) as first parameter
- Return typed result objects for error handling

**Example:**
```typescript
"use server";

export async function CreateDiscount(input: DiscountFormInput): Promise<DiscountResult> {
  const supabase = createServerSupabaseClient();
  // ... implementation
}
```

## Zustand Store Pattern

**State Management:**
- Stores use `create<StateType>()` with middleware
- Persist middleware for localStorage: `persist()`
- Selector hooks provided for computed values
- Actions bundled in store definition

**Example (from `stores/location-store.ts`):**
```typescript
export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      // state
      selectedLocationId: "all",
      // actions
      setSelectedLocation: (id: string) => {
        set({ selectedLocationId: id });
        // sync to cookie
        document.cookie = `x-location-id=${id}; ...`;
      },
    }),
    { name: "location-storage", storage: createJSONStorage(() => localStorage) }
  )
);
```

## Validation

**Schema Pattern:**
- Zod for runtime validation: `z.object()`, `z.string().min(1)`, `.refine()`
- Chained validators with `.refine()` for cross-field validation
- Type inference: `export type DiscountFormValues = z.infer<typeof discountFormSchema>`

**Example (from `lib/validations/discount.ts`):**
```typescript
export const discountFormSchema = z.object({
  discount_type: z.enum(["percentage", "fixed_amount"]),
  discount_value: z.number().positive(),
}).refine((data) => {
  if (data.discount_type === "percentage" && data.discount_value > 100) {
    return false;
  }
  return true;
}, { message: "Percentage discount cannot exceed 100%", path: ["discount_value"] });
```

---

*Convention analysis: 2026-01-25*
