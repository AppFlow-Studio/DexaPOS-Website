import { createClient } from 'npm:@supabase/supabase-js'
import { verifyWebhook } from 'npm:@clerk/backend/webhooks'
import { createClerkClient } from 'npm:@clerk/backend'
// TODO: Push This To Supabase i added the public_metadata to the organizations table 11-17-2025
Deno.serve(async (req) => {
  // Verify webhook signature
  const webhookSecret = Deno.env.get('CLERK_WEBHOOK_SECRET')

  if (!webhookSecret) {
    return new Response('Webhook secret not configured', { status: 500 })
  }

  const event = await verifyWebhook(req, { signingSecret: webhookSecret })

  // Create supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clerkSecretKey = Deno.env.get('CLERK_SECRET_KEY')
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response('Supabase credentials not configured', { status: 500 })
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  switch (event.type) {
    case 'user.created': {
      // Handle user creation
      const { data: user, error } = await supabase
        .from('users')
        .upsert([
          {
            id: event.data.id,
            first_name: event.data.first_name,
            last_name: event.data.last_name,
            avatar_url: event.data.image_url,
            email: event.data.email_addresses[0].email_address,
            public_metadata: event.data.public_metadata,
            created_at: new Date(event.data.created_at).toISOString(),
            updated_at: new Date(event.data.updated_at).toISOString(),
          },
        ], { onConflict: 'id' }) // Ensure we update if ID exists

      console.log('User created:', event.data)
      console.log('User Supabase Response:', user)
      console.log('User Error:', error)

      //Check if public metadata has a attached organizationid, if so create clerkorganizationmembership
      if (event.data.public_metadata?.organizationId) {

        //Check for pending invite and update the status
        const { data: pendingInvite, error: pendingInviteError } = await supabase
          .from('pending_org_admin_invites')
          .select('id')
          .eq('organization_id', event.data.public_metadata?.organizationId)
          .eq('email', event.data.email_addresses[0].email_address)
          .eq('status', 'pending')
          .limit(1)
          .single()

        if (pendingInvite) {
          const clerkClient = createClerkClient({ secretKey: clerkSecretKey! })
          await clerkClient.organizations.createOrganizationMembership({
            organizationId: event.data.public_metadata?.organizationId,
            userId: event.data.id,
            role: `org:${event.data.public_metadata?.level_type || 'member'}`
          });

          //Update the pending invite status to accepted
          const { data: updatedPendingInvite, error: updatedPendingInviteError } = await supabase
            .from('pending_org_admin_invites')
            .update({
              status: 'accepted',
              accepted_at: new Date(event.data.updated_at).toISOString(),
              clerk_user_id: event.data.id,
            })
            .eq('id', pendingInvite.id)
            .select()
            .single()
        }
        if (error) {
          console.error('Error creating user:', error)
          return new Response(JSON.stringify({ error: error.message }), { status: 500 })
        }

        return new Response(JSON.stringify({ user }), { status: 200 })
      }

      // Check for merchant location invites and update the status
    }

    case 'user.updated': {
      // Handle user update
      const { data: user, error } = await supabase
        .from('users')
        .update({
          first_name: event.data.first_name,
          last_name: event.data.last_name,
          email: event.data.email_addresses[0].email_address,
          avatar_url: event.data.image_url,
          public_metadata: event.data.public_metadata,
          updated_at: new Date(event.data.updated_at).toISOString(),
        })
        .eq('id', event.data.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating user:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }

      return new Response(JSON.stringify({ user }), { status: 200 })
    }

    case 'user.deleted': {
      const { data, error } = await supabase
        .from('users')
        .delete()
        .eq('id', event.data.id)
        .select()
        .single()
      if (error) {
        console.error('Error deleting user:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }
      return new Response(JSON.stringify({ data }), { status: 200 })
    }

    case 'organization.created': {
      // Handle organization creation
      const { data, error } = await supabase
        .from('organizations')
        .insert([
          {
            id: event.data.id,
            name: event.data.name,
            created_at: new Date(event.data.created_at).toISOString(),
            updated_at: new Date(event.data.updated_at).toISOString(),
            public_metadata: event.data.public_metadata,
          },
        ])
        .select()
        .single()

      if (event.data.public_metadata.org_type === 'carrier') {
        const { data, error } = await supabase
          .from('carriers')
          .insert([
            {
              name: event.data.name,
              clerk_org_id: event.data.id,
              public_metadata: event.data.public_metadata,
              created_at: new Date(event.data.created_at).toISOString(),
              updated_at: new Date(event.data.updated_at).toISOString(),
            },
          ])
          .select()
          .single()
      }

      if (event.data.public_metadata.org_type === 'merchant') {
        const { data, error } = await supabase
          .from('merchants')
          .insert([
            {
              name: event.data.name,
              clerk_org_id: event.data.id,
              carrier_id: event.data.public_metadata.carrierId,
              public_metadata: event.data.public_metadata,
              type: event.data.public_metadata.merchant_type,
              created_at: new Date(event.data.created_at).toISOString(),
              updated_at: new Date(event.data.updated_at).toISOString(),
            },
          ])
          .select()
          .single()
      }


      if (error) {
        console.error('Error updating owner:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }

      return new Response(JSON.stringify({ data }), { status: 200 })
    }

    case 'organization.updated': {
      const { data, error } = await supabase
        .from('organizations')
        .update({
          name: event.data.name,
          imageURL: event.data.public_metadata.imageURL,
          public_metadata: event.data.public_metadata,
          updated_at: new Date(event.data.updated_at).toISOString(),
        })
        .eq('id', event.data.id)
        .select()
        .single()

      if (event.data.public_metadata.org_type === 'carrier') {
        const { data, error } = await supabase
          .from('carriers')
          .update({
            name: event.data.name,
            clerk_org_id: event.data.id,
            updated_at: new Date(event.data.updated_at).toISOString(),
          }
          ).eq('clerk_org_id', event.data.id)
          .select()
          .single()
      }

      if (event.data.public_metadata.org_type === 'merchant') {
        const { data, error } = await supabase
          .from('merchants')
          .update({
            name: event.data.name,
            clerk_org_id: event.data.id,
            public_metadata: event.data.public_metadata,
            updated_at: new Date(event.data.updated_at).toISOString(),
          }
          ).eq('clerk_org_id', event.data.id)
      }

      if (error) {
        console.error('Error updating owner:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }

      return new Response(JSON.stringify({ data }), { status: 200 })
    }

    case 'organization.deleted': {
      const { data, error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', event.data.id)

      // check if logo image is in storage and delete it
      const { data: logoData, error: logoError } = await supabase.storage.from('Organizations-Logos').delete([event.data.id.toString() + '.png'])

      if (error) {
        console.error('Error deleting organization:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }

      return new Response(JSON.stringify({ data }), { status: 200 })
    }

    case 'organizationMembership.created': {
      const userId = event.data.public_user_data?.user_id
      const organizationId = event.data.organization?.id
      const createdAt = new Date(event.data.created_at).toISOString()
      const updatedAt = new Date(event.data.updated_at).toISOString()

      try {
          // --- CRITICAL FIX: ENSURE USER EXISTS FIRST ---
          // To prevent FK errors on staff_profiles if this webhook beats user.created
          const userData = event.data.public_user_data

          // Upsert user based on the limited public data we have here
          // The real user.created webhook will update this with full details later
          const { error: userUpsertError } = await supabase
            .from('users')
            .upsert({
              id: userId,
              first_name: userData.first_name,
              last_name: userData.last_name,
              email: userData.identifier, // Usually email in this context
              avatar_url: userData.image_url,
              // We don't have public_metadata here, but user.created will fill it
              updated_at: updatedAt
            }, { onConflict: 'id', ignoreDuplicates: true })
          // ignoreDuplicates ensures we don't overwrite if user.created ran first

          if (userUpsertError) {
            console.error('[organizationMembership.created] Failed to ensure user exists:', userUpsertError)
            // We continue anyway, hoping user exists, otherwise next step fails
          }

          // Get user's publicMetadata (contains our custom data)
          const clerkClient = createClerkClient({ secretKey: clerkSecretKey! })
          const user = await clerkClient.users.getUser(userId)
          const userMetadata = user.publicMetadata || {}

          // Determine merchant ID (from membership or user metadata)
          const merchantIdFromMembership = event.data?.public_metadata?.merchantId
          const merchantIdFromUser = userMetadata?.merchantId
          const merchantId = merchantIdFromMembership || merchantIdFromUser

          if (!merchantId) {
            console.error('[organizationMembership.created] No merchantId found')
            return new Response(
              JSON.stringify({ error: 'merchantId not found in metadata' }),
              { status: 400 }
            )
          }

          // Get location assignments (from membership or user metadata)  - using camelCase
          const locationAssignments =
            event.data?.public_metadata?.locationAssignments ||
            userMetadata?.locationAssignments ||
            []

          console.log('[organizationMembership.created] Location assignments:', locationAssignments)

          // Determine role
          const roleCode =
            event.data?.public_metadata?.roleCode ||
            userMetadata?.roleCode ||
            'staff'

          // Check creation type
          const creationType = userMetadata?.creationType || 'invitation'
          const isDirectCreation = creationType === 'direct'

          // 1. Check if staff_profile already exists (for direct creation)
          let staffProfile
          const { data: existingProfile } = await supabase
            .from('staff_profiles')
            .select('id')
            .eq('user_id', userId)
            .eq('merchant_id', merchantId)
            .maybeSingle()

          if (existingProfile) {
            staffProfile = existingProfile
            console.log('[organizationMembership.created] Using existing staff_profile:', staffProfile.id)
          } else {
            // Create staff_profile if it doesn't exist (for invitation flow)
            const { data: newProfile, error: profileError } = await supabase
              .from('staff_profiles')
              .insert({
                merchant_id: merchantId,
                user_id: userId,
                first_name: user.firstName || userMetadata?.firstName || '',
                last_name: user.lastName || userMetadata?.lastName || '',
                email: user.emailAddresses[0]?.emailAddress || '',
                phone: userMetadata?.phone || null,
                public_metadata : userMetadata,
                account_type: 'clerk',
                is_active: true,
              })
              .select()
              .single()

            if (profileError) {
              console.error('[organizationMembership.created] Failed to create staff profile:', profileError)
              return new Response(
                JSON.stringify({ error: profileError.message }),
                { status: 500 }
              )
            }
            staffProfile = newProfile
            console.log('[organizationMembership.created] Created new staff_profile:', staffProfile.id)
          }

          // 2. Create member record
          const { data: member, error: memberError } = await supabase
            .from('members')
            .upsert({
              id: event.data.id,
              user_id: userId,
              staff_profile_id: staffProfile.id,
              organization_id: organizationId,
              role : roleCode,
              created_at: createdAt,
              updated_at: updatedAt,
            })
            .select()
            .single()

          if (memberError) {
            console.error('[organizationMembership.created] Error creating member:', memberError)
            return new Response(
              JSON.stringify({ error: memberError.message }),
              { status: 500 }
            )
          }

          console.log('[organizationMembership.created] Created member:', member.id)

          // 3. Create location_members records (using camelCase field names)
          if (locationAssignments && locationAssignments.length > 0) {
            const locationMembersData = locationAssignments.map((assignment: any) => ({
              location_id: assignment.locationId,
              merchant_id: merchantId,
              user_id: userId,
              staff_profile_id: staffProfile.id,
              role_code: assignment.roleCode || roleCode,
              is_primary_location: assignment.isPrimaryLocation || false,
              is_active: true,
              hourly_rate: assignment.hourlyRate || null,
              employment_type: assignment.employmentType || null,
              pin_code: assignment.pinCode || null,
              assigned_at: createdAt,
              updated_at: updatedAt,
            }))

            const { error: locationMembersError } = await supabase
              .from('location_members')
              .insert(locationMembersData)

            if (locationMembersError) {
              console.error('[organizationMembership.created] Error creating location members:', locationMembersError)
              return new Response(
                JSON.stringify({ error: locationMembersError.message }),
                { status: 500 }
              )
            }

            console.log('[organizationMembership.created] Created location_members:', locationMembersData.length)
          }

          // 4. Update location_invites if this was from an invitation
          if (!isDirectCreation) {
            await supabase
              .from('location_invites')
              .update({
                status: 'accepted',
                accepted_at: createdAt,
                accepted_by_user_id: userId,
              })
              .eq('email', user.emailAddresses[0]?.emailAddress)
              .eq('status', 'pending')
              .eq('merchant_id', merchantId)

            console.log('[organizationMembership.created] Updated location_invites for invitation flow')
          }

          return new Response(
            JSON.stringify({ success: true, member_id: member.id }),
            { status: 200 }
          )

        } catch (error) {
          console.error('[organizationMembership.created] Unexpected error:', error)
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500 }
          )
        }
      }

    case 'organizationMembership.updated': {
      const { data, error } = await supabase
        .from('members')
        .update({
          user_id: event.data.public_user_data?.user_id,
          organization_id: event.data.organization?.id,
          updated_at: new Date(event.data.updated_at).toISOString(),
        })
        .eq('id', event.data.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating member:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }

      return new Response(JSON.stringify({ data }), { status: 200 })
    }


    case 'organizationInvitation.accepted': {
      const clerkInviteId = event.data.id
      const { data, error } = await supabase
        .from('location_invites')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('clerk_invite_id', clerkInviteId)


      if (error) {
        console.error('Error updating location invites:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }

      return new Response(JSON.stringify({ data }), { status: 200 })
      // TODO: See how i can shift admin and etc logic here
    }

    default: {
      // Unhandled event type
      console.log('Unhandled event type:', JSON.stringify(event, null, 2))
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
  }
})