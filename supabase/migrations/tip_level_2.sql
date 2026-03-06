-- =====================================================
-- TIP DISTRIBUTION SYSTEM - SUPABASE MIGRATION
-- =====================================================
-- Includes:
-- Tables
-- Indexes
-- Calculation function
-- Approval function
-- =====================================================

-- =====================================================
-- 1. TIP POOL CONFIGURATION
-- =====================================================

CREATE TABLE IF NOT EXISTS tip_pool_configs (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  merchant_id UUID NOT NULL REFERENCES merchants(id),
  location_id UUID NOT NULL REFERENCES locations(id),

  name TEXT NOT NULL,
  description TEXT,

  distribution_method TEXT NOT NULL DEFAULT 'percentage'
  CHECK (distribution_method IN ('percentage','hours_weighted','equal_split','points')),

  tip_source TEXT NOT NULL DEFAULT 'charged_tips'
  CHECK (tip_source IN ('charged_tips','all_tips','cash_only')),

  source_percentage NUMERIC(5,2) DEFAULT 100.00,

  contributing_role_codes TEXT[] NOT NULL DEFAULT '{}',

  is_active BOOLEAN DEFAULT true,

  effective_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  created_by UUID REFERENCES staff_profiles(id),

  UNIQUE(location_id,name)

);


-- =====================================================
-- 2. TIP POOL ROLE SHARES
-- =====================================================

CREATE TABLE IF NOT EXISTS tip_pool_role_shares (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tip_pool_config_id UUID NOT NULL
  REFERENCES tip_pool_configs(id) ON DELETE CASCADE,

  role_code TEXT NOT NULL REFERENCES roles(code),

  share_percentage NUMERIC(5,2),
  points_per_hour NUMERIC(5,2),

  is_eligible BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tip_pool_config_id,role_code)

);


-- =====================================================
-- 3. TIP OUT RULES
-- =====================================================

CREATE TABLE IF NOT EXISTS tip_out_rules (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  merchant_id UUID NOT NULL REFERENCES merchants(id),
  location_id UUID NOT NULL REFERENCES locations(id),

  from_role_code TEXT NOT NULL REFERENCES roles(code),
  to_role_code TEXT NOT NULL REFERENCES roles(code),

  tip_out_type TEXT NOT NULL
  CHECK (tip_out_type IN ('percentage_of_tips','percentage_of_sales','flat_amount')),

  tip_out_value NUMERIC(7,2) NOT NULL,

  is_active BOOLEAN DEFAULT true,

  effective_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(location_id,from_role_code,to_role_code)

);


-- =====================================================
-- 4. DISTRIBUTION SESSION
-- =====================================================

CREATE TABLE IF NOT EXISTS tip_distribution_sessions (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  merchant_id UUID NOT NULL REFERENCES merchants(id),
  location_id UUID NOT NULL REFERENCES locations(id),

  session_date DATE NOT NULL,

  shift_period TEXT DEFAULT 'full_day'
  CHECK (shift_period IN ('full_day','lunch','dinner','custom')),

  total_tips_collected NUMERIC(10,2) DEFAULT 0,
  total_tips_pooled NUMERIC(10,2) DEFAULT 0,
  total_tip_outs NUMERIC(10,2) DEFAULT 0,
  total_distributed NUMERIC(10,2) DEFAULT 0,
  rounding_adjustment NUMERIC(10,2) DEFAULT 0,

  status TEXT DEFAULT 'draft'
  CHECK (status IN ('draft','calculated','approved','exported','voided')),

  calculated_at TIMESTAMPTZ,
  calculated_by UUID REFERENCES staff_profiles(id),

  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES staff_profiles(id),

  approval_notes TEXT,

  config_snapshot JSONB,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(location_id,session_date,shift_period)

);


-- =====================================================
-- 5. DISTRIBUTION DETAILS
-- =====================================================

CREATE TABLE IF NOT EXISTS tip_distribution_details (

  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL
  REFERENCES tip_distribution_sessions(id) ON DELETE CASCADE,

  staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id),

  role_code TEXT NOT NULL,

  hours_worked NUMERIC(5,2) DEFAULT 0,
  gross_sales NUMERIC(10,2) DEFAULT 0,

  individual_tips_earned NUMERIC(10,2) DEFAULT 0,

  charged_tips NUMERIC(10,2) DEFAULT 0,
  cash_tips NUMERIC(10,2) DEFAULT 0,

  tip_pool_contributed NUMERIC(10,2) DEFAULT 0,
  tip_pool_received NUMERIC(10,2) DEFAULT 0,

  tip_out_given NUMERIC(10,2) DEFAULT 0,
  tip_out_received NUMERIC(10,2) DEFAULT 0,

  manual_adjustment NUMERIC(10,2) DEFAULT 0,

  net_tips NUMERIC(10,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(session_id,staff_profile_id)

);


-- =====================================================
-- 6. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_tip_pool_location
ON tip_pool_configs(location_id)
WHERE is_active=true;

CREATE INDEX IF NOT EXISTS idx_tip_dist_session_lookup
ON tip_distribution_sessions(location_id,session_date);

CREATE INDEX IF NOT EXISTS idx_tip_dist_details_session
ON tip_distribution_details(session_id);

CREATE INDEX IF NOT EXISTS idx_tip_dist_details_staff
ON tip_distribution_details(staff_profile_id);

CREATE INDEX IF NOT EXISTS idx_employee_daily_lookup
ON employee_daily_tips(location_id,shift_date);

CREATE INDEX IF NOT EXISTS idx_location_members_lookup
ON location_members(location_id,staff_profile_id);


-- =====================================================
-- 7. CALCULATE TIP DISTRIBUTION FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_tip_distribution(

  p_location_id UUID,
  p_merchant_id UUID,
  p_session_date DATE,
  p_shift_period TEXT DEFAULT 'full_day',
  p_calculated_by UUID DEFAULT NULL

)

RETURNS JSON

LANGUAGE plpgsql
SECURITY DEFINER

AS $$

DECLARE

v_session_id UUID;
v_total_collected NUMERIC;
v_total_distributed NUMERIC;

BEGIN

PERFORM pg_advisory_xact_lock(
hashtext(p_location_id::text||p_session_date::text)
);


INSERT INTO tip_distribution_sessions(

merchant_id,
location_id,
session_date,
shift_period

)

VALUES(

p_merchant_id,
p_location_id,
p_session_date,
p_shift_period

)

ON CONFLICT(location_id,session_date,shift_period)

DO UPDATE SET updated_at=now()

RETURNING id INTO v_session_id;



DELETE FROM tip_distribution_details
WHERE session_id=v_session_id;



INSERT INTO tip_distribution_details(

session_id,
staff_profile_id,
role_code,
hours_worked,
gross_sales,
charged_tips,
cash_tips,
individual_tips_earned

)

SELECT

v_session_id,
edt.staff_profile_id,
lm.role_code,
COALESCE(edt.hours_worked,0),
COALESCE(edt.gross_sales,0),
COALESCE(edt.charged_tips,0),
COALESCE(edt.cash_tips_declared,0),
COALESCE(edt.charged_tips,0)+COALESCE(edt.cash_tips_declared,0)

FROM employee_daily_tips edt
JOIN location_members lm
ON lm.staff_profile_id=edt.staff_profile_id
AND lm.location_id=edt.location_id

WHERE edt.location_id=p_location_id
AND edt.shift_date=p_session_date;



SELECT SUM(individual_tips_earned)

INTO v_total_collected

FROM tip_distribution_details

WHERE session_id=v_session_id;



UPDATE tip_distribution_details dd

SET tip_pool_contributed = dd.charged_tips

FROM tip_pool_configs pc

WHERE dd.session_id=v_session_id
AND pc.location_id=p_location_id
AND pc.tip_source='charged_tips'
AND dd.role_code = ANY(pc.contributing_role_codes);



UPDATE tip_distribution_details dd

SET tip_out_given = dd.gross_sales * (tor.tip_out_value/100)

FROM tip_out_rules tor

WHERE tor.location_id=p_location_id
AND tor.tip_out_type='percentage_of_sales'
AND dd.role_code=tor.from_role_code
AND dd.session_id=v_session_id;



UPDATE tip_distribution_details

SET net_tips =
individual_tips_earned
- tip_pool_contributed
+ tip_pool_received
- tip_out_given
+ tip_out_received
+ manual_adjustment

WHERE session_id=v_session_id;



SELECT SUM(net_tips)

INTO v_total_distributed

FROM tip_distribution_details

WHERE session_id=v_session_id;



UPDATE tip_distribution_sessions

SET

status='calculated',
total_tips_collected=v_total_collected,
total_distributed=v_total_distributed,
rounding_adjustment=v_total_collected-v_total_distributed,
calculated_at=now(),
calculated_by=p_calculated_by

WHERE id=v_session_id;



RETURN json_build_object(

'success',true,
'session_id',v_session_id,
'total_collected',v_total_collected,
'total_distributed',v_total_distributed

);

END;

$$;



-- =====================================================
-- 8. APPROVE DISTRIBUTION FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION approve_tip_distribution(

p_session_id UUID,
p_approved_by UUID

)

RETURNS JSON

LANGUAGE plpgsql
SECURITY DEFINER

AS $$

BEGIN

UPDATE tip_distribution_sessions

SET
status='approved',
approved_at=now(),
approved_by=p_approved_by

WHERE id=p_session_id;

RETURN json_build_object(
'success',true,
'session_id',p_session_id
);

END;

$$;

-- =====================================================
-- END OF FILE
-- =====================================================