/**
 * Repair a broken staff identity by relinking an existing Clerk user to an
 * existing staff profile, ensuring:
 * - Clerk organization membership exists
 * - users row exists
 * - staff_profiles is linked + activated
 * - members row exists and points at the Clerk membership
 * - location_members rows are linked to the Clerk user
 *
 * Default mode is dry-run.
 *
 * Usage:
 *   npx tsx scripts/repair-staff-clerk-link.ts ^
 *     --merchant a7af715f-586f-4229-bb34-fc9947e0a474 ^
 *     --staff-profile bf0234fb-3270-49d9-b1a4-2600a8973752 ^
 *     --clerk-user user_3D36TxS8Ysfd4Qefg0kLOeXvAOi ^
 *     --email moekadi68@gmail.com
 *
 *   npx tsx scripts/repair-staff-clerk-link.ts --help
 *   npx tsx scripts/repair-staff-clerk-link.ts ... --run
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { createClerkClient } from '@clerk/backend'

type Args = {
  merchantId: string
  staffProfileId: string
  clerkUserId: string
  email?: string
  roleCode: string
  clerkMembershipRole: 'org:admin' | 'org:member'
  dryRun: boolean
}

type MerchantRow = {
  id: string
  name: string
  clerk_org_id: string | null
}

type StaffProfileRow = {
  id: string
  merchant_id: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  email: string | null
  phone: string | null
  user_id: string | null
  account_type: string | null
  is_active: boolean | null
}

type MemberRow = {
  id: string
  user_id: string | null
  organization_id: string
  role: string | null
  staff_profile_id: string | null
}

type LocationMemberRow = {
  id: string
  location_id: string
  merchant_id: string
  user_id: string | null
  staff_profile_id: string | null
  role_code: string | null
  is_active: boolean | null
}

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env')
  try {
    const raw = readFileSync(envPath, 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch (error) {
    console.error(`[repair] could not read ${envPath}:`, (error as Error).message)
  }
}

function printHelp() {
  console.log(`
Repair a broken staff <-> Clerk linkage.

Required:
  --merchant <uuid>
  --staff-profile <uuid>
  --clerk-user <id>

Optional:
  --email <email>              expected Clerk email / staff email
  --role <role_code>           default: merchant.owner
  --org-role <org:admin|org:member>
  --run                        apply writes (default is dry-run)
  --help
`)
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    merchantId: '',
    staffProfileId: '',
    clerkUserId: '',
    email: undefined,
    roleCode: 'merchant.owner',
    clerkMembershipRole: 'org:admin',
    dryRun: true,
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--merchant' || token === '-m') {
      args.merchantId = argv[++i] || ''
    } else if (token === '--staff-profile' || token === '--staff') {
      args.staffProfileId = argv[++i] || ''
    } else if (token === '--clerk-user' || token === '--user') {
      args.clerkUserId = argv[++i] || ''
    } else if (token === '--email') {
      args.email = argv[++i] || ''
    } else if (token === '--role') {
      args.roleCode = argv[++i] || args.roleCode
    } else if (token === '--org-role') {
      const role = argv[++i]
      if (role === 'org:member' || role === 'org:admin') {
        args.clerkMembershipRole = role
      }
    } else if (token === '--run') {
      args.dryRun = false
    } else if (token === '--help' || token === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  if (!args.merchantId || !args.staffProfileId || !args.clerkUserId) {
    printHelp()
    throw new Error('Missing required arguments')
  }

  return args
}

function inferMembershipRole(roleCode: string): 'org:admin' | 'org:member' {
  return roleCode === 'merchant.owner' || roleCode === 'merchant.admin'
    ? 'org:admin'
    : 'org:member'
}

async function main() {
  loadEnv()
  const args = parseArgs(process.argv.slice(2))
  if (!process.argv.includes('--org-role')) {
    args.clerkMembershipRole = inferMembershipRole(args.roleCode)
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
  const CLERK_SECRET = process.env.CLERK_SECRET_KEY

  if (!SUPABASE_URL || !SERVICE_ROLE || !CLERK_SECRET) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or CLERK_SECRET_KEY in environment',
    )
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const clerk = createClerkClient({ secretKey: CLERK_SECRET })

  console.log(`[repair] mode=${args.dryRun ? 'dry-run' : 'run'}`)
  console.log(`[repair] merchant=${args.merchantId}`)
  console.log(`[repair] staff_profile=${args.staffProfileId}`)
  console.log(`[repair] clerk_user=${args.clerkUserId}`)
  console.log(`[repair] target_role=${args.roleCode}`)
  console.log(`[repair] target_org_role=${args.clerkMembershipRole}`)

  const { data: merchantRaw, error: merchantError } = await supabase
    .from('merchants')
    .select('id, name, clerk_org_id')
    .eq('id', args.merchantId)
    .maybeSingle()

  const merchant = (merchantRaw as MerchantRow | null) ?? null

  if (merchantError) {
    throw new Error(`Merchant lookup failed: ${merchantError.message}`)
  }

  if (!merchant) {
    throw new Error(`Merchant not found: ${args.merchantId}`)
  }

  if (!merchant.clerk_org_id) {
    throw new Error(`Merchant is missing clerk_org_id: ${args.merchantId}`)
  }

  const { data: staffProfileRaw, error: staffError } = await supabase
    .from('staff_profiles')
    .select('id, merchant_id, first_name, last_name, display_name, email, phone, user_id, account_type, is_active')
    .eq('id', args.staffProfileId)
    .eq('merchant_id', args.merchantId)
    .maybeSingle()

  const staffProfile = (staffProfileRaw as StaffProfileRow | null) ?? null

  if (staffError) {
    throw new Error(`Staff profile lookup failed: ${staffError.message}`)
  }

  if (!staffProfile) {
    throw new Error(`Staff profile not found: ${args.staffProfileId}`)
  }

  const clerkUser = await clerk.users.getUser(args.clerkUserId)
  const clerkEmail = clerkUser.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase() || null

  if (!clerkEmail) {
    throw new Error('Clerk user has no primary email address')
  }

  if (args.email && clerkEmail !== args.email.trim().toLowerCase()) {
    throw new Error(`Email mismatch: clerk=${clerkEmail} expected=${args.email.trim().toLowerCase()}`)
  }

  const expectedEmail = args.email?.trim().toLowerCase() || clerkEmail
  const staffEmail = staffProfile.email?.trim().toLowerCase() || null
  if (staffEmail && staffEmail !== expectedEmail) {
    throw new Error(`Staff profile email mismatch: staff=${staffEmail} expected=${expectedEmail}`)
  }

  const { error: organizationUpsertError } = await supabase.from('organizations').upsert(
    {
      id: merchant.clerk_org_id,
      name: merchant.name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )

  if (organizationUpsertError) {
    throw new Error(`Failed to upsert organizations row: ${organizationUpsertError.message}`)
  }

  const membershipList = await clerk.organizations.getOrganizationMembershipList({
    organizationId: merchant.clerk_org_id,
    limit: 100,
  })

  let membership =
    membershipList.data.find((m) => m.publicUserData?.userId === args.clerkUserId) || null

  const planned: string[] = []

  if (!membership) {
    planned.push(`Create Clerk organization membership with role=${args.clerkMembershipRole}`)
    if (!args.dryRun) {
      membership = await clerk.organizations.createOrganizationMembership({
        organizationId: merchant.clerk_org_id,
        userId: args.clerkUserId,
        role: args.clerkMembershipRole,
      })
    }
  } else if (membership.role !== args.clerkMembershipRole) {
    planned.push(
      `Update Clerk organization membership role ${membership.role} -> ${args.clerkMembershipRole}`,
    )
    if (!args.dryRun) {
      membership = await clerk.organizations.updateOrganizationMembership({
        organizationId: merchant.clerk_org_id,
        userId: args.clerkUserId,
        role: args.clerkMembershipRole,
      })
    }
  } else {
    planned.push(`Keep existing Clerk organization membership role=${membership.role}`)
  }

  const membershipId = membership?.id ?? '<membership-id-created-on-run>'

  const { error: userUpsertError } = await supabase.from('users').upsert(
    {
      id: args.clerkUserId,
      first_name: clerkUser.firstName || staffProfile.first_name || '',
      last_name: clerkUser.lastName || staffProfile.last_name || '',
      email: clerkEmail,
      avatar_url: clerkUser.imageUrl || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: false },
  )

  if (userUpsertError) {
    throw new Error(`Failed to upsert users row: ${userUpsertError.message}`)
  }

  const { data: existingByStaffRaw, error: memberByStaffError } = await supabase
    .from('members')
    .select('id, user_id, organization_id, role, staff_profile_id')
    .eq('organization_id', merchant.clerk_org_id)
    .eq('staff_profile_id', args.staffProfileId)
    .maybeSingle()

  const existingByStaff = (existingByStaffRaw as MemberRow | null) ?? null

  if (memberByStaffError) {
    throw new Error(`Failed to query members by staff_profile_id: ${memberByStaffError.message}`)
  }

  let existingMember = existingByStaff

  if (!existingMember) {
    const { data: existingByUserRaw, error: memberByUserError } = await supabase
      .from('members')
      .select('id, user_id, organization_id, role, staff_profile_id')
      .eq('organization_id', merchant.clerk_org_id)
      .eq('user_id', args.clerkUserId)
      .maybeSingle()

    if (memberByUserError) {
      throw new Error(`Failed to query members by user_id: ${memberByUserError.message}`)
    }

    existingMember = (existingByUserRaw as MemberRow | null) ?? null
  }

  if (existingMember) {
    planned.push(`Update members row id=${existingMember.id}`)
  } else {
    planned.push(`Create members row id=${membershipId}`)
  }

  const { data: locationMembersRaw, error: locationMembersError } = await supabase
    .from('location_members')
    .select('id, location_id, merchant_id, user_id, staff_profile_id, role_code, is_active')
    .eq('merchant_id', args.merchantId)
    .eq('staff_profile_id', args.staffProfileId)

  const locationMembers = (locationMembersRaw as LocationMemberRow[] | null) ?? null

  if (locationMembersError) {
    throw new Error(`Failed to query location_members: ${locationMembersError.message}`)
  }

  if (!locationMembers || locationMembers.length === 0) {
    throw new Error('No location_members rows found for the staff profile')
  }

  planned.push(`Update ${locationMembers.length} location_members row(s) with user_id + role + active status`)
  planned.push('Update staff_profiles user_id/account_type/is_active/email')

  console.log('')
  console.log('[repair] current state')
  console.log(
    JSON.stringify(
      {
        merchant: {
          id: merchant.id,
          name: merchant.name,
          clerk_org_id: merchant.clerk_org_id,
        },
        staffProfile: {
          id: staffProfile.id,
          email: staffProfile.email,
          user_id: staffProfile.user_id,
          account_type: staffProfile.account_type,
          is_active: staffProfile.is_active,
        },
        clerkUser: {
          id: args.clerkUserId,
          email: clerkEmail,
        },
        existingMember,
        locationMemberCount: locationMembers.length,
      },
      null,
      2,
    ),
  )

  console.log('')
  console.log('[repair] planned changes')
  for (const step of planned) console.log(`- ${step}`)

  if (args.dryRun) {
    console.log('')
    console.log('[repair] dry-run complete. Re-run with --run to apply changes.')
    return
  }

  const now = new Date().toISOString()

  const { error: profileUpdateError } = await supabase
    .from('staff_profiles')
    .update({
      user_id: args.clerkUserId,
      account_type: 'clerk',
      is_active: true,
      email: expectedEmail,
      updated_at: now,
    })
    .eq('id', args.staffProfileId)
    .eq('merchant_id', args.merchantId)

  if (profileUpdateError) {
    throw new Error(`Failed to update staff_profiles: ${profileUpdateError.message}`)
  }

  for (const lm of locationMembers) {
    const { error: locationUpdateError } = await supabase
      .from('location_members')
      .update({
        user_id: args.clerkUserId,
        role_code: args.roleCode,
        is_active: true,
        updated_at: now,
      })
      .eq('id', lm.id)

    if (locationUpdateError) {
      throw new Error(`Failed to update location_members row ${lm.id}: ${locationUpdateError.message}`)
    }
  }

  if (existingMember) {
    const { error: memberUpdateError } = await supabase
      .from('members')
      .update({
        user_id: args.clerkUserId,
        organization_id: merchant.clerk_org_id,
        role: args.roleCode,
        staff_profile_id: args.staffProfileId,
        updated_at: now,
      })
      .eq('id', existingMember.id)

    if (memberUpdateError) {
      throw new Error(`Failed to update members row ${existingMember.id}: ${memberUpdateError.message}`)
    }
  } else {
    if (!membership || !membership.id) {
      throw new Error('Membership was not available when attempting to create members row')
    }

    const { error: memberInsertError } = await supabase
      .from('members')
      .insert({
        id: membership.id,
        user_id: args.clerkUserId,
        organization_id: merchant.clerk_org_id,
        role: args.roleCode,
        staff_profile_id: args.staffProfileId,
        created_at: now,
        updated_at: now,
      })

    if (memberInsertError) {
      throw new Error(`Failed to insert members row: ${memberInsertError.message}`)
    }
  }

  const { data: finalMemberRaw } = await supabase
    .from('members')
    .select('id, user_id, organization_id, role, staff_profile_id')
    .eq('organization_id', merchant.clerk_org_id)
    .eq('staff_profile_id', args.staffProfileId)
    .maybeSingle()

  const finalMember = (finalMemberRaw as MemberRow | null) ?? null

  console.log('')
  console.log('[repair] applied successfully')
  console.log(
    JSON.stringify(
      {
        merchantId: merchant.id,
        staffProfileId: args.staffProfileId,
        clerkUserId: args.clerkUserId,
        membershipId: membership?.id ?? finalMember?.id ?? null,
        member: finalMember ?? null,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error('[repair] failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
