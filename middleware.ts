import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const isInternalTeamRoutes = createRouteMatcher(['/manage(.*)'])
const isMerchantRoutes = createRouteMatcher(['/dashboard(.*)'])
const isStorefrontRoutes = createRouteMatcher(['/sites(.*)'])
const isOrgSelectionRoute = createRouteMatcher(['/join-organization(.*)'])

function extractStoreSlug(hostname: string): string | null {
  const hostWithoutPort = hostname.split(':')[0];

  if (process.env.NODE_ENV === 'development') {
    if (hostWithoutPort === 'localhost') return null;
    if (hostWithoutPort.endsWith('.localhost')) {
      return hostWithoutPort.replace('.localhost', '');
    }
    return null;
  }

  // Production: order.{slug}.dexaposai.com
  if (hostWithoutPort.endsWith('.dexaposai.com')) {
    const parts = hostWithoutPort.split('.');
    // order.pizzapalace.dexapos.com → ['order', 'pizzapalace', 'dexaposai', 'com']
    return parts.length >= 4 ? parts[1] : null;
  }

  return null;
}

async function lookupCustomDomain(hostname: string): Promise<string | null> {
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
      .select('slug')
      .eq('custom_domain', hostWithoutPort)
      .eq('is_active', true)
      .single();

    return data?.slug ?? null;
  } catch {
    return null;
  }
}

export default clerkMiddleware(async (auth, req) => {
  // ── Subdomain routing (before any Clerk auth) ──────────────────────
  const hostname = req.headers.get('host') || '';
  let slug = extractStoreSlug(hostname);

  // Custom domain fallback (production only)
  if (!slug && process.env.NODE_ENV !== 'development') {
    slug = await lookupCustomDomain(hostname);
  }

  if (slug) {
    const url = req.nextUrl.clone();
    url.pathname = `/sites/${slug}${url.pathname === '/' ? '' : url.pathname}`;

    const response = NextResponse.rewrite(url);
    response.headers.set('x-store-slug', slug);
    return response;
  }

  // ── Standard Clerk auth flow (unchanged) ───────────────────────────
  const UserSession = await auth()
  const { userId, orgId } = await auth()
  if (!UserSession.userId) {
    return NextResponse.next();
  }

  if (!userId || isStorefrontRoutes(req)) {
    return NextResponse.next();
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

  const IsUserHQTeam = UserSession.orgId === process.env.DEXA_POS_INTERNAL_TEAM_ID;
  if (IsUserHQTeam && req.nextUrl.pathname !== '/manage') {
    return NextResponse.redirect(new URL('/manage', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
