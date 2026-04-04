
-- Merchant Menu System Schema
-- This migration creates all tables for managing merchant menus, items, categories, schedules, recipes, and stock tracking

-- ============================================================================
-- Core Menu Tables
-- ============================================================================

-- Menus table (merchant or location level)
CREATE TABLE IF NOT EXISTS menus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories table (merchant-global or menu-specific)
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    menu_id UUID REFERENCES menus(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    display_order INTEGER,
    image TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Menu categories junction table
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    display_order INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(menu_id, category_id)
);

-- ============================================================================
-- Menu Items Tables
-- ============================================================================

-- Menu items table
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    cash_price DECIMAL(10,2),
    image TEXT,
    meal_types TEXT[] DEFAULT '{}',
    allergens TEXT[] DEFAULT '{}',
    card_bg_color TEXT,
    availability BOOLEAN NOT NULL DEFAULT true,
    stock_tracking_mode TEXT CHECK (stock_tracking_mode IN ('in_stock', 'out_of_stock', 'quantity')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Menu item categories junction table (many-to-many)
CREATE TABLE IF NOT EXISTS menu_item_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(menu_item_id, category_id)
);

-- Menu item menus junction table (items to menus with custom pricing)
CREATE TABLE IF NOT EXISTS menu_item_menus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    custom_price DECIMAL(10,2),
    custom_cash_price DECIMAL(10,2),
    is_available BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(menu_item_id, menu_id)
);

-- ============================================================================
-- Schedule Tables
-- ============================================================================

-- Schedules table (reusable schedule definitions)
CREATE TABLE IF NOT EXISTS schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schedule time slots (day of week + time ranges)
CREATE TABLE IF NOT EXISTS schedule_time_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);

-- Menu schedules junction table
CREATE TABLE IF NOT EXISTS menu_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(menu_id, schedule_id)
);

-- Category schedules junction table
CREATE TABLE IF NOT EXISTS category_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    UNIQUE(category_id, schedule_id)
);

-- ============================================================================
-- Item Configuration Tables
-- ============================================================================

-- Item sizes table (reusable or item-specific)
CREATE TABLE IF NOT EXISTS item_sizes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_modifier DECIMAL(10,2) NOT NULL DEFAULT 0,
    display_order INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (merchant_id IS NULL AND menu_item_id IS NOT NULL) OR 
        (merchant_id IS NOT NULL AND menu_item_id IS NULL)
    )
);

-- Item addons table (reusable or item-specific)
CREATE TABLE IF NOT EXISTS item_addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    display_order INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (merchant_id IS NULL AND menu_item_id IS NOT NULL) OR 
        (merchant_id IS NOT NULL AND menu_item_id IS NULL)
    )
);

-- Modifier groups table (reusable)
CREATE TABLE IF NOT EXISTS modifier_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_required BOOLEAN NOT NULL DEFAULT false,
    min_selections INTEGER NOT NULL DEFAULT 0,
    max_selections INTEGER,
    display_order INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Modifier group items table
CREATE TABLE IF NOT EXISTS modifier_group_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price_modifier DECIMAL(10,2) NOT NULL DEFAULT 0,
    display_order INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Menu item modifier groups junction table
CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    display_order INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(menu_item_id, modifier_group_id)
);

-- Discounts table
CREATE TABLE IF NOT EXISTS discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
    discount_value DECIMAL(10,2) NOT NULL,
    min_purchase_amount DECIMAL(10,2),
    max_discount_amount DECIMAL(10,2),
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Menu item discounts junction table
CREATE TABLE IF NOT EXISTS menu_item_discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    discount_id UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(menu_item_id, discount_id)
);

-- ============================================================================
-- Recipe Tables
-- ============================================================================

-- Recipes table (reusable recipe definitions)
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    servings INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recipe items table (ingredients in recipes)
CREATE TABLE IF NOT EXISTS recipe_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_name TEXT NOT NULL,
    quantity DECIMAL(10,3) NOT NULL,
    unit TEXT NOT NULL,
    display_order INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Menu item recipes junction table
CREATE TABLE IF NOT EXISTS menu_item_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    quantity_multiplier DECIMAL(10,3) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(menu_item_id, recipe_id)
);

-- ============================================================================
-- Stock Tracking Tables
-- ============================================================================

-- Item stock table (per location inventory tracking)
CREATE TABLE IF NOT EXISTS item_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    quantity DECIMAL(10,3) NOT NULL DEFAULT 0,
    reorder_threshold DECIMAL(10,3),
    last_restocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(location_id, menu_item_id)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Menus indexes
CREATE INDEX IF NOT EXISTS idx_menus_merchant_id ON menus(merchant_id);
CREATE INDEX IF NOT EXISTS idx_menus_location_id ON menus(location_id);
CREATE INDEX IF NOT EXISTS idx_menus_merchant_location ON menus(merchant_id, location_id);

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_categories_merchant_id ON categories(merchant_id);
CREATE INDEX IF NOT EXISTS idx_categories_menu_id ON categories(menu_id);

-- Menu categories indexes
CREATE INDEX IF NOT EXISTS idx_menu_categories_menu_id ON menu_categories(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_category_id ON menu_categories(category_id);

-- Menu items indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_merchant_id ON menu_items(merchant_id);

-- Menu item categories indexes
CREATE INDEX IF NOT EXISTS idx_menu_item_categories_menu_item_id ON menu_item_categories(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_categories_category_id ON menu_item_categories(category_id);

-- Menu item menus indexes
CREATE INDEX IF NOT EXISTS idx_menu_item_menus_menu_item_id ON menu_item_menus(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_menus_menu_id ON menu_item_menus(menu_id);

-- Schedules indexes
CREATE INDEX IF NOT EXISTS idx_schedules_merchant_id ON schedules(merchant_id);

-- Schedule time slots indexes
CREATE INDEX IF NOT EXISTS idx_schedule_time_slots_schedule_id ON schedule_time_slots(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_time_slots_day_of_week ON schedule_time_slots(day_of_week);

-- Menu schedules indexes
CREATE INDEX IF NOT EXISTS idx_menu_schedules_menu_id ON menu_schedules(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_schedules_schedule_id ON menu_schedules(schedule_id);

-- Category schedules indexes
CREATE INDEX IF NOT EXISTS idx_category_schedules_category_id ON category_schedules(category_id);
CREATE INDEX IF NOT EXISTS idx_category_schedules_schedule_id ON category_schedules(schedule_id);

-- Item sizes indexes
CREATE INDEX IF NOT EXISTS idx_item_sizes_merchant_id ON item_sizes(merchant_id);
CREATE INDEX IF NOT EXISTS idx_item_sizes_menu_item_id ON item_sizes(menu_item_id);

-- Item addons indexes
CREATE INDEX IF NOT EXISTS idx_item_addons_merchant_id ON item_addons(merchant_id);
CREATE INDEX IF NOT EXISTS idx_item_addons_menu_item_id ON item_addons(menu_item_id);

-- Modifier groups indexes
CREATE INDEX IF NOT EXISTS idx_modifier_groups_merchant_id ON modifier_groups(merchant_id);

-- Modifier group items indexes
CREATE INDEX IF NOT EXISTS idx_modifier_group_items_modifier_group_id ON modifier_group_items(modifier_group_id);

-- Menu item modifier groups indexes
CREATE INDEX IF NOT EXISTS idx_menu_item_modifier_groups_menu_item_id ON menu_item_modifier_groups(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_modifier_groups_modifier_group_id ON menu_item_modifier_groups(modifier_group_id);

-- Discounts indexes
CREATE INDEX IF NOT EXISTS idx_discounts_merchant_id ON discounts(merchant_id);

-- Menu item discounts indexes
CREATE INDEX IF NOT EXISTS idx_menu_item_discounts_menu_item_id ON menu_item_discounts(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_discounts_discount_id ON menu_item_discounts(discount_id);

-- Recipes indexes
CREATE INDEX IF NOT EXISTS idx_recipes_merchant_id ON recipes(merchant_id);

-- Recipe items indexes
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe_id ON recipe_items(recipe_id);

-- Menu item recipes indexes
CREATE INDEX IF NOT EXISTS idx_menu_item_recipes_menu_item_id ON menu_item_recipes(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_recipes_recipe_id ON menu_item_recipes(recipe_id);

-- Item stock indexes
CREATE INDEX IF NOT EXISTS idx_item_stock_location_id ON item_stock(location_id);
CREATE INDEX IF NOT EXISTS idx_item_stock_menu_item_id ON item_stock(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_item_stock_location_menu_item ON item_stock(location_id, menu_item_id);

-- ============================================================================
-- Triggers for updated_at Timestamps
-- ============================================================================

-- Note: update_updated_at_column() function already exists from 001_initial_schema.sql

CREATE TRIGGER update_menus_updated_at BEFORE UPDATE ON menus
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_item_menus_updated_at BEFORE UPDATE ON menu_item_menus
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedule_time_slots_updated_at BEFORE UPDATE ON schedule_time_slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_item_sizes_updated_at BEFORE UPDATE ON item_sizes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_item_addons_updated_at BEFORE UPDATE ON item_addons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_modifier_groups_updated_at BEFORE UPDATE ON modifier_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_modifier_group_items_updated_at BEFORE UPDATE ON modifier_group_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discounts_updated_at BEFORE UPDATE ON discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recipe_items_updated_at BEFORE UPDATE ON recipe_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_item_recipes_updated_at BEFORE UPDATE ON menu_item_recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_item_stock_updated_at BEFORE UPDATE ON item_stock
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_group_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_stock ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies should be created separately based on your security requirements
-- Example policies would need to be added based on your authentication and authorization logic

