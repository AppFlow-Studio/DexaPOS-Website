'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Home, Search } from 'lucide-react'

export default function NotFound() {
    const router = useRouter()

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 px-4">
            {/* Background decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/3 rounded-full blur-3xl animate-pulse delay-1000" />
            </div>

            <div className="relative z-10 text-center max-w-lg mx-auto">
                {/* 404 Number */}
                <div className="relative mb-8">
                    <h1 className="text-[12rem] md:text-[16rem] font-black leading-none tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-foreground/20 to-foreground/5 select-none">
                        404
                    </h1>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex items-center gap-3 bg-background/80 backdrop-blur-sm px-6 py-3 rounded-2xl border shadow-lg">
                            <Search className="h-5 w-5 text-muted-foreground" />
                            <span className="text-lg font-medium text-foreground">Page not found</span>
                        </div>
                    </div>
                </div>

                {/* Message */}
                <p className="text-muted-foreground text-lg mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
                    Oops! The page you're looking for seems to have wandered off.
                    Let's get you back on track.
                </p>

                {/* Action Buttons */}
                <div className="flex items-center justify-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
                    <Button
                        variant="default"
                        size="lg"
                        onClick={() => router.back()}
                        className="gap-2 shadow-lg hover:shadow-xl transition-all hover:scale-105"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Go Back
                    </Button>
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={() => router.push('/')}
                        className="gap-2 hover:scale-105 transition-all"
                    >
                        <Home className="h-4 w-4" />
                        Home
                    </Button>
                </div>

                {/* Decorative line */}
                <div className="mt-12 flex items-center justify-center gap-2 animate-in fade-in duration-500 delay-500">
                    <div className="h-px w-12 bg-gradient-to-r from-transparent to-border" />
                    <span className="text-xs text-muted-foreground/60 font-medium tracking-widest uppercase">DexaPOS</span>
                    <div className="h-px w-12 bg-gradient-to-l from-transparent to-border" />
                </div>
            </div>
        </div>
    )
}

