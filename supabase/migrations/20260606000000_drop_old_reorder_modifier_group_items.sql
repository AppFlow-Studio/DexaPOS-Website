-- Drop the old overload with different parameter order that conflicts with the new one
DROP FUNCTION IF EXISTS public.reorder_modifier_group_items(uuid, uuid, jsonb);
