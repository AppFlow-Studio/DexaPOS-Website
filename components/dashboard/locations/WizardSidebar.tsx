'use client'

import { cn } from '@/lib/utils'
import { Building2, MapPin, ShieldCheck, Landmark, Clock, UserCog, CheckCircle2, Check } from 'lucide-react'

interface Step {
    id: number
    title: string
    icon: React.ElementType
}

const steps: Step[] = [
    { id: 1, title: 'Location info', icon: Building2 },
    { id: 2, title: 'Location address', icon: MapPin },
    { id: 3, title: 'Tax & compliance', icon: ShieldCheck },
    { id: 4, title: 'Banking & payouts', icon: Landmark },
    { id: 5, title: 'Business hours', icon: Clock },
    { id: 6, title: 'Assign manager', icon: UserCog },
    { id: 7, title: 'Review & create', icon: CheckCircle2 },
]

interface WizardSidebarProps {
    currentStep: number
    completedSteps: number[]
    onStepClick?: (step: number) => void
}

export function WizardSidebar({ currentStep, completedSteps, onStepClick }: WizardSidebarProps) {
    return (
        // The tint separates the rail from the form; no border line (§5.5).
        <div className="w-72 bg-muted/30 p-6 flex flex-col">
            {/* Step Counter */}
            <div className="mb-6">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                    Step {currentStep} of {steps.length}
                </p>
            </div>

            {/* Steps List */}
            <nav className="space-y-1 flex-1">
                {steps.map((step) => {
                    const isActive = step.id === currentStep
                    const isCompleted = completedSteps.includes(step.id)
                    const isClickable = isCompleted || step.id <= Math.max(...completedSteps, 0) + 1
                    const Icon = step.icon

                    return (
                        <button
                            key={step.id}
                            type="button"
                            onClick={() => isClickable && onStepClick?.(step.id)}
                            disabled={!isClickable}
                            aria-current={isActive ? 'step' : undefined}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 rounded-full text-left transition-colors duration-200",
                                // Neutral active state (§4.5) — never a brand fill.
                                isActive && "bg-background text-foreground shadow-sm ring-1 ring-border",
                                !isActive && isCompleted && "text-foreground hover:bg-muted/60 cursor-pointer",
                                !isActive && !isCompleted && !isClickable && "text-muted-foreground/50 cursor-not-allowed",
                                !isActive && !isCompleted && isClickable && "text-muted-foreground hover:bg-muted/60 hover:text-foreground cursor-pointer"
                            )}
                        >
                            <div className="flex items-center justify-center w-6 h-6 rounded-full shrink-0">
                                {/* Done is a plain check — a state, not an alarm, so no green (§3.5). */}
                                {isCompleted && !isActive ? (
                                    <Check className="h-3.5 w-3.5" />
                                ) : (
                                    <Icon className="h-4 w-4" />
                                )}
                            </div>
                            <span className="text-sm font-medium">
                                {step.title}
                            </span>
                        </button>
                    )
                })}
            </nav>

            {/* Progress bar */}
            <div className="mt-auto pt-6">
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-foreground/70 transition-all duration-500 ease-out rounded-full"
                        style={{ width: `${(currentStep / steps.length) * 100}%` }}
                    />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                    {Math.round((currentStep / steps.length) * 100)}% complete
                </p>
            </div>
        </div>
    )
}

