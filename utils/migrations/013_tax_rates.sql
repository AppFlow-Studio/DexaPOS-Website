Here is the **Master Prompt** to feed into Cursor. It combines the **Tax System Architecture** with the **New Smart Items Library & Edit Sheet** requirements into a single, cohesive execution plan.

---

**Copy/Paste this into Cursor (Composer Mode):**

```markdown
### Role
You are the Lead Full-Stack Architect for "Dexa POS". We are building the **Master Inventory & Tax System**.

### Context & Tech Stack
- **Framework:** Next.js (App Router), Supabase, Shadcn/UI, TanStack Table, Zustand.
- **Goal:** Implement a "Category-Centric" Item Library with two modes: **HQ (Global)** and **Location (Override)**.
- **Tax Logic:** - Global Items define a `tax_category` (e.g., "Alcohol").
  - Locations define the *rate* for that category (e.g., "Alcohol" = 10%).

---

### PHASE 1: Database Migration (Supabase SQL)
*Execute this SQL to set up the foundation.*

```sql
-- 1. Create Tax Rates Table (Location specific percentages)
CREATE TABLE public.tax_rates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    location_id uuid REFERENCES locations(id) NOT NULL,
    name text NOT NULL, -- e.g., "NYC Liquor Tax"
    percentage numeric(10, 4) NOT NULL, -- e.g., 8.875
    tax_category text NOT NULL, -- 'standard', 'alcohol', 'service', 'retail'
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_unique_loc_tax_cat ON public.tax_rates (location_id, tax_category) WHERE is_active = true;

-- 2. Add "Control Columns" to Global Items
ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS tax_category text DEFAULT 'standard' NOT NULL,
ADD COLUMN IF NOT EXISTS is_tax_exempt boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS available_channels jsonb DEFAULT '["pos", "online"]'::jsonb; -- Array of strings

-- 3. Add "Control Columns" to Location Overrides (L2)
ALTER TABLE public.location_item_overrides
ADD COLUMN IF NOT EXISTS tax_category text, -- Null = Inherit
ADD COLUMN IF NOT EXISTS is_tax_exempt boolean, -- Null = Inherit
ADD COLUMN IF NOT EXISTS available_channels jsonb; -- Null = Inherit

-- 4. Update Tax Calculation Engine
CREATE OR REPLACE FUNCTION public.calculate_order_tax(p_order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_location_id uuid;
  v_subtotal NUMERIC(10, 2);
  v_calculated_tax NUMERIC(10, 2);
  v_result JSON;
BEGIN
  -- Verify context
  SELECT location_id, subtotal INTO v_location_id, v_subtotal
  FROM public.orders
  WHERE id = p_order_id AND merchant_id = user_merchant_id() AND location_id = ANY(user_location_ids());
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  -- Smart Calculation
  SELECT COALESCE(SUM(
    CASE 
        -- 1. Exemption Check (L2 Override -> L1 Global)
        WHEN COALESCE(lio.is_tax_exempt, mi.is_tax_exempt, false) = true THEN 0
        -- 2. Rate Lookup (Location Rate matching Item Category)
        ELSE ROUND((oi.quantity * oi.unit_price) * (COALESCE(tr.percentage, 0) / 100), 2)
    END
  ), 0) INTO v_calculated_tax
  FROM order_items oi
  JOIN menu_items mi ON mi.id = oi.menu_item_id
  LEFT JOIN location_item_overrides lio ON lio.menu_item_id = mi.id AND lio.location_id = v_location_id
  LEFT JOIN tax_rates tr ON tr.location_id = v_location_id 
      AND tr.tax_category = COALESCE(lio.tax_category, mi.tax_category, 'standard') 
      AND tr.is_active = true
  WHERE oi.order_id = p_order_id AND oi.status != 'voided';

  -- Update Order
  UPDATE public.orders
  SET tax_amount = v_calculated_tax,
      total_amount = subtotal + v_calculated_tax + COALESCE(service_charge, 0) - COALESCE(discount_amount, 0),
      amount_due = (subtotal + v_calculated_tax + COALESCE(service_charge, 0) - COALESCE(discount_amount, 0)) - COALESCE(amount_paid, 0),
      updated_at = NOW()
  WHERE id = p_order_id;
  
  SELECT json_build_object('success', true, 'tax_amount', v_calculated_tax) INTO v_result;
  RETURN v_result;
END;
$function$;

```

---

### PHASE 2: Frontend Implementation (Items Library)

**A. Create Types (`types/inventory.ts`)**


**B. The "Smart Table" (`app/(dashboard)/inventory/page.tsx`)**

* **Tax Column:**
* *HQ Mode:* Select (`Standard`, `Alcohol`, `Retail`).
* *Show Location specific tax rates in a tooltip when hovering over the tax column.
* *Location Mode:* Read-only text (unless overridden).


* **Channels Column:**
* Visual Badges (`POS`, `Web`, `Kiosk`).
* *Location Mode:* Toggle specifically for that location.


**C. The "Deep Edit" Sheet (`components/inventory/EditItemSheet.tsx`)**
Refactor the edit form to use **Tabs**:

1. **General:** Name, Desc, Image, Reporting Category.
2. **Pricing & Inventory:**
* HQ: Base Price.
* Location: Override Price input.
* Stock: "Track Stock" switch + Quantity input.


3. **Tax & Fees:**
* "Tax Exempt" Switch (Big toggle).
* "Tax Class" Select.


4. **Availability:** - Checkboxes for `['pos', 'online', 'kiosk']`.
* "Appears In" Section: List all Menus/Categories this item belongs to (Level 3/4/5 hierarchy) so the user knows impact.



**D. Location Tax Settings (`app/(dashboard)/settings/taxes/page.tsx`)**

* Simple CRUD table to manage the `tax_rates` table for the *current location*.
* Columns: Name, Percentage, Applies To (Category).

### Constraints

* **Strict TypeScript:** No `any`. Use `zod` for form validation.
* **Offline First:** Use `useMutation` with `onMutate` (Optimistic Updates) for the price inputs in the table.
* **UX:** When switching to "Location Mode", the table should visually indicate (e.g., amber border or badge) that you are now editing Overrides.

```

```