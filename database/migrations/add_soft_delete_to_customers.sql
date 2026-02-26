-- Add soft delete support to customers table using is_active flag
ALTER TABLE customers ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

-- Create index for querying active customers
CREATE INDEX idx_customers_is_active ON customers(is_active) WHERE is_active = TRUE;

-- Optional: Create a view for active customers only
CREATE OR REPLACE VIEW active_customers AS
SELECT * FROM customers WHERE is_active = TRUE;

-- Comment on the column
COMMENT ON COLUMN customers.is_active IS 'Boolean flag indicating if customer is active. FALSE means soft-deleted.';
