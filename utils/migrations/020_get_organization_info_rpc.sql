-- ============================================================================
-- Migration: RPC function to get organization info with members and invites
-- ============================================================================
-- This avoids foreign key ambiguity issues with pending_org_admin_invites

CREATE OR REPLACE FUNCTION public.get_organization_info(p_organization_id text)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result json;
  v_org json;
  v_members json;
  v_pending_invites json;
  v_carriers json;
BEGIN
  -- Get organization details
  SELECT to_json(o.*)
  INTO v_org
  FROM organizations o
  WHERE o.id = p_organization_id;

  IF v_org IS NULL THEN
    RETURN json_build_object('error', 'Organization not found');
  END IF;

  -- Get members with user details
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', m.id,
      'user_id', m.user_id,
      'organization_id', m.organization_id,
      'role', m.role,
      'staff_profile_id', m.staff_profile_id,
      'created_at', m.created_at,
      'updated_at', m.updated_at,
      'user', json_build_object(
        'id', u.id,
        'first_name', u.first_name,
        'last_name', u.last_name,
        'email', u.email,
        'avatar_url', u.avatar_url,
        'created_at', u.created_at
      )
    )
  ), '[]'::json)
  INTO v_members
  FROM members m
  LEFT JOIN users u ON u.id = m.user_id
  WHERE m.organization_id = p_organization_id;

  -- Get pending admin invites with both user references
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', pai.id,
      'organization_id', pai.organization_id,
      'email', pai.email,
      'role_code', pai.role_code,
      'status', pai.status,
      'clerk_invite_id', pai.clerk_invite_id,
      'clerk_user_id', pai.clerk_user_id,
      'invited_by', pai.invited_by,
      'merchant_access', pai.merchant_access,
      'expires_at', pai.expires_at,
      'accepted_at', pai.accepted_at,
      'created_at', pai.created_at,
      'updated_at', pai.updated_at,
      'clerk_user', CASE 
        WHEN cu.id IS NOT NULL THEN json_build_object(
          'id', cu.id,
          'first_name', cu.first_name,
          'last_name', cu.last_name,
          'email', cu.email
        )
        ELSE NULL
      END,
      'invited_by_user', CASE 
        WHEN iu.id IS NOT NULL THEN json_build_object(
          'id', iu.id,
          'first_name', iu.first_name,
          'last_name', iu.last_name,
          'email', iu.email
        )
        ELSE NULL
      END
    )
  ), '[]'::json)
  INTO v_pending_invites
  FROM pending_org_admin_invites pai
  LEFT JOIN users cu ON cu.id = pai.clerk_user_id
  LEFT JOIN users iu ON iu.id = pai.invited_by
  WHERE pai.organization_id = p_organization_id;

  -- Get carriers with merchants (if applicable)
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', c.id,
      'merchants', (
        SELECT COALESCE(json_agg(to_json(mer.*)), '[]'::json)
        FROM merchants mer
        WHERE mer.carrier_id = c.id
      )
    )
  ), '[]'::json)
  INTO v_carriers
  FROM carriers c
  WHERE c.organization_id = p_organization_id;

  -- Build final result
  v_result := v_org::jsonb || jsonb_build_object(
    'members', v_members,
    'pending_org_admin_invites', v_pending_invites,
    'carriers', v_carriers
  );

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_organization_info(text) TO authenticated;
