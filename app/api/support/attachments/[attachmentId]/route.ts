import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import { parseSupportCdnStoragePath } from '@/lib/support/cdn'

const HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID || ''

type ParsedRange =
  | { kind: 'none' }
  | { kind: 'unsatisfiable' }
  | { kind: 'range'; start: number; end: number }

/**
 * Parses a single-range `Range: bytes=...` header against a known total size.
 *
 * Only single ranges are supported — multipart/byteranges is not required for
 * media playback and browsers do not ask for it when seeking. A multi-range
 * request degrades to a full 200 response, which is a legal answer to any Range
 * request.
 *
 * `end` is inclusive, matching the HTTP wire format.
 */
function parseRange(header: string | null, size: number): ParsedRange {
  if (!header) return { kind: 'none' }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return { kind: 'none' }

  const [, rawStart, rawEnd] = match

  // A zero-length object has no satisfiable range.
  if (size <= 0) return { kind: 'unsatisfiable' }

  let start: number
  let end: number

  if (rawStart === '') {
    // Suffix form: `bytes=-N` means the final N bytes.
    if (rawEnd === '') return { kind: 'none' }
    const suffixLength = Number(rawEnd)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { kind: 'unsatisfiable' }
    }
    start = Math.max(0, size - suffixLength)
    end = size - 1
  } else {
    start = Number(rawStart)
    if (!Number.isFinite(start)) return { kind: 'none' }
    if (rawEnd === '') {
      end = size - 1
    } else {
      end = Number(rawEnd)
      if (!Number.isFinite(end)) return { kind: 'none' }
      // A range that overruns the object is clamped, not rejected.
      end = Math.min(end, size - 1)
    }
  }

  if (start >= size || start > end) return { kind: 'unsatisfiable' }

  return { kind: 'range', start, end }
}

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
 *   4. Audit log the access. PII flag is set when an HQ admin or a carrier views
 *      a merchant's attachment; merchants viewing their own attachments are
 *      logged as a normal (non-PII) event.
 *   5. Stream the file bytes back. We genuinely log a download (not just URL
 *      issuance), and authorization is re-checked at redeem time.
 *
 * Disposition:
 *   - Default: `inline` so images render in <img>/<video> and PDFs preview.
 *   - `?download=1`: `attachment; filename="..."` to force a save dialog.
 *
 * Range requests:
 *   Video playback needs seeking, which requires HTTP Range support. We
 *   advertise `Accept-Ranges: bytes` and honour inbound `Range` headers with a
 *   206 response, fetching only the requested slice from storage rather than
 *   buffering the whole object. Without this a <video> element pulls the entire
 *   file before playing and re-pulls it on every scrub.
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
      'id, ticket_id, file_name, file_path, file_size, file_type, support_tickets:ticket_id(id, merchant_id, carrier_id)',
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
  const ticketCarrierId: string | null = ticket?.carrier_id ?? null

  // 2. Authorize. HQ admins can read anything; merchants can read their own;
  //    the carrier that owns the ticket's merchant can read it too.
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

  // Carrier access is cross-tenant: a carrier reading a merchant's attachment is
  // equivalent to the HQ case, not to a merchant reading its own. Audited as PII.
  let isOwnerCarrier = false
  if (!isHQAdmin && !isOwnerMerchant && callerOrgId && ticketCarrierId) {
    const { data: carrier } = await supabase
      .from('carriers')
      .select('id')
      .eq('clerk_org_id', callerOrgId)
      .single()
    isOwnerCarrier = !!carrier && carrier.id === ticketCarrierId
  }

  if (!isHQAdmin && !isOwnerMerchant && !isOwnerCarrier) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isCrossTenant = isHQAdmin || isOwnerCarrier

  // 3. Audit log. PII flag when HQ admin or carrier views merchant data.
  //
  // Seeking a video fires a burst of ranged requests. Logging every one at full
  // fidelity would flood audit_logs and overstate "access" in PII reporting — the
  // same distortion the signed-URL pattern was removed for. We log the opening
  // request only: a non-ranged fetch, or the `bytes=0-` opener a media element
  // sends before it starts seeking. Continuation ranges are served unlogged; the
  // opener already records who accessed the file, when, and from where.
  const size = attachment.file_size ?? 0
  const requestedRange = parseRange(req.headers.get('range'), size)
  const isOpeningRequest =
    requestedRange.kind !== 'range' || requestedRange.start === 0

  if (isOpeningRequest) {
    const user = await currentUser()
    await LogAuditEvent({
      merchantId: ticketMerchantId ?? undefined,
      action: isHQAdmin
        ? 'admin_viewed_attachment'
        : isOwnerCarrier
          ? 'carrier_viewed_attachment'
          : 'viewed_own_attachment',
      actionCategory: 'support',
      severity: 'info',
      resourceType: 'support_ticket_attachment',
      resourceId: attachmentId,
      resourceName: attachment.file_name,
      piiAccessType: isCrossTenant ? 'attachment_view' : undefined,
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
  }

  const wantsDownload = req.nextUrl.searchParams.get('download') === '1'
  const safeName = attachment.file_name.replace(/"/g, '')
  const disposition = wantsDownload
    ? `attachment; filename="${safeName}"`
    : `inline; filename="${safeName}"`

  const baseHeaders: Record<string, string> = {
    'Content-Type': attachment.file_type || 'application/octet-stream',
    'Content-Disposition': disposition,
    // Seeking requires the client to know ranges are available.
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    // Never let a CDN cache PII bytes.
    'Cache-Control': 'private, no-store, max-age=0',
  }

  // A range that cannot be satisfied must say so explicitly, with the real size,
  // so the client can retry correctly instead of treating it as a transport error.
  if (requestedRange.kind === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` },
    })
  }

  // 4. Stream bytes from the attachment's backing provider. Images/PDFs use the
  // private Supabase bucket; video rows hold a Bunny CDN URL. The raw CDN URL is
  // never returned by ticket-detail actions, so authorization and auditing stay
  // centralized in this route.
  //
  // storage-js `.download()` buffers the whole object and cannot express a Range,
  // so we hit the storage REST endpoint directly and forward the Range header.
  // The response body is piped straight through, never buffered here: a 100 MB
  // video must not sit in this process's memory.
  const isCdnAttachment = /^https:\/\//i.test(attachment.file_path)
  let objectUrl: string
  let upstreamHeaders: Record<string, string> = {}

  if (isCdnAttachment) {
    if (!attachment.file_type.startsWith('video/')) {
      return NextResponse.json({ error: 'Invalid attachment provider' }, { status: 500 })
    }

    const cdnHostname = process.env.BUNNY_CDN_HOSTNAME ?? ''
    const merchantStoragePath = ticketMerchantId
      ? parseSupportCdnStoragePath(
          attachment.file_path,
          cdnHostname,
          `merchants/${ticketMerchantId}`,
        )
      : null
    const hqStoragePath = HQ_ORG_ID
      ? parseSupportCdnStoragePath(
          attachment.file_path,
          cdnHostname,
          `organizations/${HQ_ORG_ID}`,
        )
      : null

    if (!merchantStoragePath && !hqStoragePath) {
      return NextResponse.json({ error: 'Invalid attachment URL' }, { status: 500 })
    }
    objectUrl = attachment.file_path
  } else {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 })
    }

    objectUrl = `${supabaseUrl}/storage/v1/object/support-attachments/${attachment.file_path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`
    upstreamHeaders = {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    }
  }
  if (requestedRange.kind === 'range') {
    upstreamHeaders.Range = `bytes=${requestedRange.start}-${requestedRange.end}`
  }

  const upstream = await fetch(objectUrl, {
    headers: upstreamHeaders,
    redirect: 'error',
  })

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: 'File not found in storage' },
      { status: upstream.status === 404 ? 404 : 502 },
    )
  }

  // Only claim 206 if storage actually honoured the Range. If it returned the
  // whole object (200), echoing a Content-Range we did not receive would
  // misdescribe the body and corrupt playback. Fall through to a full 200 instead.
  if (requestedRange.kind === 'range' && upstream.status === 206) {
    const { start, end } = requestedRange
    // Prefer upstream's own accounting where it gives it; ours is a clamp of the
    // requested range and should agree, but upstream is authoritative.
    const upstreamRange = upstream.headers.get('content-range')
    const upstreamLength = upstream.headers.get('content-length')
    return new Response(upstream.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': upstreamRange ?? `bytes ${start}-${end}/${size}`,
        'Content-Length': upstreamLength ?? String(end - start + 1),
      },
    })
  }

  // Full-object response. Trust upstream's Content-Length over the recorded
  // file_size: the column is metadata written at upload time, while upstream
  // describes the bytes actually being streamed.
  const fullLength = upstream.headers.get('content-length') ?? (size > 0 ? String(size) : null)

  return new Response(upstream.body, {
    headers: {
      ...baseHeaders,
      ...(fullLength ? { 'Content-Length': fullLength } : {}),
    },
  })
}
