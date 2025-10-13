import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
const isInternalTeamRoutes = createRouteMatcher(['/manage(.*)'])
const isMerchantRoutes = createRouteMatcher(['/dashboard(.*)'])

export default clerkMiddleware(async (auth, req) => {
  // If the user is not signed in, let Clerk handle the redirect to sign-in page
  const UserSession = await auth()
  if (!UserSession.userId) {
    return NextResponse.next(); // Or auth().redirectToSignIn() if you want to force sign-in on all routes
  }

  if (isInternalTeamRoutes(req)) {
    if( UserSession.orgId !== process.env.DEXA_POS_INTERNAL_TEAM_ID) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }


  // Check if the user is part of a dexapos organization
  const userHasSpecificOrg = UserSession.orgId === process.env.DEXA_POS_INTERNAL_TEAM_ID;

  // If the user is part of the specific organization and not on the /manage route, redirect to /manage
  if (userHasSpecificOrg && req.nextUrl.pathname !== '/manage') {
    return NextResponse.redirect(new URL('/manage', req.url));
  }
  // If the user is NOT part of the specific organization and not on the /dashboard route, redirect to /dashboard
  else if (!userHasSpecificOrg && req.nextUrl.pathname !== '/dashboard') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

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