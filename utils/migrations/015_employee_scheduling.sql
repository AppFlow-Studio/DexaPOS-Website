-- -- 1. SCHEDULES (Container for a week or custom period)
-- CREATE TABLE public.schedules (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     merchant_id uuid REFERENCES merchants(id) NOT NULL,
--     location_id uuid REFERENCES locations(id) NOT NULL,
--     name text NOT NULL, -- e.g., "Week 42" or "October Holiday"
--     start_date date NOT NULL,
--     end_date date NOT NULL,
--     status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
--     is_template boolean DEFAULT false, -- If true, this is a template, not a real schedule
--     created_at timestamptz DEFAULT now(),
--     updated_at timestamptz DEFAULT now()
-- );

-- 2. SHIFTS (The core atomic unit)
CREATE TABLE public.shifts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    schedule_id uuid REFERENCES schedules(id) ON DELETE CASCADE,
    merchant_id uuid REFERENCES merchants(id) NOT NULL,
    location_id uuid REFERENCES locations(id) NOT NULL,
    employee_id uuid REFERENCES staff_profiles(id), -- Nullable for "Open Shifts"
    role_id uuid, -- Optional: link to a roles table
    role_name text, -- Fallback if not using role_id
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    color text DEFAULT '#3b82f6',
    notes text,
    status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'pending_swap', 'pending_drop')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for fast conflict checking
CREATE INDEX idx_shifts_time_range ON public.shifts USING gist (tstzrange(start_time, end_time));
CREATE INDEX idx_shifts_employee ON public.shifts(employee_id);

-- 3. TIME OFF REQUESTS (PTO)
CREATE TABLE public.time_off_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id uuid REFERENCES merchants(id) NOT NULL,
    employee_id uuid REFERENCES staff_profiles(id) NOT NULL,
    start_date date NOT NULL, -- or timestamptz if partial days allowed
    end_date date NOT NULL,
    reason text,
    type text NOT NULL CHECK (type IN ('vacation', 'sick', 'personal', 'other')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    reviewed_by uuid REFERENCES staff_profiles(id),
    reviewed_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- 4. SHIFT TRADE REQUESTS (Handles Swaps, Drops, and Pickups)
CREATE TABLE public.shift_trade_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id uuid REFERENCES merchants(id) NOT NULL,
    type text NOT NULL CHECK (type IN ('swap', 'drop', 'pickup')),
    
    -- The initiator
    requester_id uuid REFERENCES staff_profiles(id) NOT NULL,
    
    -- The shift being given up (for Swap/Drop)
    offered_shift_id uuid REFERENCES shifts(id),
    
    -- The shift being requested (for Swap)
    requested_shift_id uuid REFERENCES shifts(id),
    
    -- Specific target (for direct swaps), NULL for "Blast to everyone"
    recipient_id uuid REFERENCES staff_profiles(id),
    
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending_peer', 'pending_manager', 'approved', 'denied', 'cancelled')),
    
    manager_reason text, -- If denied
    reviewed_by uuid REFERENCES staff_profiles(id),
    created_at timestamptz DEFAULT now()
);

-- Active Time Clock Shifts
-- CREATE TABLE public.staff_shifts (
--     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
--     staff_profile_id uuid REFERENCES staff_profiles(id) NOT NULL,
--     location_id uuid REFERENCES locations(id) NOT NULL,
--     status text NOT NULL CHECK (status IN ('active', 'on_break', 'completed')),
--     clock_in_time timestamptz NOT NULL DEFAULT now(),
--     clock_out_time timestamptz,
--     break_logs jsonb DEFAULT '[]'::jsonb,
--     hourly_rate_snapshot numeric(10, 2) NOT NULL,
--     device_id text,
--     is_verified boolean DEFAULT false
-- );

-- PTO Ledger (Auditable History)
CREATE TABLE public.pto_ledger (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES staff_profiles(id) NOT NULL,
    transaction_type text NOT NULL, -- 'accrual', 'usage'
    amount numeric(10, 4) NOT NULL,
    source_shift_id uuid REFERENCES staff_shifts(id),
    description text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.pto_policies (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id uuid REFERENCES merchants(id) NOT NULL,
    name text NOT NULL, -- e.g., "Standard Hourly Accrual"
    
    -- Method: 'hourly' (earned per hour worked) or 'lump_sum' (yearly drop)
    accrual_method text NOT NULL CHECK (accrual_method IN ('hourly', 'lump_sum')),
    
    -- Rate: e.g., 0.0333 (approx 1 hour per 30 worked)
    accrual_rate numeric(10, 4) NOT NULL,
    
    max_balance numeric(10, 2), -- Cap (e.g., 80 hours max)
    created_at timestamptz DEFAULT now()
);