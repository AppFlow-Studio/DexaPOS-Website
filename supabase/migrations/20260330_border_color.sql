ALTER TABLE online_store_config
  ADD COLUMN IF NOT EXISTS border_color TEXT DEFAULT NULL;
