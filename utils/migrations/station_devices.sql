-- ============================================================
-- Migration 003: Create Station Devices Table (Printers, etc.)
-- ============================================================
-- File: supabase/migrations/003_create_station_devices.sql

CREATE TABLE IF NOT EXISTS station_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  
  -- For payment terminals, link to payment_terminals table
  payment_terminal_id UUID REFERENCES payment_terminals(id) ON DELETE SET NULL,
  
  -- Device Identity
  device_type TEXT NOT NULL,                            -- payment_terminal | receipt_printer | label_printer | kitchen_printer | cash_drawer | barcode_scanner | scale | customer_display
  device_name TEXT NOT NULL,                            -- "Kitchen Printer", "Receipt Printer"
  device_model TEXT,                                    -- "Epson TM-T88VI", "Star TSP143"
  serial_number TEXT,
  
  -- Connection
  connection_type TEXT NOT NULL,                        -- usb | bluetooth | network | integrated
  connection_address TEXT,                              -- IP address, Bluetooth MAC, USB port
  connection_port INTEGER,                              -- Network port if applicable
  
  -- Printer-specific settings
  printer_width INTEGER,                                -- Character width: 32, 42, 48
  printer_dpi INTEGER,                                  -- 180, 203, 300
  auto_cut BOOLEAN DEFAULT TRUE,
  open_cash_drawer BOOLEAN DEFAULT FALSE,               -- Trigger cash drawer on print
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_connected BOOLEAN DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  last_error TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT chk_device_type CHECK (device_type IN (
    'payment_terminal', 'receipt_printer', 'label_printer', 
    'kitchen_printer', 'cash_drawer', 'barcode_scanner', 
    'scale', 'customer_display'
  )),
  CONSTRAINT chk_connection_type CHECK (connection_type IN ('usb', 'bluetooth', 'network', 'integrated'))
);

-- Indexes
CREATE INDEX idx_station_devices_station ON station_devices(station_id);
CREATE INDEX idx_station_devices_type ON station_devices(device_type);
CREATE INDEX idx_station_devices_payment_terminal ON station_devices(payment_terminal_id);

-- Auto-update timestamp
CREATE TRIGGER trg_station_devices_updated_at
  BEFORE UPDATE ON station_devices
  FOR EACH ROW EXECUTE FUNCTION update_stations_updated_at();

-- RLS
ALTER TABLE station_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view their devices"
  ON station_devices FOR SELECT
  USING (
    is_merchant_admin(merchant_id)
  );

CREATE POLICY "Merchants can manage their devices"
  ON station_devices FOR ALL
  USING (
    is_merchant_admin(merchant_id)
  );