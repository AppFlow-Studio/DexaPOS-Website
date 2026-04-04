-- ============================================================
-- Migration 002: Create Payment Terminals Table (Dejavoo)
-- ============================================================
-- File: supabase/migrations/002_create_payment_terminals.sql

-- Extension for encryption (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS payment_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  station_id UUID REFERENCES stations(id) ON DELETE SET NULL,
  
  -- Terminal Identity
  terminal_name TEXT NOT NULL,                          -- "Front Counter Terminal"
  terminal_type TEXT NOT NULL DEFAULT 'dejavoo',        -- dejavoo | clover | square | stripe_terminal
  terminal_model TEXT,                                  -- "Dejavoo QD4", "P3", "Z11"
  serial_number TEXT,
  
  -- Dejavoo SPIN API Credentials (ENCRYPTED)
  tpn TEXT NOT NULL,                                    -- Terminal Profile Number (10-12 digits)
  auth_key TEXT NOT NULL,
  tpn_encrypted BYTEA,                                  -- Encrypted version for storage
  auth_key_encrypted BYTEA NOT NULL,                    -- Encrypted AuthKey (10 chars)
  register_id TEXT,                                     -- Alternative to TPN (2-50 chars)
  
  -- API Configuration
  api_environment TEXT DEFAULT 'sandbox',               -- sandbox | production
  api_base_url TEXT,                                    -- Override URL if needed
  spin_proxy_timeout INTEGER DEFAULT 120,               -- Timeout in seconds (1-720)
  
  -- Connection Settings
  connection_type TEXT DEFAULT 'cloud',                 -- cloud (SPIN API) | local (DvPayLite)
  local_ip_address INET,                                -- For local DvPayLite connection
  local_port INTEGER,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_connected BOOLEAN DEFAULT FALSE,
  last_connection_test_at TIMESTAMPTZ,
  last_connection_status TEXT,                          -- Online | Offline | NotFound
  last_transaction_at TIMESTAMPTZ,
  
  -- Capabilities (fetched from terminal)
  supports_contactless BOOLEAN DEFAULT TRUE,
  supports_emv BOOLEAN DEFAULT TRUE,
  supports_manual_entry BOOLEAN DEFAULT TRUE,
  supports_ebt BOOLEAN DEFAULT FALSE,
  supports_debit BOOLEAN DEFAULT TRUE,
  supports_tip_adjust BOOLEAN DEFAULT TRUE,
  
  -- Settings
  auto_settle BOOLEAN DEFAULT FALSE,
  settle_time TIME,                                     -- Auto-settle time if enabled
  print_merchant_receipt BOOLEAN DEFAULT TRUE,
  print_customer_receipt BOOLEAN DEFAULT TRUE,
  signature_threshold DECIMAL(10,2) DEFAULT 25.00,      -- Require signature above this
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_terminal_type CHECK (terminal_type IN ('dejavoo', 'pax')),
  CONSTRAINT chk_api_environment CHECK (api_environment IN ('sandbox', 'production')),
  CONSTRAINT chk_connection_type CHECK (connection_type IN ('cloud', 'local')),
  CONSTRAINT uq_tpn_per_merchant UNIQUE (merchant_id, tpn)
);

-- Indexes
CREATE INDEX idx_payment_terminals_location ON payment_terminals(location_id) WHERE is_active = TRUE;
CREATE INDEX idx_payment_terminals_station ON payment_terminals(station_id);
CREATE INDEX idx_payment_terminals_tpn ON payment_terminals(tpn);

-- Auto-update timestamp
CREATE TRIGGER trg_payment_terminals_updated_at
  BEFORE UPDATE ON payment_terminals
  FOR EACH ROW EXECUTE FUNCTION update_stations_updated_at();

-- RLS
ALTER TABLE payment_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view their terminals"
  ON payment_terminals FOR SELECT
  USING 
  (
    is_merchant_admin(merchant_id)
  );

CREATE POLICY "Merchants can manage their terminals"
  ON payment_terminals FOR ALL
  USING 
  (
    is_merchant_admin(merchant_id)
  );