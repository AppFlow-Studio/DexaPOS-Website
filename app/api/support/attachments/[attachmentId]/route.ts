import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'

const HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID || ''

/**
 * Authenticated proxy for support ticket attachments.
 *
 * Replaces the previous pattern of generating bulk 1-hour signed URLs at page-load
 * time (which was unauditable: URLs could be redeemed off-network, and many were
 * generated and never redeemed, overstating "access").
 *
 * On every request:
 *   1. Verify Clerk session.
 *   2. Look up attachment → ticket → merchant.
 *   3. Authorize: caller is HQ admin OR caller's org owns the ticket's merchant.
 *   4. Audit log the access. PII flag is set when an HQ admin views a merchant's
 *      attachment; merchants viewing their own attachments are logged as a
 *      normal (non-PII) event.
 *   5. Stream the file bytes back. We genuinely log a download (not just URL
 *      issuance), and authorization is re-checked at redeem time.
 *
 * Disposition:
 *   - Default: `inline` so images render in <img> and PDFs preview in-browser.
 *   - `?download=1`: `attachment; filename="..."` to force a save dialog.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await ctx.params
  if (!attachmentId) {
    return NextResponse.json({ error: 'Missing attachment id' }, { status: 400 })
  }

  const session = await auth()
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()

  // 1. Resolve attachment + ticket + merchant
  const { data: attachment, error: attachmentError } = await supabase
    .from('support_ticket_attachments')
    .select(
      'id, ticket_id, file_name, file_path, file_size, file_type, support_tickets:ticket_id(id, merchant_id)',
    )
    .eq('id', attachmentId)
    .single()

  if (attachmentError || !attachment) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  const ticket = Array.isArray(attachment.support_tickets)
    ? attachment.support_tickets[0]
    : attachment.support_tickets
  const ticketMerchantId: string | null = ticket?.merchant_id ?? null

  // 2. Authorize. HQ admins can read anything; merchants can only read their own.
  const callerOrgId = session.orgId
  const isHQAdmin = !!HQ_ORG_ID && callerOrgId === HQ_ORG_ID

  let isOwnerMerchant = false
  if (!isHQAdmin && callerOrgId && ticketMerchantId) {
    const { data: merchant } = await supabase
      .from('merchants')
      .select('id')
      .eq('clerk_org_id', callerOrgId)
      .single()
    isOwnerMerchant = !!merchant && merchant.id === ticketMerchantId
  }

  if (!isHQAdmin && !isOwnerMerchant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. Audit log. PII flag only when HQ admin views merchant data.
  const user = await currentUser()
  await LogAuditEvent({
    merchantId: ticketMerchantId ?? undefined,
    action: isHQAdmin ? 'admin_viewed_attachment' : 'viewed_own_attachment',
    actionCategory: 'support',
    severity: 'info',
    resourceType: 'support_ticket_attachment',
    resourceId: attachmentId,
    resourceName: attachment.file_name,
    piiAccessType: isHQAdmin ? 'attachment_view' : undefined,
    metadata: {
      ticket_id: attachment.ticket_id,
      file_name: attachment.file_name,
      file_size: attachment.file_size,
      file_type: attachment.file_type,
      actor_email: user?.emailAddresses?.[0]?.emailAddress,
      ip:
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        undefined,
      user_agent: req.headers.get('user-agent') || undefined,
    },
  })

  // 4. Stream bytes from storage. Service-role client bypasses RLS — we've
  // already verified authorization above.
  const { data: blob, error: downloadError } = await supabase.storage
    .from('support-attachments')
    .download(attachment.file_path)

  if (downloadError || !blob) {
    return NextResponse.json(
      { error: downloadError?.message ?? 'File not found in storage' },
      { status: 404 },
    )
  }

  const wantsDownload = req.nextUrl.searchParams.get('download') === '1'
  const safeName = attachment.file_name.replace(/"/g, '')
  const disposition = wantsDownload
    ? `attachment; filename="${safeName}"`
    : `inline; filename="${safeName}"`

  return new Response(blob.stream(), {
    headers: {
      'Content-Type': attachment.file_type || 'application/octet-stream',
      'Content-Length': String(attachment.file_size),
      'Content-Disposition': disposition,
      // Never let a CDN cache PII bytes.
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
}
