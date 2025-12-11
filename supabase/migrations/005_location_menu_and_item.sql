CREATE TABLE public.location_category_overrides (

id uuid NOT NULL DEFAULT uuid_generate_v4(),

location_id uuid NOT NULL,

category_id uuid NOT NULL,

is_active boolean NOT NULL DEFAULT true,

display_order integer,

created_at timestamp with time zone NOT NULL DEFAULT now(),

updated_at timestamp with time zone NOT NULL DEFAULT now(),

CONSTRAINT location_category_overrides_pkey PRIMARY KEY (id),

CONSTRAINT location_category_overrides_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),

CONSTRAINT location_category_overrides_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)

);

CREATE TABLE public.location_exclusive_items (

id uuid NOT NULL DEFAULT uuid_generate_v4(),

location_id uuid NOT NULL,

name text NOT NULL,

description text,

price numeric NOT NULL,

cash_price numeric,

image text,

category_id uuid,

meal_types ARRAY DEFAULT '{}'::text[],

allergens ARRAY DEFAULT '{}'::text[],

card_bg_color text,

availability boolean NOT NULL DEFAULT true,

stock_tracking_mode text CHECK (stock_tracking_mode = ANY (ARRAY['in_stock'::text, 'out_of_stock'::text, 'quantity'::text])),

display_order integer,

created_at timestamp with time zone NOT NULL DEFAULT now(),

updated_at timestamp with time zone NOT NULL DEFAULT now(),

CONSTRAINT location_exclusive_items_pkey PRIMARY KEY (id),

CONSTRAINT location_exclusive_items_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),

CONSTRAINT location_exclusive_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id)

);

CREATE TABLE public.location_invites (

id uuid NOT NULL DEFAULT uuid_generate_v4(),

location_id uuid NOT NULL,

invited_by_user_id text NOT NULL,

email text NOT NULL,

role_code text NOT NULL,

clerk_invite_id text,

status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text])),

accepted_by_user_id text,

expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),

accepted_at timestamp with time zone,

created_at timestamp with time zone NOT NULL DEFAULT now(),

updated_at timestamp with time zone NOT NULL DEFAULT now(),

CONSTRAINT location_invites_pkey PRIMARY KEY (id),

CONSTRAINT location_invites_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),

CONSTRAINT location_invites_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES public.users(id),

CONSTRAINT location_invites_role_code_fkey FOREIGN KEY (role_code) REFERENCES public.roles(code),

CONSTRAINT location_invites_accepted_by_user_id_fkey FOREIGN KEY (accepted_by_user_id) REFERENCES public.users(id)

);

CREATE TABLE public.location_item_overrides (

id uuid NOT NULL DEFAULT uuid_generate_v4(),

location_id uuid NOT NULL,

menu_item_id uuid NOT NULL,

custom_price numeric,

custom_cash_price numeric,

price_modifier numeric DEFAULT 0,

price_modifier_type text CHECK (price_modifier_type = ANY (ARRAY['absolute'::text, 'add'::text, 'percent'::text])),

is_available boolean,

stock_tracking_mode text CHECK (stock_tracking_mode = ANY (ARRAY['in_stock'::text, 'out_of_stock'::text, 'quantity'::text, 'use_default'::text])),

current_stock integer,

low_stock_threshold integer,

created_at timestamp with time zone NOT NULL DEFAULT now(),

updated_at timestamp with time zone NOT NULL DEFAULT now(),

CONSTRAINT location_item_overrides_pkey PRIMARY KEY (id),

CONSTRAINT location_item_overrides_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),

CONSTRAINT location_item_overrides_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id)

);

CREATE TABLE public.location_members (

id uuid NOT NULL DEFAULT uuid_generate_v4(),

location_id uuid NOT NULL,

user_id text NOT NULL,

role_code text NOT NULL,

is_primary_location boolean NOT NULL DEFAULT false,

is_active boolean NOT NULL DEFAULT true,

employment_type text CHECK (employment_type = ANY (ARRAY['full_time'::text, 'part_time'::text, 'contractor'::text, 'seasonal'::text])),

hourly_rate numeric,

pin_code text,

assigned_at timestamp with time zone NOT NULL DEFAULT now(),

updated_at timestamp with time zone NOT NULL DEFAULT now(),

CONSTRAINT location_members_pkey PRIMARY KEY (id),

CONSTRAINT location_members_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),

CONSTRAINT location_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),

CONSTRAINT location_members_role_code_fkey FOREIGN KEY (role_code) REFERENCES public.roles(code)

);

CREATE TABLE public.location_menu_item_overrides (

id uuid NOT NULL DEFAULT uuid_generate_v4(),

location_id uuid NOT NULL,

menu_item_id uuid NOT NULL,

custom_price numeric,

custom_cash_price numeric,

is_available boolean NOT NULL DEFAULT true,

stock_tracking_mode text CHECK (stock_tracking_mode = ANY (ARRAY['in_stock'::text, 'out_of_stock'::text, 'quantity'::text, 'use_default'::text])),

created_at timestamp with time zone NOT NULL DEFAULT now(),

updated_at timestamp with time zone NOT NULL DEFAULT now(),

menu_id uuid,

CONSTRAINT location_menu_item_overrides_pkey PRIMARY KEY (id),

CONSTRAINT location_menu_item_overrides_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),

CONSTRAINT location_menu_item_overrides_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id),

CONSTRAINT location_menu_item_overrides_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menus(id)

);

CREATE TABLE public.location_menus (

id uuid NOT NULL DEFAULT uuid_generate_v4(),

location_id uuid NOT NULL,

menu_id uuid NOT NULL,

is_active boolean NOT NULL DEFAULT true,

display_order integer,

created_at timestamp with time zone NOT NULL DEFAULT now(),

updated_at timestamp with time zone NOT NULL DEFAULT now(),

CONSTRAINT location_menus_pkey PRIMARY KEY (id),

CONSTRAINT location_menus_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),

CONSTRAINT location_menus_menu_id_fkey FOREIGN KEY (menu_id) REFERENCES public.menus(id)

);

CREATE TABLE public.location_modifier_group_overrides (

id uuid NOT NULL DEFAULT gen_random_uuid(),

location_id uuid NOT NULL,

modifier_group_id uuid NOT NULL,

merchant_id uuid NOT NULL,

is_active boolean DEFAULT true,

created_at timestamp with time zone DEFAULT now(),

updated_at timestamp with time zone DEFAULT now(),

CONSTRAINT location_modifier_group_overrides_pkey PRIMARY KEY (id),

CONSTRAINT location_modifier_group_overrides_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),

CONSTRAINT location_modifier_group_overrides_modifier_group_id_fkey FOREIGN KEY (modifier_group_id) REFERENCES public.modifier_groups(id),

CONSTRAINT location_modifier_group_overrides_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id)

);

CREATE TABLE public.location_modifier_item_overrides (

id uuid NOT NULL DEFAULT gen_random_uuid(),

location_id uuid NOT NULL,

modifier_group_item_id uuid NOT NULL,

merchant_id uuid NOT NULL,

price_modifier numeric,

is_active boolean,

stock_tracking_mode text CHECK (stock_tracking_mode = ANY (ARRAY['quantity'::text, 'in_stock'::text, 'out_of_stock'::text])),

current_stock integer,

low_stock_threshold integer DEFAULT 5,

created_at timestamp with time zone DEFAULT now(),

updated_at timestamp with time zone DEFAULT now(),

CONSTRAINT location_modifier_item_overrides_pkey PRIMARY KEY (id),

CONSTRAINT location_modifier_item_overrides_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),

CONSTRAINT location_modifier_item_overrides_modifier_group_item_id_fkey FOREIGN KEY (modifier_group_item_id) REFERENCES public.modifier_group_items(id),

CONSTRAINT location_modifier_item_overrides_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id)

);

CREATE TABLE public.locations (

id uuid NOT NULL DEFAULT gen_random_uuid(),

merchant_id uuid NOT NULL,

name text NOT NULL,

address_line1 text,

created_at timestamp with time zone DEFAULT now(),

address_line2 text,

code text,

description text,

phone text,

email text,

city text NOT NULL DEFAULT ''::text,

state text NOT NULL DEFAULT ''::text,

postal_code text NOT NULL DEFAULT ''::text,

country text NOT NULL DEFAULT 'US'::text,

latitude numeric,

longitude numeric,

timezone text NOT NULL DEFAULT 'America/New_York'::text,

is_active boolean NOT NULL DEFAULT true,

is_accepting_orders boolean NOT NULL DEFAULT true,

business_hours jsonb DEFAULT '{}'::jsonb,

uses_global_menu boolean NOT NULL DEFAULT true,

public_metadata jsonb DEFAULT '{}'::jsonb,

updated_at timestamp with time zone NOT NULL DEFAULT now(),

CONSTRAINT locations_pkey PRIMARY KEY (id),

CONSTRAINT locations_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id)

);