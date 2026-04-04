-- Migration: Invoice Management System
-- Creates invoices, invoice_items tables and atomic invoice number generation

-- ============================================================
-- Invoice number sequences (per-merchant counter, DB-atomic)
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_number_sequences (
  merchant_id  UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  last_number  INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION generate_invoice_number(p_merchant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO invoice_number_sequences (merchant_id, last_number)
  VALUES (p_merchant_id, 1)
  ON CONFLICT (merchant_id) DO UPDATE
    SET last_number = invoice_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'INV-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  location_id       UUID REFERENCES locations(id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,

  invoice_number    TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled')),

  -- Payment terms
  payment_due_type  TEXT NOT NULL DEFAULT 'upon_receipt'
                      CHECK (payment_due_type IN ('upon_receipt', 'net_15', 'net_30', 'net_60', 'custom')),
  due_date          DATE,

  -- Financials
  subtotal          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tax_rate          NUMERIC(5, 2)  NOT NULL DEFAULT 0,  -- percentage e.g. 8.5 = 8.5%
  tax_amount        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(10, 2) NOT NULL DEFAULT 0, 

  note              TEXT CHECK (char_length(note) <= 200),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique invoice number per merchant
  UNIQUE (merchant_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  menu_item_id   UUID REFERENCES menu_items(id) ON DELETE SET NULL,

  name           TEXT NOT NULL,
  description    TEXT,
  quantity       NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_price    NUMERIC(10, 2) NOT NULL DEFAULT 0,  -- quantity * unit_price

  sort_order     INTEGER NOT NULL DEFAULT 0,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_invoices_merchant_id    ON invoices(merchant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_location_id    ON invoices(location_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id    ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status         ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at     ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice   ON invoice_items(invoice_id);

-- ============================================================
-- Updated_at trigger
-- ============================================================

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Invoices: merchant admins and location members can access
CREATE POLICY "invoices_merchant_access" ON invoices
  FOR ALL
  USING (
    is_merchant_admin(merchant_id)
    OR (location_id IS NOT NULL AND is_location_member(location_id))
  );

-- Invoice items: accessible if the parent invoice is accessible
CREATE POLICY "invoice_items_via_invoice" ON invoice_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_items.invoice_id
        AND (
          is_merchant_admin(i.merchant_id)
          OR (i.location_id IS NOT NULL AND is_location_member(i.location_id))
        )
    )
  );
