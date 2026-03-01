-- Add show_loyalty_rewards column to receipt_templates table
-- Purpose: Allow merchants to toggle loyalty rewards display on receipts

ALTER TABLE receipt_templates
ADD COLUMN show_loyalty_rewards BOOLEAN DEFAULT false;

-- Create index for filtering
CREATE INDEX idx_receipt_templates_show_loyalty_rewards
ON receipt_templates(location_id, show_loyalty_rewards);
