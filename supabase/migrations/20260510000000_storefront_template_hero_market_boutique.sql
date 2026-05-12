-- Migrate any remaining 'minimal' merchants to 'classic' before dropping the constraint
UPDATE public.online_store_config
  SET template_id = 'classic'
  WHERE template_id = 'minimal';

-- Drop the old CHECK constraint that included 'bold' and 'minimal'
ALTER TABLE public.online_store_config
  DROP CONSTRAINT IF EXISTS online_store_config_template_id_check;

-- Add new CHECK constraint for the four supported templates
ALTER TABLE public.online_store_config
  ADD CONSTRAINT online_store_config_template_id_check
  CHECK (template_id IN ('classic', 'hero', 'market', 'boutique'));
