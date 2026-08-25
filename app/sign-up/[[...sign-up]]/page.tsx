import type { Metadata } from 'next'
import { Show } from '@clerk/nextjs'
import { MailCheck, PlayCircle } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { AuthBrandPanel } from '../../sign-in/brand-panel'
import { ThemedSignUp } from '../../sign-in/clerk-form'

type SearchParams = Record<string, string | string[] | undefined>

export const metadata: Metadata = {
    title: 'Create your account',
    description: 'Finish setting up your DexaPOS account.',
}

export default async function SignUpPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>
}) {
    const params = await searchParams
    const ticketParam = params.__clerk_ticket
    const ticket = Array.isArray(ticketParam) ? ticketParam[0] : ticketParam
    const hasInvitationTicket = typeof ticket === 'string' && ticket.length > 0

    return (
        // Mirrors /sign-in exactly. The two pages had drifted into different
        // shells (`h-[100vh]` vs `min-h-screen`, Shield icon vs logo, different
        // radii), which read as two different products mid-flow.
        <div className="flex min-h-[100dvh] w-full bg-background">
            <main className="flex w-full flex-col justify-center overflow-y-auto px-5 py-10 sm:px-10 lg:w-1/2 xl:w-[45%]">
                <div className="mx-auto flex w-full max-w-sm flex-col">
                    <div className="mb-8 flex items-center gap-2.5 lg:hidden">
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

                    <Show when="signed-out">
                        {hasInvitationTicket ? (
                            <>
                                <div className="mb-8">
                                    <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                                        Finish setting up your account
                                    </h1>
                                    <p className="mt-2 text-muted-foreground">
                                        You&apos;ve been invited to DexaPOS. Complete the form below to get started.
                                    </p>
                                </div>

                                <ThemedSignUp />

                                <p className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
                                    Already have an account?{' '}
                                    <Link
                                        href="/sign-in"
                                        className="font-medium text-primary underline-offset-4 hover:underline"
                                    >
                                        Sign in
                                    </Link>
                                </p>
                            </>
                        ) : (
                            // No ticket: the visitor cannot self-serve at all, so
                            // this state's whole job is to explain why and hand
                            // them the two ways forward.
                            <>
                                <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                                    <MailCheck className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                                    Access is by invitation
                                </h1>
                                <p className="mt-2 text-muted-foreground">
                                    DexaPOS accounts are created by your administrator. If you&apos;re
                                    expecting an invite, check your email for the link — it may have
                                    landed in spam.
                                </p>

                                <Link
                                    href="/contact"
                                    className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-foreground px-4 py-3 font-medium text-background transition-colors hover:bg-foreground/90"
                                >
                                    Request an invitation
                                </Link>
                                {/* These visitors cannot get in at all, so the
                                    demo is the one thing they can actually do
                                    right now. */}
                                <Link
                                    href="/demo"
                                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-3 font-medium text-foreground transition-colors hover:bg-muted/60"
                                >
                                    <PlayCircle className="h-4 w-4" />
                                    Try the live demo
                                </Link>
                                <Link
                                    href="/sign-in"
                                    className="mt-3 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 font-medium text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Back to sign in
                                </Link>
                            </>
                        )}
                    </Show>

                    <Show when="signed-in">
                        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                            You&apos;re already signed in
                        </h1>
                        <p className="mt-2 text-muted-foreground">
                            Head over to your dashboard to continue.
                        </p>
                        <Link
                            href="/dashboard"
                            className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-foreground px-4 py-3 font-medium text-background transition-colors hover:bg-foreground/90"
                        >
                            Continue to dashboard
                        </Link>
                    </Show>

                    <p className="mt-10 text-xs text-muted-foreground">
                        © {new Date().getFullYear()} DexaPOS. All rights reserved.
                    </p>
                </div>
            </main>

            <AuthBrandPanel />
        </div>
    )
}
