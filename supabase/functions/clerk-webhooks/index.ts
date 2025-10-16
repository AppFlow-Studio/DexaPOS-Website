import { createClient } from 'npm:@supabase/supabase-js'
import { verifyWebhook } from 'npm:@clerk/backend/webhooks'
import { createClerkClient } from 'npm:@clerk/backend'
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
      console.log('User created:', event.data)
      // Handle user creation
      const { data: user, error } = await supabase
        .from('users')
        .insert([
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
        ])
        .select()
        .single()

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
            role: event.data.public_metadata?.role || 'org:member'
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
      const { data, error } = await supabase
        .from('members')
        .insert([
          {
            id: event.data.id,
            user_id: event.data.public_user_data?.user_id,
            organization_id: event.data.organization?.id,
            created_at: new Date(event.data.created_at).toISOString(),
            updated_at: new Date(event.data.updated_at).toISOString(),
          },
        ])
        .select()
        .single()

      if (error) {
        console.error('Error updating member:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
      }

      return new Response(JSON.stringify({ data }), { status: 200 })
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

    default: {
      // Unhandled event type
      console.log('Unhandled event type:', JSON.stringify(event, null, 2))
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
  }
})