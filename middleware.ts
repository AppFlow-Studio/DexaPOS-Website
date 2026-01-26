import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
const isInternalTeamRoutes = createRouteMatcher(['/manage(.*)'])
const isMerchantRoutes = createRouteMatcher(['/dashboard(.*)'])
const isStorefrontRoutes = createRouteMatcher(['/sites(.*)'])
const isOrgSelectionRoute = createRouteMatcher(['/join-organization(.*)'])
export default clerkMiddleware(async (auth, req) => {
  // If the user is not signed in, let Clerk handle the redirect to sign-in page
  const UserSession = await auth()
  const { userId, orgId } = await auth()
  if (!UserSession.userId) {
    return NextResponse.next(); // Or auth().redirectToSignIn() if you want to force sign-in on all routes
  }

 // 1. Allow public storefronts or unauthenticated users (Clerk handles sign-in via config)
  if (!userId || isStorefrontRoutes(req)) {
    return NextResponse.next();
  }

  if (!orgId) {
    // If they are already on the selection page, let them through
    if (isOrgSelectionRoute(req)) {
      return NextResponse.next();
    }
    // Otherwise, send them to select/activate an organization
    return NextResponse.redirect(new URL('/join-organization', req.url));
  }

  if (isInternalTeamRoutes(req)) {
    // if( UserSession.orgId !== process.env.DEXA_POS_INTERNAL_TEAM_ID) {
    //   return NextResponse.redirect(new URL('/dashboard', req.url));
    // }
    return NextResponse.next();
  }


  // Check if the user is part of a dexapos organization
  const IsUserHQTeam = UserSession.orgId === process.env.DEXA_POS_INTERNAL_TEAM_ID;
  // If the user is part of the specific organization and not on the /manage route, redirect to /manage
  if (IsUserHQTeam && req.nextUrl.pathname !== '/manage') {
    return NextResponse.redirect(new URL('/manage', req.url));
  }
  // If the user is NOT part of the specific organization and not on the /dashboard route, redirect to /dashboard
  // else if (!IsUserHQTeam && !isMerchantRoutes(req)) {
  //   return NextResponse.redirect(new URL('/dashboard', req.url));
  // }

  // Allow the request to proceed if no redirection is needed
  return NextResponse.next();
}
);



export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}