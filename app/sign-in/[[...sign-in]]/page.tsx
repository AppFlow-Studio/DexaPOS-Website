import { SignIn, SignedIn, SignedOut, SignOutButton } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { ArrowRight, LayoutDashboard, Settings, LogOut } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

const DEXA_HQ_ORG_ID = process.env.DEXA_POS_INTERNAL_TEAM_ID

export default async function SignInPage() {
  const { orgId } = await auth()
  const isHQ = !!orgId && !!DEXA_HQ_ORG_ID && orgId === DEXA_HQ_ORG_ID

  const primaryDestination = isHQ
    ? { href: '/manage', label: 'Go to Admin Panel', icon: Settings }
    : { href: '/dashboard', label: 'Go to Dashboard', icon: LayoutDashboard }
  const PrimaryIcon = primaryDestination.icon

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-background via-background to-muted/30 px-4 py-10">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="flex flex-col items-center gap-3 mb-10">
          <Image
            src="/dexalogolight.png"
            alt="DexaPOS"
            width={56}
            height={56}
            priority
            className="h-14 w-14 rounded-xl object-contain"
          />
          <span className="text-xl font-semibold tracking-tight text-foreground">
            DexaPOS
          </span>
        </div>

        <SignedOut>
          <div className="w-full">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-semibold text-foreground mb-2">
                Welcome back.
              </h1>
              <p className="text-muted-foreground">
                Log in to your account below.
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl shadow-sm p-2 sm:p-4">
              <SignIn
                signInUrl="/sign-in"
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    card: 'shadow-none border-0 bg-transparent w-full',
                    headerTitle: 'hidden',
                    headerSubtitle: 'hidden',
                    formButtonPrimary:
                      'bg-foreground hover:bg-foreground/90 text-background',
                    socialButtonsBlockButton:
                      'border-border hover:bg-muted/50',
                    formFieldInput: 'border-border focus:border-primary',
                    formFieldLabel: 'text-foreground',
                    formFieldInputShowPasswordButton:
                      'text-muted-foreground hover:text-foreground',
                    footerActionLink: 'text-primary hover:text-primary/80',
                    formResendCodeLink: 'text-primary hover:text-primary/80',
                    otpCodeFieldInput: 'border-border focus:border-primary',
                    formFieldSuccessText: 'text-green-600',
                    formFieldErrorText: 'text-destructive',
                    alertText: 'text-destructive',
                    identityPreviewText: 'text-muted-foreground',
                    formHeaderTitle: 'text-foreground',
                    formHeaderSubtitle: 'text-muted-foreground',
                  },
                }}
              />
            </div>
          </div>
        </SignedOut>

        <SignedIn>
          <div className="w-full bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h2 className="text-2xl font-semibold text-card-foreground mb-1">
              Welcome back!
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {isHQ
                ? 'You have HQ admin access.'
                : 'Pick up right where you left off.'}
            </p>

            <Link
              href={primaryDestination.href}
              className="flex items-center justify-between w-full px-4 py-3 bg-foreground text-background rounded-xl font-medium hover:bg-foreground/90 transition-colors"
            >
              <span className="flex items-center gap-2">
                <PrimaryIcon className="w-4 h-4" />
                {primaryDestination.label}
              </span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <SignOutButton>
              <button className="mt-3 flex items-center justify-center gap-2 w-full px-4 py-3 text-muted-foreground rounded-xl font-medium hover:bg-muted/60 transition-colors">
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </SignOutButton>
          </div>
        </SignedIn>

        <p className="mt-8 text-xs text-muted-foreground">
          © {new Date().getFullYear()} DexaPOS. All rights reserved.
        </p>
      </div>
    </div>
  )
}
