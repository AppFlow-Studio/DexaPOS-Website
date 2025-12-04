'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Loader2, X } from 'lucide-react'
import { WizardSidebar } from './WizardSidebar'
import { BasicInfoStep } from './steps/BasicInfoStep'
import { AddressStep } from './steps/AddressStep'
import { BusinessHoursStep } from './steps/BusinessHoursStep'
import { MenuModeStep } from './steps/MenuModeStep'
import { ReviewStep } from './steps/ReviewStep'
import { CreateLocation } from '@/app/dashboard/actions/locations'
import { SyncGlobalMenusToLocation } from '@/app/dashboard/actions/location-menus'
import {
    LocationFormData,
    LocationFormStep1,
    LocationFormStep2,
    LocationFormStep3,
    LocationFormStep4,
    DEFAULT_BUSINESS_HOURS,
    createLocationSchema
} from '@/types/merchant_locations'
import { useQueryClient } from '@tanstack/react-query'

interface CreateLocationWizardProps {
    clerkOrgId: string
}

const TOTAL_STEPS = 5

const STEP_TITLES = [
    { title: 'Location Info', description: 'Basic information about this location' },
    { title: 'Address', description: 'Where is this location?' },
    { title: 'Business Hours', description: 'When are you open?' },
    { title: 'Menu Configuration', description: 'How should the menu work?' },
    { title: 'Review & Create', description: 'Confirm your location details' },
]

const initialFormData: LocationFormData = {
    name: '',
    code: '',
    phone: '',
    email: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    timezone: 'America/New_York',
    business_hours: DEFAULT_BUSINESS_HOURS,
    uses_global_menu: true,
}

export function CreateLocationWizard({ clerkOrgId }: CreateLocationWizardProps) {
    const router = useRouter()
    const queryClient = useQueryClient()

    const [currentStep, setCurrentStep] = useState(1)
    const [completedSteps, setCompletedSteps] = useState<number[]>([])
    const [formData, setFormData] = useState<LocationFormData>(initialFormData)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showExitDialog, setShowExitDialog] = useState(false)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

    // Track unsaved changes
    useEffect(() => {
        const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialFormData)
        setHasUnsavedChanges(hasChanges)
    }, [formData])

    // Warn before leaving with unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault()
                e.returnValue = ''
            }
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [hasUnsavedChanges])

    const updateFormData = useCallback((stepData: Partial<LocationFormData>) => {
        setFormData(prev => ({ ...prev, ...stepData }))
        setErrors({}) // Clear errors when data changes
    }, [])

    const validateStep = (step: number): boolean => {
        const newErrors: Record<string, string> = {}

        switch (step) {
            case 1:
                if (!formData.name || formData.name.length < 2) {
                    newErrors.name = 'Name must be at least 2 characters'
                }
                if (formData.code && !/^[A-Z0-9\-]+$/.test(formData.code)) {
                    newErrors.code = 'Code must be uppercase letters, numbers, and dashes only'
                }
                if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
                    newErrors.email = 'Invalid email format'
                }
                if (formData.phone && formData.phone.replace(/\D/g, '').length < 10) {
                    newErrors.phone = 'Phone number must be at least 10 digits'
                }
                break

            case 2:
                if (!formData.address_line1 || formData.address_line1.length < 5) {
                    newErrors.address_line1 = 'Street address must be at least 5 characters'
                }
                if (!formData.city || formData.city.length < 2) {
                    newErrors.city = 'City is required'
                }
                if (!formData.state) {
                    newErrors.state = 'State is required'
                }
                if (!formData.postal_code || !/^\d{5}(-\d{4})?$/.test(formData.postal_code)) {
                    newErrors.postal_code = 'ZIP code must be 5 or 9 digits (e.g., 12345 or 12345-1234)'
                }
                if (!formData.timezone) {
                    newErrors.timezone = 'Timezone is required'
                }
                break

            case 3:
                // Business hours validation - check if close time > open time
                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
                days.forEach(day => {
                    const dayHours = formData.business_hours[day]
                    if (dayHours && !dayHours.is_closed) {
                        if (dayHours.open >= dayHours.close && dayHours.close !== '00:00') {
                            newErrors[day] = 'Close time must be after open time'
                        }
                    }
                })
                break

            case 4:
                // Menu mode is always valid (boolean)
                break

            case 5:
                // Review step - validate all
                try {
                    createLocationSchema.parse({
                        ...formData,
                        phone: formData.phone || undefined,
                        email: formData.email || undefined,
                        code: formData.code || undefined,
                        address_line2: formData.address_line2 || undefined,
                    })
                } catch (e: any) {
                    if (e.errors) {
                        e.errors.forEach((err: any) => {
                            newErrors[err.path[0]] = err.message
                        })
                    }
                }
                break
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleNext = () => {
        if (validateStep(currentStep)) {
            if (!completedSteps.includes(currentStep)) {
                setCompletedSteps(prev => [...prev, currentStep])
            }
            if (currentStep < TOTAL_STEPS) {
                setCurrentStep(currentStep + 1)
            }
        }
    }

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1)
        }
    }

    const handleStepClick = (step: number) => {
        if (step <= Math.max(...completedSteps, 0) + 1) {
            setCurrentStep(step)
        }
    }

    const handleSubmit = async () => {
        if (!validateStep(TOTAL_STEPS)) {
            toast.error('Validation Error', {
                description: 'Please fix the errors before creating the location.'
            })
            return
        }

        setIsSubmitting(true)

        try {
            const result = await CreateLocation(clerkOrgId, {
                name: formData.name,
                code: formData.code || undefined,
                phone: formData.phone || undefined,
                email: formData.email || undefined,
                address_line1: formData.address_line1,
                address_line2: formData.address_line2 || undefined,
                city: formData.city,
                state: formData.state,
                postal_code: formData.postal_code,
                country: 'US',
                timezone: formData.timezone,
                is_active: true,
                is_accepting_orders: true,
                business_hours: formData.business_hours,
                uses_global_menu: formData.uses_global_menu,
                public_metadata: {},
            })

            if (result.error) {
                toast.error('Creation Failed', {
                    description: result.error
                })
                return
            }

            // Sync global menus to the new location if using global menu
            if (result.data && formData.uses_global_menu) {
                try {
                    await SyncGlobalMenusToLocation(result.data.id)
                } catch (syncError) {
                    console.error('Error syncing menus to location:', syncError)
                    // Don't fail the location creation, just log the error
                }
            }

            toast.success('Location Created!', {
                description: `"${formData.name}" has been added to your locations.`
            })

            // Invalidate locations query to refresh the list
            queryClient.invalidateQueries({ queryKey: ['locations'] })
            queryClient.invalidateQueries({ queryKey: ['menus'] })

            // Reset unsaved changes flag
            setHasUnsavedChanges(false)

            // Redirect to locations list
            router.push('/dashboard/locations')
        } catch (error) {
            toast.error('Creation Failed', {
                description: 'An unexpected error occurred. Please try again.'
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleExit = () => {
        if (hasUnsavedChanges) {
            setShowExitDialog(true)
        } else {
            router.push('/dashboard/locations')
        }
    }

    const confirmExit = () => {
        setHasUnsavedChanges(false)
        router.push('/dashboard/locations')
    }

    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return (
                    <BasicInfoStep
                        data={formData as LocationFormStep1}
                        onChange={updateFormData}
                        errors={errors}
                    />
                )
            case 2:
                return (
                    <AddressStep
                        data={formData as LocationFormStep2}
                        onChange={updateFormData}
                        errors={errors}
                    />
                )
            case 3:
                return (
                    <BusinessHoursStep
                        data={formData as LocationFormStep3}
                        onChange={updateFormData}
                        errors={errors}
                    />
                )
            case 4:
                return (
                    <MenuModeStep
                        data={formData as LocationFormStep4}
                        onChange={updateFormData}
                    />
                )
            case 5:
                return (
                    <ReviewStep
                        data={formData}
                        onEditStep={handleStepClick}
                    />
                )
            default:
                return null
        }
    }

    return (
        <>
            <div className="h-[92vh] flex">
                {/* Sidebar */}
                <WizardSidebar
                    currentStep={currentStep}
                    completedSteps={completedSteps}
                    onStepClick={handleStepClick}
                />

                {/* Main Content */}
                <div className=" flex-1 h-full flex-col">
                    {/* Header */}
                    <div className="border-b px-8 py-4 flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold">{STEP_TITLES[currentStep - 1].title}</h1>
                            <p className="text-muted-foreground">{STEP_TITLES[currentStep - 1].description}</p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleExit}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    {/* Form Content */}
                    <div className="flex-1 overflow-auto p-8">
                        <div className="max-w-2xl">
                            {renderStep()}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t px-8 py-4 flex items-center justify-between">
                        <Button
                            variant="ghost"
                            onClick={handleBack}
                            disabled={currentStep === 1}
                            className="gap-2"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Button>

                        {currentStep === TOTAL_STEPS ? (
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="gap-2 min-w-[160px]"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    'Create Location'
                                )}
                            </Button>
                        ) : (
                            <Button onClick={handleNext} className="gap-2">
                                Continue
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Exit Confirmation Dialog */}
            <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Discard changes?</DialogTitle>
                        <DialogDescription>
                            You have unsaved changes. Are you sure you want to leave? All your progress will be lost.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowExitDialog(false)}>
                            Keep editing
                        </Button>
                        <Button variant="destructive" onClick={confirmExit}>
                            Discard changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

