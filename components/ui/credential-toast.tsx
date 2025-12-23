'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CredentialToastProps {
    pin?: string
    password?: string
    onDismiss?: () => void
    duration?: number // in seconds
}

export function CredentialToast({ pin, password, duration = 15, onDismiss }: CredentialToastProps) {
    const [timeLeft, setTimeLeft] = React.useState(duration)
    const [copied, setCopied] = React.useState<'pin' | 'password' | null>(null)

    React.useEffect(() => {
        if (timeLeft <= 0) {
            return
        }

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(timer)
    }, [timeLeft])

    const handleCopy = async (text: string, type: 'pin' | 'password') => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(type)
            setTimeout(() => setCopied(null), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }

    const displayText = password ? password : pin || ''
    const label = password ? 'Password' : 'PIN'

    return (
        <div className="w-full max-w-md space-y-4 p-4">
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Credentials Created</h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Auto-dismiss in</span>
                        <span className="font-mono font-semibold text-foreground">{timeLeft}s</span>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    {password && pin
                        ? 'Save these credentials securely. They will not be shown again.'
                        : 'Save this credential securely. It will not be shown again.'}
                </p>
            </div>

            {password && (
                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Password</div>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-lg border-2 border-primary/20 bg-muted/50 p-3">
                            <div className="font-mono text-lg font-bold tracking-wider text-center select-all">
                                {password}
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={() => handleCopy(password, 'password')}
                        >
                            {copied === 'password' ? (
                                <Check className="h-4 w-4 text-green-600" />
                            ) : (
                                <Copy className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>
            )}

            {pin && (
                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">PIN Code</div>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-lg border-2 border-primary/20 bg-muted/50 p-3">
                            <div className="font-mono text-lg font-bold tracking-wider text-center select-all">
                                {pin}
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={() => handleCopy(pin, 'pin')}
                        >
                            {copied === 'pin' ? (
                                <Check className="h-4 w-4 text-green-600" />
                            ) : (
                                <Copy className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>
            )}

            {timeLeft <= 0 && onDismiss && (
                <div className="pt-2 border-t">
                    <Button
                        variant="default"
                        size="sm"
                        className="w-full"
                        onClick={onDismiss}
                    >
                        Close
                    </Button>
                </div>
            )}
        </div>
    )
}

