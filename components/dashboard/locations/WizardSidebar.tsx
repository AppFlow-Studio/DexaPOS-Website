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
        <div className="w-72 border-r bg-muted/30 p-6 flex flex-col">
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
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200",
                                isActive && "bg-primary text-primary-foreground shadow-sm",
                                !isActive && isCompleted && "text-foreground hover:bg-muted cursor-pointer",
                                !isActive && !isCompleted && !isClickable && "text-muted-foreground/50 cursor-not-allowed",
                                !isActive && !isCompleted && isClickable && "text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                            )}
                        >
                            <div className={cn(
                                "flex items-center justify-center w-6 h-6 rounded-full shrink-0 transition-colors",
                                isActive && "bg-primary-foreground/20",
                                isCompleted && !isActive && "bg-green-100 dark:bg-green-900/30"
                            )}>
                                {isCompleted && !isActive ? (
                                    <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                                ) : (
                                    <Icon className={cn(
                                        "h-4 w-4",
                                        isActive && "text-primary-foreground"
                                    )} />
                                )}
                            </div>
                            <span className={cn(
                                "text-sm font-medium",
                                isActive && "text-primary-foreground"
                            )}>
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
                        className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
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

