import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextFetchEvent, NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const isInternalTeamRoutes = createRouteMatcher(['/manage(.*)'])
const isMerchantRoutes = createRouteMatcher(['/dashboard(.*)'])
const isStorefrontRoutes = createRouteMatcher(['/sites(.*)'])
const isReceiptRoutes = createRouteMatcher(['/receipts(.*)'])
// Public customer-facing invoice / pay page — opened by recipients who are NOT
// Dexa users, so it must never be gated (mirrors /receipts and /sites).
const isPublicInvoiceRoute = createRouteMatcher(['/invoice(.*)'])
const isOrgSelectionRoute = createRouteMatcher(['/join-organization(.*)'])
const isAcceptInvitationRoute = createRouteMatcher(['/accept-invitation(.*)'])
const isMarketingRoute = createRouteMatcher([
  '/',
  '/demo',
  '/features',
  '/pricing',
  '/why',
  '/hardware',
  '/industries',
  '/contact',
  '/pos-demo(.*)',
])
const isAuthRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])
// Marketing CMS admin — gated to the internal HQ team (like /manage).
const isCmsAdminRoute = createRouteMatcher(['/admin(.*)'])
// Public/self-authorizing API routes: /api/contact is an anonymous public form;
// /api/cms/* enforces HQ auth inside each handler (requireHqUser → 401);
// /api/internal/* are server-to-server webhooks (DB pg_net triggers / edge
// functions) that authenticate via the x-internal-secret header (401 on mismatch)
// and have NO Clerk session — so they must skip the middleware sign-in redirect,
// which would otherwise bounce them to /sign-in and silently break the callers
// (e.g. the snooze → OrderOut resync). All three own their own authorization.
const isPublicApiRoute = createRouteMatcher(['/api/contact(.*)', '/api/cms(.*)', '/api/internal(.*)'])
// The set of gated / app-owned route prefixes. Anything NOT in this set (and not
// already handled as public above) is treated as public marketing so the
// (marketing) [...slug] CMS catch-all can serve pages published at arbitrary
// paths. Keep this in sync when adding new gated top-level segments.
const isKnownAppRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/manage(.*)',
  '/admin(.*)',
  '/merchant(.*)',
  '/office(.*)',
  '/kiosk-preview(.*)',
  '/join-organization(.*)',
  '/api(.*)',
  '/trpc(.*)',
])

function extractStoreSlug(hostname: string): string | null {
  const hostWithoutPort = hostname.split(':')[0];

  if (process.env.NODE_ENV === 'development') {
    if (hostWithoutPort === 'localhost') return null;
    if (hostWithoutPort.endsWith('.localhost')) {
      return hostWithoutPort.replace('.localhost', '');
    }
    return null;
  }

  // Production: {slug}.dexaposai.com
  if (hostWithoutPort.endsWith('.dexaposai.com')) {
    const parts = hostWithoutPort.split('.');
    // slug.dexaposai.com → ['slug', 'dexaposai', 'com'] (3 parts)
    if (parts.length !== 3) return null;
    const subdomain = parts[0];
    const RESERVED = new Set(['www', 'api', 'app', 'admin', 'mail', 'cdn', 'assets', 'static']);
    if (RESERVED.has(subdomain)) return null;
    return subdomain;
  }

  return null;
}

type StoreMatch = {
  slug: string
  isActive: boolean
}

function extractSitesRouteSlug(pathname: string): string | null {
  const match = pathname.match(/^\/sites\/([^/]+)/)
  return match?.[1] ?? null
}

function notFoundResponse(): NextResponse {
  return new NextResponse('Not Found', { status: 404 })
}

async function getStoreBySlug(slug: string): Promise<StoreMatch | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    const { data } = await supabase
      .from('online_store_config')
      .select('slug, is_active')
      .eq('slug', slug)
      .single();

    if (!data?.slug) return null;
    return {
      slug: data.slug,
      isActive: data.is_active !== false,
    };
  } catch {
    return null;
  }
}

async function lookupCustomDomain(hostname: string): Promise<StoreMatch | null> {
  const hostWithoutPort = hostname.split(':')[0];

  if (
    hostWithoutPort === 'localhost' ||
    hostWithoutPort.endsWith('.localhost') ||
    hostWithoutPort.endsWith('.dexaposai.com')
  ) {
    return null;
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    const { data } = await supabase
      .from('online_store_config')
      .select('slug, is_active')
      .eq('custom_domain', hostWithoutPort)
      .single();

    if (!data?.slug) return null;
    return {
      slug: data.slug,
      isActive: data.is_active !== false,
    };
  } catch {
    return null;
  }
}

const clerkProxy = clerkMiddleware(async (auth, req) => {
  // ── Subdomain routing (before any Clerk auth) ──────────────────────
  const hostname = req.headers.get('host') || '';
  const extractedSlug = extractStoreSlug(hostname);
  let storeMatch: StoreMatch | null = null;

  // Custom domain fallback (production only)
  if (extractedSlug) {
    storeMatch = await getStoreBySlug(extractedSlug);
  } else if (process.env.NODE_ENV !== 'development') {
    storeMatch = await lookupCustomDomain(hostname);
  }

  if (storeMatch?.slug) {
    if (!storeMatch.isActive) {
      return notFoundResponse();
    }

    const { slug } = storeMatch;
    const url = req.nextUrl.clone();
    url.pathname = `/sites/${slug}${url.pathname === '/' ? '' : url.pathname}`;

    const response = NextResponse.rewrite(url);
    response.headers.set('x-store-slug', slug);
    return response;
  }

  const directStoreSlug = extractSitesRouteSlug(req.nextUrl.pathname);
  if (directStoreSlug) {
    const directStoreMatch = await getStoreBySlug(directStoreSlug);
    if (!directStoreMatch?.slug || !directStoreMatch.isActive) {
      return notFoundResponse();
    }
  }

  // ── Standard Clerk auth flow ───────────────────────────────────────
  const UserSession = await auth()
  const { userId, orgId } = await auth()

  // Public marketing + auth routes — never gate
  if (isMarketingRoute(req) || isAuthRoute(req)) {
    // Punt signed-in MERCHANTS from the root to their dashboard, but let HQ
    // admins (who own the marketing CMS) and any explicit CMS preview actually
    // view the site — otherwise "View Site" / preview bounce straight back.
    const isHqUser = orgId === process.env.DEXA_POS_INTERNAL_TEAM_ID
    const wantsCmsPreview = req.nextUrl.searchParams.has('cmsPreview')
    if (req.nextUrl.pathname === '/' && userId && !isHqUser && !wantsCmsPreview) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next();
  }

  if (
    isAcceptInvitationRoute(req) ||
    isStorefrontRoutes(req) ||
    isReceiptRoutes(req) ||
    isPublicInvoiceRoute(req) ||
    isPublicApiRoute(req)
  ) {
    return NextResponse.next();
  }

  // Public-by-default: any path that isn't a known gated app route is public
  // marketing — served by the (marketing) [...slug] CMS catch-all, or a 404.
  // This lets HQ publish CMS pages at arbitrary paths without a middleware change.
  if (!isKnownAppRoute(req)) {
    return NextResponse.next();
  }

  // Unauthed user on a protected route → send to sign-in
  if (!UserSession.userId || !userId) {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  if (!orgId) {
    if (isOrgSelectionRoute(req)) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/join-organization', req.url));
  }

  if (isInternalTeamRoutes(req)) {
    if( UserSession.orgId !== process.env.DEXA_POS_INTERNAL_TEAM_ID) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  // Marketing CMS admin — internal HQ team only (handled before the HQ
  // redirect-to-/manage rule so HQ users aren't bounced off /admin).
  if (isCmsAdminRoute(req)) {
    if (UserSession.orgId !== process.env.DEXA_POS_INTERNAL_TEAM_ID) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  const IsUserHQTeam = UserSession.orgId === process.env.DEXA_POS_INTERNAL_TEAM_ID;
  if (
    IsUserHQTeam &&
    req.nextUrl.pathname !== '/manage' &&
    !req.nextUrl.pathname.startsWith('/api/') &&
    !req.nextUrl.pathname.startsWith('/trpc/')
  ) {
    // Allow HQ admins onto /dashboard/* when a valid impersonation cookie is
    // present. Server actions re-validate via touch_impersonation_session;
    // middleware's only job is to suppress the redirect.
    if (isMerchantRoutes(req)) {
      const cookie = req.cookies.get('x-impersonate-merchant-id')?.value;
      const isUuid = !!cookie && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cookie);
      if (isUuid) {
        return NextResponse.next();
      }
    }
    return NextResponse.redirect(new URL('/manage', req.url));
  }

  return NextResponse.next();
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  return clerkProxy(req, event);
}

export const config = {
  matcher: [
    '/((?!_next|/api/ingest|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
