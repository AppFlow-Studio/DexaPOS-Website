-- Test-data seed for the "My Tip History" page (Shift Breakdown section).
-- Not a schema migration — run manually against your dev DB, then delete the
-- rows (or the whole file) once you're done testing the UI.
--
-- Usage: edit the WHERE clause below to match your logged-in user, or just
-- run it as-is if you only have one staff profile per merchant in dev.

do $$
declare
  v_staff_profile_id uuid;
  v_merchant_id uuid;
  v_location_id uuid;
  v_session_id uuid;
begin
  -- Pick the staff profile for the currently-authenticated Supabase auth user.
  -- If you're testing as a different user, replace this select with an
  -- explicit `where id = '<staff_profile_id>'`.
  select sp.id, sp.merchant_id
    into v_staff_profile_id, v_merchant_id
  from staff_profiles sp
  where sp.user_id = auth.uid()
  limit 1;

  if v_staff_profile_id is null then
    raise exception 'No staff_profiles row found for auth.uid() = %. Run this as the logged-in staff user, or hardcode staff_profile_id.', auth.uid();
  end if;

  select l.id into v_location_id
  from locations l
  where l.merchant_id = v_merchant_id
  limit 1;

  if v_location_id is null then
    raise exception 'No locations row found for merchant_id = %.', v_merchant_id;
  end if;

  -- Session 1: dinner shift, 3 days ago, straightforward pooled tips.
  insert into tip_distribution_sessions
    (merchant_id, location_id, session_date, shift_period, status, approved_at, total_tips_collected, total_distributed)
  values
    (v_merchant_id, v_location_id, current_date - 3, 'dinner', 'approved', now() - interval '3 days', 420.00, 420.00)
  returning id into v_session_id;

  insert into tip_distribution_details
    (session_id, staff_profile_id, role_code, hours_worked, individual_tips_earned,
     tip_pool_contributed, tip_pool_received, tip_out_given, tip_out_received, manual_adjustment, net_tips)
  values
    (v_session_id, v_staff_profile_id, 'server', 6.5, 180.00, 40.00, 55.00, 15.00, 5.00, 0, 185.00);

  -- Session 2: lunch shift, 5 days ago, with a manual adjustment (exercises the Adjustment row).
  insert into tip_distribution_sessions
    (merchant_id, location_id, session_date, shift_period, status, approved_at, total_tips_collected, total_distributed)
  values
    (v_merchant_id, v_location_id, current_date - 5, 'lunch', 'approved', now() - interval '5 days', 210.00, 218.50)
  returning id into v_session_id;

  insert into tip_distribution_details
    (session_id, staff_profile_id, role_code, hours_worked, individual_tips_earned,
     tip_pool_contributed, tip_pool_received, tip_out_given, tip_out_received, manual_adjustment, net_tips)
  values
    (v_session_id, v_staff_profile_id, 'server', 4.0, 95.00, 20.00, 30.00, 10.00, 3.50, 8.50, 106.50);

  -- Session 3: full_day shift, 9 days ago.
  insert into tip_distribution_sessions
    (merchant_id, location_id, session_date, shift_period, status, approved_at, total_tips_collected, total_distributed)
  values
    (v_merchant_id, v_location_id, current_date - 9, 'full_day', 'approved', now() - interval '9 days', 540.00, 540.00)
  returning id into v_session_id;

  insert into tip_distribution_details
    (session_id, staff_profile_id, role_code, hours_worked, individual_tips_earned,
     tip_pool_contributed, tip_pool_received, tip_out_given, tip_out_received, manual_adjustment, net_tips)
  values
    (v_session_id, v_staff_profile_id, 'bartender', 8.0, 260.00, 60.00, 45.00, 20.00, 12.00, 0, 237.00);

  raise notice 'Seeded 3 approved tip sessions for staff_profile_id=%, merchant_id=%, location_id=%', v_staff_profile_id, v_merchant_id, v_location_id;
end $$;
