-- ============================================================================
-- DEXA POS: Category-Centric Menu Architecture Migration
-- ============================================================================
-- This migration transforms the menu system from item-centric to category-centric
-- while preserving existing data and tables where possible.
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create/Update category_items table
-- This replaces menu_item_categories as the PRIMARY item organization
-- ============================================================================

-- First, let's enhance menu_item_categories to become category_items
-- We'll rename it and add new columns

-- Check if menu_item_categories exists and rename it
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'menu_item_categories') THEN
        -- Add new columns to existing table first
        ALTER TABLE menu_item_categories 
            ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS custom_price DECIMAL(10,2),
            ADD COLUMN IF NOT EXISTS custom_cash_price DECIMAL(10,2),
            ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
            ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
        
        -- Rename to category_items
        ALTER TABLE menu_item_categories RENAME TO category_items;
        
        -- Rename the unique constraint if it exists
        ALTER INDEX IF EXISTS menu_item_categories_pkey RENAME TO category_items_pkey;
    END IF;
END $$;

-- If category_items doesn't exist (fresh install), create it
CREATE TABLE IF NOT EXISTS category_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    
    -- Display
    display_order INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    
    -- Category-level price override (optional)
    -- Use case: "Lunch Specials" category has discounted prices
    custom_price DECIMAL(10,2),
    custom_cash_price DECIMAL(10,2),
    
    -- Availability within this category
    is_available BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT category_items_unique UNIQUE (category_id, menu_item_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_category_items_category ON category_items(category_id);
CREATE INDEX IF NOT EXISTS idx_category_items_item ON category_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_category_items_display ON category_items(category_id, display_order);

-- ============================================================================
-- STEP 2: Enhance menu_categories table
-- ============================================================================

ALTER TABLE menu_categories 
    ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS custom_title TEXT,
    ADD COLUMN IF NOT EXISTS custom_subtitle TEXT,
    ADD COLUMN IF NOT EXISTS custom_image TEXT;

-- Ensure unique constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'menu_categories_menu_category_unique'
    ) THEN
        ALTER TABLE menu_categories 
            ADD CONSTRAINT menu_categories_menu_category_unique 
            UNIQUE (menu_id, category_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_menu_categories_menu ON menu_categories(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_display ON menu_categories(menu_id, display_order);

-- ============================================================================
-- STEP 3: Create location_category_item_overrides table (NEW)
-- This is for Location + Category specific pricing
-- ============================================================================

CREATE TABLE IF NOT EXISTS location_category_item_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    
    -- Price overrides
    custom_price DECIMAL(10,2),
    custom_cash_price DECIMAL(10,2),
    
    -- Availability
    is_available BOOLEAN,
    
    -- Display
    display_order INTEGER,
    is_featured BOOLEAN,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT location_category_item_unique 
        UNIQUE (location_id, category_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_location_category_item_lookup 
    ON location_category_item_overrides(location_id, category_id);
CREATE INDEX IF NOT EXISTS idx_location_category_item_item 
    ON location_category_item_overrides(menu_item_id);

-- ============================================================================
-- STEP 4: Rename location_menu_item_overrides for clarity
-- This becomes the Location + Menu + Category + Item override
-- ============================================================================

-- Add category_id to location_menu_item_overrides
ALTER TABLE location_menu_item_overrides 
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);

-- Update the unique constraint to include category
-- First drop old constraint if exists
DO $$
BEGIN
    -- Drop old unique constraint
    ALTER TABLE location_menu_item_overrides 
        DROP CONSTRAINT IF EXISTS location_menu_item_overrides_unique;
    
    -- Add new unique constraint including category
    ALTER TABLE location_menu_item_overrides 
        ADD CONSTRAINT location_menu_item_overrides_unique 
        UNIQUE (location_id, menu_id, category_id, menu_item_id);
EXCEPTION
    WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_location_menu_item_overrides_lookup 
    ON location_menu_item_overrides(location_id, menu_id, category_id);

-- ============================================================================
-- STEP 5: Update location_category_overrides
-- ============================================================================

ALTER TABLE location_category_overrides
    ADD COLUMN IF NOT EXISTS custom_title TEXT,
    ADD COLUMN IF NOT EXISTS custom_subtitle TEXT,
    ADD COLUMN IF NOT EXISTS custom_image TEXT;

-- Ensure unique constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'location_category_overrides_unique'
    ) THEN
        ALTER TABLE location_category_overrides 
            ADD CONSTRAINT location_category_overrides_unique 
            UNIQUE (location_id, category_id);
    END IF;
END $$;

-- ============================================================================
-- STEP 6: Create location_menu_category_overrides (NEW)
-- For overriding category settings on a specific menu at a location
-- ============================================================================

CREATE TABLE IF NOT EXISTS location_menu_category_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    
    -- Overrides
    is_active BOOLEAN,
    display_order INTEGER,
    custom_title TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT location_menu_category_unique 
        UNIQUE (location_id, menu_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_location_menu_category_lookup 
    ON location_menu_category_overrides(location_id, menu_id);

-- ============================================================================
-- STEP 7: Deprecate menu_item_menus (keep for backward compatibility)
-- Items are no longer directly added to menus
-- ============================================================================

-- Add deprecation comment
COMMENT ON TABLE menu_item_menus IS 
'DEPRECATED: Items should be added to categories, not directly to menus.
This table is kept for backward compatibility during migration.
New items should be added via category_items → menu_categories.';

-- Add migration flag
ALTER TABLE menu_item_menus 
    ADD COLUMN IF NOT EXISTS is_migrated BOOLEAN DEFAULT false;

-- ============================================================================
-- STEP 8: Migrate existing menu_item_menus data to category structure
-- ============================================================================

-- Create a function to migrate existing data
CREATE OR REPLACE FUNCTION migrate_menu_items_to_categories()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_migrated INTEGER := 0;
    v_default_category_id UUID;
    v_merchant_id UUID;
BEGIN
    -- For each unique merchant that has menu_item_menus records
    FOR v_merchant_id IN 
        SELECT DISTINCT mi.merchant_id 
        FROM menu_item_menus mim
        JOIN menu_items mi ON mi.id = mim.menu_item_id
        WHERE mim.is_migrated = false
    LOOP
        -- Create or get "Uncategorized" category for this merchant
        INSERT INTO categories (merchant_id, name, description, is_active)
        VALUES (v_merchant_id, 'Uncategorized', 'Items without a specific category', true)
        ON CONFLICT DO NOTHING;
        
        SELECT id INTO v_default_category_id 
        FROM categories 
        WHERE merchant_id = v_merchant_id AND name = 'Uncategorized'
        LIMIT 1;
        
        -- Migrate items that don't have category assignments
        INSERT INTO category_items (category_id, menu_item_id, display_order, is_available)
        SELECT DISTINCT 
            v_default_category_id,
            mim.menu_item_id,
            0,
            mim.is_available
        FROM menu_item_menus mim
        JOIN menu_items mi ON mi.id = mim.menu_item_id
        WHERE mi.merchant_id = v_merchant_id
          AND NOT EXISTS (
              SELECT 1 FROM category_items ci 
              WHERE ci.menu_item_id = mim.menu_item_id
          )
        ON CONFLICT (category_id, menu_item_id) DO NOTHING;
        
        -- Add category to menus that had these items
        INSERT INTO menu_categories (menu_id, category_id, display_order, is_active)
        SELECT DISTINCT 
            mim.menu_id,
            v_default_category_id,
            0,
            true
        FROM menu_item_menus mim
        JOIN menu_items mi ON mi.id = mim.menu_item_id
        WHERE mi.merchant_id = v_merchant_id
        ON CONFLICT (menu_id, category_id) DO NOTHING;
        
        -- Mark as migrated
        UPDATE menu_item_menus mim
        SET is_migrated = true
        FROM menu_items mi
        WHERE mi.id = mim.menu_item_id
          AND mi.merchant_id = v_merchant_id;
        
        GET DIAGNOSTICS v_migrated = ROW_COUNT;
    END LOOP;
    
    RETURN json_build_object(
        'success', true,
        'migrated_count', v_migrated
    );
END;
$$;

-- ============================================================================
-- STEP 9: Create triggers for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to new tables
DROP TRIGGER IF EXISTS update_category_items_updated_at ON category_items;
CREATE TRIGGER update_category_items_updated_at
    BEFORE UPDATE ON category_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_location_category_item_overrides_updated_at ON location_category_item_overrides;
CREATE TRIGGER update_location_category_item_overrides_updated_at
    BEFORE UPDATE ON location_category_item_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_location_menu_category_overrides_updated_at ON location_menu_category_overrides;
CREATE TRIGGER update_location_menu_category_overrides_updated_at
    BEFORE UPDATE ON location_menu_category_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;