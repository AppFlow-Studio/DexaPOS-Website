import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { ArrowRight, LayoutDashboard, PlayCircle, Settings } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { SignOutButtonClient } from './sign-out-button'
import { AuthBrandPanel } from '../brand-panel'
import { ThemedSignIn } from '../clerk-form'

const DEXA_HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Log in to your DexaPOS account.',
}

export default async function SignInPage() {
  const { orgId, userId } = await auth()
  const isHQ = !!orgId && !!DEXA_HQ_ORG_ID && orgId === DEXA_HQ_ORG_ID

  const primaryDestination = isHQ
    ? { href: '/manage', label: 'Go to Admin Panel', icon: Settings }
    : { href: '/dashboard', label: 'Go to Dashboard', icon: LayoutDashboard }
  const PrimaryIcon = primaryDestination.icon

  return (
    // `dvh`, not `vh`: mobile browser chrome overlays `100vh`, which cropped
    // the submit button under Safari's toolbar.
    <div className="flex min-h-[100dvh] w-full bg-background">
      {/* Form half. Padding tightens on short viewports so the whole form —
          heading through footer — clears a 633px-tall laptop window without
          scrolling; `overflow-y-auto` stays as the safety net for anything
          shorter still. */}
      <main className="flex w-full flex-col justify-center overflow-y-auto px-5 py-6 sm:px-10 lg:py-10 lg:w-1/2 xl:w-[45%]">
        <div className="mx-auto flex w-full max-w-sm flex-col">
          {/* Brand lockup, mobile only — the panel carries it from `lg` up. */}
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <Image
              src="/dexalogolight.png"
              alt=""
              width={36}
              height={36}
              priority
              className="h-9 w-9 rounded-lg object-contain dark:hidden"
            />
            <Image
              src="/dexalogodark.png"
              alt=""
              width={36}
              height={36}
              priority
              className="hidden h-9 w-9 rounded-lg object-contain dark:block"
            />
            <span className="text-lg font-semibold tracking-tight text-foreground">
              DexaPOS
            </span>
          </div>

          {!userId ? (
            <>
              {/* Centered to sit as the focal point of this half. The Clerk
                  form below keeps its own left-aligned labels — centering
                  those would hurt scannability of the fields themselves. */}
              <div className="mb-5 text-center">
                <h1 className="text-[1.75rem] font-semibold tracking-tight text-foreground">
                  Welcome back
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Sign in below to manage your restaurant.
                </p>
              </div>

              <ThemedSignIn />

              <div className="mt-5 flex flex-col items-center border-t border-border pt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Need help?{' '}
                  <Link
                    href="/contact"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Contact support
                  </Link>
                </p>

                {/* The brand panel carries this CTA from `lg` up, where it is
                    hidden — so repeat it here for phones and tablets only. */}
                <Link
                  href="/demo"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline lg:hidden"
                >
                  <PlayCircle className="h-4 w-4" />
                  Try the live demo
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6 text-center">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  You&apos;re signed in
                </h1>
                <p className="mt-2 text-muted-foreground">
                  {isHQ
                    ? 'You have HQ admin access.'
                    : 'Pick up right where you left off.'}
                </p>
              </div>

              <Link
                href={primaryDestination.href}
                className="flex w-full items-center justify-between rounded-xl bg-foreground px-4 py-3 font-medium text-background transition-colors hover:bg-foreground/90"
              >
                <span className="flex items-center gap-2">
                  <PrimaryIcon className="h-4 w-4" />
                  {primaryDestination.label}
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>

              <SignOutButtonClient />
            </>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} DexaPOS. All rights reserved.
          </p>
        </div>
      </main>

      <AuthBrandPanel />
    </div>
  )
}
