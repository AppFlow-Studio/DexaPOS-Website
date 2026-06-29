'use client'

import { useSignUp, useSignIn, useClerk, useAuth } from '@clerk/nextjs'
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'

function AcceptInvitationContent() {
    const { signUp, setActive: setActiveSignUp, isLoaded: signUpLoaded } = useSignUp()
    const { signIn, setActive: setActiveSignIn, isLoaded: signInLoaded } = useSignIn()
    const { signOut } = useClerk()
    const { isSignedIn } = useAuth()
    const searchParams = useSearchParams()

    // Bug B fix: any prior session (e.g. logged into Merchant A) must be
    // cleared before processing a ticket-strategy invite, otherwise Clerk's
    // last-active-organization heuristic can land the invitee back on the
    // wrong merchant. We sign out without redirecting, then proceed with the
    // ticket flow on a clean slate.
    const clearPriorSessionIfAny = async () => {
        if (isSignedIn) {
            try {
                await signOut({ redirectUrl: undefined })
            } catch (err) {
                console.error('[accept-invitation] signOut failed (continuing):', err)
            }
        }
    }

    const ticket = searchParams.get('__clerk_ticket')
    const clerkStatus = searchParams.get('__clerk_status')
    const emailParam = decodeURIComponent(searchParams.get('email') || '')
    const firstNameParam = decodeURIComponent(searchParams.get('firstName') || '')
    const lastNameParam = decodeURIComponent(searchParams.get('lastName') || '')

    const [firstName, setFirstName] = useState(firstNameParam)
    const [lastName, setLastName] = useState(lastNameParam)
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    // If Clerk's SDK never finishes loading — commonly because an ad-blocker,
    // privacy extension, or corporate firewall blocks its frontend API — the
    // submit button would otherwise sit disabled (the "not-allowed" cursor)
    // with no explanation, and clicking it does nothing. Detect that case and
    // surface a real message instead of a silent dead button.
    const [clerkLoadFailed, setClerkLoadFailed] = useState(false)
    useEffect(() => {
        if (signUpLoaded || signInLoaded) {
            setClerkLoadFailed(false)
            return
        }
        const timer = setTimeout(() => setClerkLoadFailed(true), 8000)
        return () => clearTimeout(timer)
    }, [signUpLoaded, signInLoaded])

    const clerkLoadBanner = clerkLoadFailed ? (
        <div className="w-full mb-4 px-3 py-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm font-medium text-destructive mb-1">Couldn&apos;t load the sign-up service</p>
            <p className="text-xs text-destructive/90 mb-2">
                This is usually caused by an ad-blocker, privacy extension, or network firewall blocking Clerk. Disable extensions or switch networks (e.g. mobile data), then reload.
            </p>
            <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-xs font-medium text-destructive underline hover:no-underline"
            >
                Reload page
            </button>
        </div>
    ) : null

    // Invalid invitation link
    if (!ticket) {
        return (
            <div className="max-h-screen h-[100vh] items-center justify-center w-full flex">
                <div className="flex h-full w-full items-center justify-center flex-col bg-background">
                    <div className="max-w-md mx-auto w-full h-full items-center flex flex-col justify-center">
                        <div className="flex items-center gap-3 mb-12">
                            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                                <Shield className="w-5 h-5 text-primary-foreground" />
                            </div>
                            <span className="text-xl font-semibold text-foreground">DexaPOS</span>
                        </div>
                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm w-full text-center">
                            <h2 className="text-xl font-semibold text-card-foreground mb-2">Invalid invitation link</h2>
                            <p className="text-muted-foreground mb-4">
                                This invitation link is missing or has expired. Please ask your admin to resend the invitation.
                            </p>
                            <Link href="/sign-in" className="text-primary hover:text-primary/80 font-medium text-sm">
                                Back to sign in
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Existing Clerk user accepting an invite — send them through the sign-in flow
    if (clerkStatus === 'sign_in') {
        const handleExistingUserAccept = async () => {
            if (!signInLoaded || !signIn) return
            setIsSubmitting(true)
            setError('')
            try {
                await clearPriorSessionIfAny()
                const result = await signIn.create({
                    strategy: 'ticket',
                    ticket,
                })
                if (result.status === 'complete') {
                    await setActiveSignIn({ session: result.createdSessionId })
                    // Hard navigation so middleware re-evaluates org context
                    // with the freshly activated session, instead of relying on
                    // any cached client state from the prior user.
                    window.location.href = '/dashboard'
                }
            } catch (err: unknown) {
                const clerkError = err as { errors?: Array<{ longMessage?: string; message?: string }> }
                const message = clerkError?.errors?.[0]?.longMessage || clerkError?.errors?.[0]?.message || 'Failed to accept invitation'
                setError(message)
            } finally {
                setIsSubmitting(false)
            }
        }

        return (
            <div className="max-h-screen h-[100vh] items-center justify-center w-full flex">
                <div className="flex h-full w-full items-center justify-center flex-col bg-background">
                    <div className="max-w-md mx-auto w-full h-full items-center flex flex-col justify-center">
                        <div className="flex items-center gap-3 mb-12">
                            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                                <Shield className="w-5 h-5 text-primary-foreground" />
                            </div>
                            <span className="text-xl font-semibold text-foreground">DexaPOS</span>
                        </div>
                        <div className="mb-8">
                            <h1 className="text-3xl font-semibold text-foreground mb-2">You&apos;ve been invited.</h1>
                            <p className="text-muted-foreground">Accept the invitation to join your team on DexaPOS.</p>
                        </div>
                        {emailParam && (
                            <div className="w-full mb-4 px-3 py-2 rounded-lg bg-muted/50 border border-border">
                                <p className="text-xs text-muted-foreground mb-0.5">Joining as</p>
                                <p className="text-sm font-medium text-foreground">{emailParam}</p>
                            </div>
                        )}
                        {clerkLoadBanner}
                        {error && (
                            <div className="w-full mb-4 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                                <p className="text-sm text-destructive">{error}</p>
                            </div>
                        )}
                        <button
                            onClick={handleExistingUserAccept}
                            disabled={isSubmitting || !signInLoaded}
                            className="w-full py-2.5 px-4 bg-foreground hover:bg-foreground/90 text-background rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {(isSubmitting || !signInLoaded) && <Loader2 className="w-4 h-4 animate-spin" />}
                            {!signInLoaded ? 'Loading…' : 'Accept Invitation'}
                        </button>
                        <div className="text-center mt-6">
                            <p className="text-muted-foreground text-sm">
                                Wrong account?{' '}
                                <Link href="/sign-in" className="text-primary hover:text-primary/80 font-medium">
                                    Sign in with a different account
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // New user sign-up flow
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!signUpLoaded || !signUp) return

        if (password !== confirmPassword) {
            setError('Passwords do not match')
            return
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters')
            return
        }

        setIsSubmitting(true)
        setError('')

        try {
            await clearPriorSessionIfAny()
            const result = await signUp.create({
                strategy: 'ticket',
                ticket,
                ...(firstName.trim() && { firstName: firstName.trim() }),
                ...(lastName.trim() && { lastName: lastName.trim() }),
                password,
            })

            if (result.status === 'complete') {
                await setActiveSignUp({ session: result.createdSessionId })
                // Hard navigation so middleware re-evaluates org context with
                // the freshly activated session.
                window.location.href = '/dashboard'
            } else {
                // Not 'complete' means Clerk needs more than the ticket +
                // password provided — e.g. email verification or another
                // required field configured on the instance. Surface exactly
                // what's missing so it's diagnosable instead of generic.
                console.error('[accept-invitation] signUp not complete:', result.status, result)
                const missing = [
                    ...(result.missingFields ?? []),
                    ...(result.unverifiedFields ?? []),
                ].join(', ')
                setError(
                    `Couldn't finish creating your account (status: ${result.status}${missing ? `; needs: ${missing}` : ''}). Please contact support so we can check the invitation settings.`
                )
            }
        } catch (err: unknown) {
            const clerkError = err as { errors?: Array<{ longMessage?: string; message?: string }> }
            const message = clerkError?.errors?.[0]?.longMessage || clerkError?.errors?.[0]?.message || 'Failed to create account. The link may have expired.'
            setError(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="max-h-screen h-[100vh] items-center justify-center w-full flex">
            <div className="flex h-full w-full items-center justify-center flex-col bg-background">
                <div className="max-w-md mx-auto w-full h-full items-center flex flex-col justify-center">
                    {/* Logo */}
                    <div className="flex items-center gap-3 mb-12">
                        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                            <Shield className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <span className="text-xl font-semibold text-foreground">DexaPOS</span>
                    </div>

                    {/* Heading */}
                    <div className="mb-8 w-full">
                        <h1 className="text-3xl font-semibold text-foreground mb-2">You&apos;ve been invited.</h1>
                        <p className="text-muted-foreground">Set up your password to activate your account.</p>
                    </div>

                    {/* Email display */}
                    {emailParam && (
                        <div className="w-full mb-6 px-3 py-2 rounded-lg bg-muted/50 border border-border">
                            <p className="text-xs text-muted-foreground mb-0.5">Joining as</p>
                            <p className="text-sm font-medium text-foreground">{emailParam}</p>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="w-full space-y-4">
                        {/* Name row */}
                        <div className="flex gap-3">
                            <div className="flex-1 space-y-1.5">
                                <label className="text-sm font-medium text-foreground">First name</label>
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    placeholder="First name"
                                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
                                />
                            </div>
                            <div className="flex-1 space-y-1.5">
                                <label className="text-sm font-medium text-foreground">Last name</label>
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    placeholder="Last name"
                                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Create a password"
                                    required
                                    className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm password */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Confirm password</label>
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm your password"
                                    required
                                    className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Clerk load failure */}
                        {clerkLoadBanner}

                        {/* Error */}
                        {error && (
                            <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                                <p className="text-sm text-destructive">{error}</p>
                            </div>
                        )}

                        {/* Smart CAPTCHA anchor — REQUIRED for custom sign-up
                            flows (useSignUp().signUp.create) whenever Clerk bot
                            protection is enabled on the instance. Without this
                            element Clerk falls back to an invisible challenge
                            that silently blocks signUp.create(), which is why
                            "Create account" appeared to do nothing for new
                            users. Sign-in is unaffected, so existing-user
                            invites worked. empty:hidden keeps it gap-free when
                            no visible challenge is needed. */}
                        <div id="clerk-captcha" className="empty:hidden" />

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isSubmitting || !signUpLoaded}
                            className="w-full py-2.5 px-4 bg-foreground hover:bg-foreground/90 text-background rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                        >
                            {(isSubmitting || !signUpLoaded) && <Loader2 className="w-4 h-4 animate-spin" />}
                            {!signUpLoaded ? 'Loading…' : isSubmitting ? 'Creating account...' : 'Create account'}
                        </button>
                    </form>

                    {/* Sign in link */}
                    <div className="text-center mt-6">
                        <p className="text-muted-foreground text-sm">
                            Already have an account?{' '}
                            <Link href="/sign-in" className="text-primary hover:text-primary/80 font-medium">
                                Sign in
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function AcceptInvitationPage() {
    return (
        <Suspense fallback={
            <div className="max-h-screen h-[100vh] flex items-center justify-center bg-background">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                        <Shield className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <span className="text-xl font-semibold text-foreground">DexaPOS</span>
                </div>
            </div>
        }>
            <AcceptInvitationContent />
        </Suspense>
    )
}
