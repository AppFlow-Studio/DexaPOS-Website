import { SignUp, Show } from '@clerk/nextjs'
import { Shield, MailCheck } from 'lucide-react'
import Link from 'next/link'

type SearchParams = Record<string, string | string[] | undefined>

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

                    <Show when="signed-out">
                        {hasInvitationTicket ? (
                            <>
                                <div className="mb-8">
                                    <h1 className="text-3xl font-semibold text-foreground mb-2">
                                        Finish setting up your account.
                                    </h1>
                                    <p className="text-muted-foreground">
                                        You&apos;ve been invited to DexaPOS. Complete the form below to get started.
                                    </p>
                                </div>

                                <div className="mb-6">
                                    <SignUp
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
                                                formButton: 'w-full',
                                                identityPreview: 'bg-muted/50 border-border',
                                                formFieldWarningText: 'text-yellow-600',
                                            }
                                        }}
                                    />
                                </div>

                                <div className="text-center">
                                    <p className="text-muted-foreground text-sm">
                                        Already have an account?{' '}
                                        <Link href="/sign-in" className="text-primary hover:text-primary/80 font-medium">
                                            Sign in
                                        </Link>
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div className="bg-card border border-border rounded-xl p-8 shadow-sm w-full text-center">
                                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                                    <MailCheck className="w-6 h-6 text-muted-foreground" />
                                </div>
                                <h1 className="text-2xl font-semibold text-card-foreground mb-2">
                                    Access by invitation only
                                </h1>
                                <p className="text-muted-foreground mb-6">
                                    DexaPOS accounts are created by your administrator. If you&apos;re expecting an invite, check your email for the link.
                                </p>
                                <Link
                                    href="/sign-in"
                                    className="inline-flex items-center justify-center px-4 py-2 bg-foreground text-background rounded-lg font-medium hover:bg-foreground/90 transition-colors"
                                >
                                    Back to sign in
                                </Link>
                            </div>
                        )}
                    </Show>

                    <Show when="signed-in">
                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                            <h2 className="text-xl font-semibold text-card-foreground mb-2">
                                You&apos;re already signed in.
                            </h2>
                            <p className="text-muted-foreground mb-4">
                                Head over to your dashboard to continue.
                            </p>
                            <Link
                                href="/sign-in"
                                className="inline-flex items-center justify-center px-4 py-2 bg-foreground text-background rounded-lg font-medium hover:bg-foreground/90 transition-colors"
                            >
                                Continue
                            </Link>
                        </div>
                    </Show>
                </div>
            </div>
        </div>
    )
}
