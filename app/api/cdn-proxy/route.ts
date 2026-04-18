import { auth } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Authenticated pass-through for Bunny CDN assets.
 *
 * Bunny CDN pull zones don't return CORS headers by default, which blocks the
 * browser from `fetch()`ing an uploaded image back for re-cropping. This route
 * proxies the request server-side (no CORS) and streams the bytes back to the
 * client as a same-origin response.
 *
 * Security:
 * - Requires an authenticated Clerk session.
 * - Only allows URLs whose host matches BUNNY_CDN_HOSTNAME or ends in
 *   `.b-cdn.net` (Bunny's default hostnames), preventing SSRF into arbitrary
 *   servers.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawUrl = req.nextUrl.searchParams.get('url')
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }

  if (target.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only https URLs are allowed' }, { status: 400 })
  }

  const configuredHost = process.env.BUNNY_CDN_HOSTNAME?.toLowerCase()
  const host = target.hostname.toLowerCase()
  const hostAllowed =
    (configuredHost && host === configuredHost) || host.endsWith('.b-cdn.net')

  if (!hostAllowed) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 })
  }

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      redirect: 'follow',
      headers: { Accept: 'image/*' },
    })
  } catch (error) {
    console.error('[cdn-proxy] upstream fetch failed', error)
    return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Upstream responded ${upstream.status}` },
      { status: upstream.status || 502 },
    )
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Resource is not an image' }, { status: 415 })
  }

  const headers = new Headers()
  headers.set('Content-Type', contentType)
  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers.set('Content-Length', contentLength)
  headers.set('Cache-Control', 'private, max-age=60')

  return new NextResponse(upstream.body, { status: 200, headers })
}
