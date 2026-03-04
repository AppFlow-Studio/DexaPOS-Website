import { SignIn, SignedIn, SignedOut, SignOutButton } from '@clerk/nextjs'
import { Shield, ArrowRight, LayoutDashboard, Settings, LogOut } from 'lucide-react'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="max-h-screen h-[100vh] items-center justify-center w-full flex">
      {/* Left Section - Login Form */}
      <div className="flex h-full w-full items-center justify-center flex-col bg-background">
        <div className="max-w-md mx-auto w-full h-full items-center flex flex-col justify-center">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">DexaPOS</span>
          </div>

          {/* Welcome Message */}
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-foreground mb-2">
              Welcome back.
            </h1>
            <p className="text-muted-foreground">
              Log in to your account below.
            </p>
          </div>

          {/* Clerk Sign In Component */}
          <SignedOut>
            <div className="mb-6">
              <SignIn
                signUpUrl='/sign-up'
                signInUrl='/'
                appearance={{
                  elements: {
                    formButtonPrimary: 'bg-foreground hover:bg-foreground/90 text-background',
                    card: 'shadow-none border-0 bg-transparent',
                    headerTitle: 'hidden',
                    headerSubtitle: 'hidden',
                    socialButtonsBlockButton: 'border-border hover:bg-muted/50',
                    formFieldInput: 'border-border focus:border-primary',
                    footerActionLink: 'text-primary hover:text-primary/80',
                    identityPreviewText: 'text-muted-foreground',
                    formFieldLabel: 'text-foreground',
                    formFieldInputShowPasswordButton: 'text-muted-foreground hover:text-foreground',
                    formResendCodeLink: 'text-primary hover:text-primary/80',
                    otpCodeFieldInput: 'border-border focus:border-primary',
                    formFieldSuccessText: 'text-green-600',
                    formFieldErrorText: 'text-destructive',
                    alertText: 'text-destructive',
                    formHeaderTitle: 'text-foreground',
                    formHeaderSubtitle: 'text-muted-foreground',
                  }
                }}
              />
            </div>

            {/* Sign Up Option */}
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                Need to create a new organization?{' '}
                <Link href="/sign-up" className="text-primary hover:text-primary/80 font-medium">
                  Sign up
                </Link>
              </p>
            </div>
          </SignedOut>

          <SignedIn>
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm w-full">
              <h2 className="text-xl font-semibold text-card-foreground mb-2">
                Welcome back!
              </h2>
              <p className="text-muted-foreground mb-6">
                Where would you like to go?
              </p>
              <div className="flex flex-col gap-3">
                <Link
                  href="/dashboard"
                  className="flex items-center justify-between w-full px-4 py-3 bg-foreground text-background rounded-lg font-medium hover:bg-foreground/90 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4" />
                    Go to Dashboard
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/manage"
                  className="flex items-center justify-between w-full px-4 py-3 bg-muted text-foreground rounded-lg font-medium hover:bg-muted/80 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Go to Admin Panel
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <SignOutButton>
                  <button className="flex items-center justify-center gap-2 w-full px-4 py-3 text-muted-foreground rounded-lg font-medium hover:bg-muted/50 transition-colors mt-1">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </SignOutButton>
              </div>
            </div>
          </SignedIn>
        </div>
      </div>
    </div>
  )
}
