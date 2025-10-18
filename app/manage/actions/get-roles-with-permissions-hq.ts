'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { RolesModel, PermissionsModel, RolePermissionsModel } from '@/types/db-modles'

export async function GetRolesWithPermissionsHQ() {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
        .from('roles')
        .select(`
      *,
      role_permissions!inner(
        permissions(*)
      )
    `)
        .order('organization_type', { ascending: true })
        .order('level', { ascending: false });

    if (error) {
        console.error('Error getting roles with permissions:', error)
        throw error
    };

    // Transform the nested structure

    const rolesWithPermissions = data.map(role => ({
        ...role,
        permissions: role.role_permissions?.map((rp: any) => rp.permissions).filter(Boolean) || []
    }));
    return rolesWithPermissions
}