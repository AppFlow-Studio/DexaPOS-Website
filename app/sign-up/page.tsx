import { SignUp, SignedIn, SignedOut } from '@clerk/nextjs'
import { Shield } from 'lucide-react'
import Link from 'next/link'

export default function SignUpPage() {
    return (
        <div className="max-h-screen h-[100vh] items-center justify-center w-full flex">
            {/* Sign Up Form */}
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
                            Create your account.
                        </h1>
                        <p className="text-muted-foreground">
                            Get started with DexaPOS today.
                        </p>
                    </div>

                    {/* Clerk Sign Up Component */}
                    <SignedOut>
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

                        {/* Sign In Option */}
                        <div className="text-center">
                            <p className="text-muted-foreground text-sm">
                                Already have an account?{' '}
                                <Link href="/" className="text-primary hover:text-primary/80 font-medium">
                                    Sign in
                                </Link>
                            </p>
                        </div>
                    </SignedOut>

                    <SignedIn>
                        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                            <h2 className="text-xl font-semibold text-card-foreground mb-2">
                                Welcome to DexaPOS! 🎉
                            </h2>
                            <p className="text-muted-foreground">
                                Your account has been created successfully. Ready to explore your dashboard?
                            </p>
                        </div>
                    </SignedIn>
                </div>
            </div>
        </div>
    )
}
