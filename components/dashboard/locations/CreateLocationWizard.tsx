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
import { TaxComplianceStep } from './steps/TaxComplianceStep'
import { BankingPayoutsStep } from './steps/BankingPayoutsStep'
import { BusinessHoursStep } from './steps/BusinessHoursStep'
import { AssignManagerStep } from './steps/AssignManagerStep'
import { ReviewStep } from './steps/ReviewStep'
import { CreateLocation, UpdateLocation } from '@/app/dashboard/actions/locations'
import {
    ApplyLocationManagerAssignment,
    GetManagerAssignableUsers,
    type ManagerAssignableUser,
} from '@/app/dashboard/actions/location-members'
import { SyncGlobalMenusToLocation } from '@/app/dashboard/actions/location-menus'
import {
    LocationFormData,
    LocationFormStep1,
    LocationFormStep2,
    LocationFormStep3,
    LocationFormStep4,
    LocationFormStep5,
    LocationFormStep6,
    DEFAULT_BUSINESS_HOURS,
    createLocationSchema
} from '@/types/merchant_locations'
import { useQueryClient } from '@tanstack/react-query'
import { uploadMerchantDocument } from '@/lib/cdn/server'

interface CreateLocationWizardProps {
    clerkOrgId: string
    actorUserId?: string
}

const TOTAL_STEPS = 7

const STEP_TITLES = [
    { title: 'Location Info', description: 'Basic information about this location' },
    { title: 'Address', description: 'Where is this location?' },
    { title: 'Tax & Compliance', description: 'Tax identity and rate for this location' },
    { title: 'Banking & Payouts', description: 'Payout destination and schedule (UI only)' },
    { title: 'Business Hours', description: 'When are you open?' },
    { title: 'Assign Manager', description: 'Invite or assign a manager to this location' },
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
    country: 'US',
    timezone: 'America/New_York',
    latitude: null,
    longitude: null,
    ein: '',
    tax_id: '',
    sales_tax_rate: '8.75',
    bank_name: '',
    account_holder_name: '',
    routing_number: '',
    account_number: '',
    confirm_account_number: '',
    bank_support_document_name: '',
    account_type: 'checking',
    payout_frequency: 'daily',
    payout_day_of_week: '1',
    payout_day_of_month: '1',
    minimum_payout_amount: '0.00',
    use_merchant_billing_profile: false,
    business_hours: DEFAULT_BUSINESS_HOURS,
    manager_assignment_type: 'skip',
    manager_invite_name: '',
    manager_invite_email: '',
    existing_manager_identifier: '',
    uses_global_menu: true,
}

function buildOnlineStoreLocationMetadata(data: LocationFormData) {
    return {
        online_store_bank_name: data.bank_name || null,
        online_store_account_holder_name: data.account_holder_name || null,
        online_store_bank_routing_number: data.routing_number || null,
        online_store_bank_dda_account_number: data.account_number || null,
        bank_name: data.bank_name || null,
        account_holder_name: data.account_holder_name || null,
        routing_number: data.routing_number || null,
        account_number: data.account_number || null,
    }
}

export function CreateLocationWizard({ clerkOrgId, actorUserId }: CreateLocationWizardProps) {
    const router = useRouter()
    const queryClient = useQueryClient()

    const [currentStep, setCurrentStep] = useState(1)
    const [completedSteps, setCompletedSteps] = useState<number[]>([])
    const [formData, setFormData] = useState<LocationFormData>(initialFormData)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showExitDialog, setShowExitDialog] = useState(false)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    const [bankSupportFile, setBankSupportFile] = useState<File | null>(null)
    const [managerCandidates, setManagerCandidates] = useState<ManagerAssignableUser[]>([])
    const [isLoadingManagerCandidates, setIsLoadingManagerCandidates] = useState(false)
    const [managerCandidatesError, setManagerCandidatesError] = useState<string | null>(null)

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

    const loadManagerCandidates = useCallback(async () => {
        if (!clerkOrgId) return
        setIsLoadingManagerCandidates(true)
        setManagerCandidatesError(null)
        try {
            const users = await GetManagerAssignableUsers(clerkOrgId)
            setManagerCandidates(users)
        } catch (_error) {
            setManagerCandidatesError('Unable to load existing users.')
        } finally {
            setIsLoadingManagerCandidates(false)
        }
    }, [clerkOrgId])

    useEffect(() => {
        const shouldLoadCandidates =
            currentStep === 6 &&
            formData.manager_assignment_type === 'assign_existing' &&
            managerCandidates.length === 0 &&
            !isLoadingManagerCandidates

        if (shouldLoadCandidates) {
            loadManagerCandidates()
        }
    }, [
        currentStep,
        formData.manager_assignment_type,
        managerCandidates.length,
        isLoadingManagerCandidates,
        loadManagerCandidates,
    ])

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
                if (!formData.ein || formData.ein.replace(/\D/g, '').length !== 9) {
                    newErrors.ein = 'EIN must be 9 digits (e.g., 12-3456789)'
                }
                if (!formData.sales_tax_rate) {
                    newErrors.sales_tax_rate = 'Sales tax rate is required'
                } else {
                    const rate = Number(formData.sales_tax_rate)
                    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
                        newErrors.sales_tax_rate = 'Sales tax rate must be between 0 and 100'
                    }
                }
                break

            case 4:
                if (formData.routing_number && formData.routing_number.length !== 9) {
                    newErrors.routing_number = 'Routing number must be 9 digits'
                }
                if (
                    (formData.account_number || formData.confirm_account_number) &&
                    formData.account_number !== formData.confirm_account_number
                ) {
                    newErrors.confirm_account_number = 'Account number confirmation must match'
                }
                if (
                    formData.minimum_payout_amount &&
                    Number.isNaN(Number(formData.minimum_payout_amount))
                ) {
                    newErrors.minimum_payout_amount = 'Minimum payout must be a valid amount'
                }
                if (!bankSupportFile) {
                    newErrors.bank_support_document_name = 'Bank letter or voided check is required'
                }
                break

            case 5:
                // Business hours validation - check if close time > open time
                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
                days.forEach(day => {
                    const dayHours = formData.business_hours[day]
                    if (dayHours && !dayHours.is_closed) {
                        if (dayHours.open >= dayHours.close && !dayHours.is_overnight) {
                            newErrors[day] = 'Close time must be after open time (or enable overnight for next-day close)'
                        }
                    }
                })
                break

            case 6:
                if (formData.manager_assignment_type === 'invite_new') {
                    if (!formData.manager_invite_name.trim()) {
                        newErrors.manager_invite_name = 'Manager name is required when inviting'
                    }
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.manager_invite_email)) {
                        newErrors.manager_invite_email = 'Valid manager email is required'
                    }
                }
                if (formData.manager_assignment_type === 'assign_existing' && !formData.existing_manager_identifier.trim()) {
                    newErrors.existing_manager_identifier = 'Existing user identifier is required'
                }
                break

            case 7:
                // Review step - validate all
                try {
                    const normalizedTaxRate = Number(formData.sales_tax_rate)

                    createLocationSchema.parse({
                        ...formData,
                        phone: formData.phone || undefined,
                        email: formData.email || undefined,
                        code: formData.code || undefined,
                        address_line2: formData.address_line2 || undefined,
                        ein: formData.ein || undefined,
                        tax_id: formData.tax_id || undefined,
                        sales_tax_rate: Number.isFinite(normalizedTaxRate) ? normalizedTaxRate / 100 : undefined,
                        tax_registration_status: 'pending',
                        onboarding_step: 7,
                        onboarding_completed: true,
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
            const normalizedTaxRate = Number(formData.sales_tax_rate)

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
                country: formData.country,
                latitude: formData.latitude ?? undefined,
                longitude: formData.longitude ?? undefined,
                timezone: formData.timezone,
                pricing_strategy: 'manual',
                dual_pricing_percentage: 4.0,
                use_merchant_pricing_defaults: true,
                is_active: true,
                is_accepting_orders: true,
                business_hours: formData.business_hours,
                ein: formData.ein || undefined,
                tax_id: formData.tax_id || undefined,
                sales_tax_rate: Number.isFinite(normalizedTaxRate) ? normalizedTaxRate / 100 : undefined,
                tax_registration_status: 'pending',
                onboarding_step: 7,
                onboarding_completed: true,
                uses_global_menu: formData.uses_global_menu,
                public_metadata: buildOnlineStoreLocationMetadata(formData),
            })

            if (result.error) {
                toast.error('Creation Failed', {
                    description: result.error
                })
                return
            }

            if (result.data && bankSupportFile) {
                const uploadResult = await uploadMerchantDocument(
                    bankSupportFile,
                    result.data.merchant_id,
                    'online-store-bank-support'
                )

                if (uploadResult.success && uploadResult.cdnUrl) {
                    await UpdateLocation(result.data.id, {
                        public_metadata: {
                            ...(result.data.public_metadata || {}),
                            ...buildOnlineStoreLocationMetadata(formData),
                            online_store_bank_support_document_url: uploadResult.cdnUrl,
                            bank_support_document_url: uploadResult.cdnUrl,
                        },
                    })
                } else if (!uploadResult.success) {
                    toast.warning('Location created but bank support document upload failed', {
                        description: uploadResult.error || 'Unknown error',
                    })
                }
            }

            if (result.data && formData.manager_assignment_type !== 'skip') {
                const managerAssignmentResult = await ApplyLocationManagerAssignment({
                    clerkOrgId,
                    locationId: result.data.id,
                    assignmentType: formData.manager_assignment_type,
                    invitedByUserId: actorUserId,
                    managerInviteEmail: formData.manager_invite_email,
                    existingManagerIdentifier: formData.existing_manager_identifier,
                })

                if ('error' in managerAssignmentResult) {
                    toast.warning('Location created, manager assignment not completed', {
                        description: managerAssignmentResult.error,
                    })
                }
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

            // Redirect to locations list and immediately open the editable details sheet
            if (result.data?.id) {
                router.push(`/dashboard/locations?open=${result.data.id}`)
            } else {
                router.push('/dashboard/locations')
            }
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
                    <TaxComplianceStep
                        data={formData as LocationFormStep3}
                        onChange={updateFormData}
                        errors={errors}
                    />
                )
            case 4:
                return (
                    <BankingPayoutsStep
                        data={formData as LocationFormStep4}
                        onChange={updateFormData}
                        errors={errors}
                        onBankSupportDocumentSelect={setBankSupportFile}
                        onClearBankSupportDocument={() => setBankSupportFile(null)}
                    />
                )
            case 5:
                return (
                    <BusinessHoursStep
                        data={formData as LocationFormStep5}
                        onChange={updateFormData}
                        errors={errors}
                    />
                )
            case 6:
                return (
                    <AssignManagerStep
                        data={formData as LocationFormStep6}
                        onChange={updateFormData}
                        errors={errors}
                        managerCandidates={managerCandidates}
                        isLoadingCandidates={isLoadingManagerCandidates}
                        candidatesError={managerCandidatesError}
                        onRetryLoadCandidates={loadManagerCandidates}
                    />
                )
            case 7:
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
                {/* Sidebar — hidden on mobile, visible md+ */}
                <div className="hidden md:flex">
                    <WizardSidebar
                        currentStep={currentStep}
                        completedSteps={completedSteps}
                        onStepClick={handleStepClick}
                    />
                </div>

                {/* Main Content */}
                <div className="flex flex-1 h-full flex-col min-w-0">
                    {/* Header */}
                    <div className="border-b px-4 md:px-8 py-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            {/* Mobile step indicator */}
                            <p className="text-xs font-medium text-muted-foreground mb-0.5 md:hidden">
                                Step {currentStep} of {TOTAL_STEPS}
                            </p>
                            <h1 className="text-lg md:text-2xl font-semibold truncate">{STEP_TITLES[currentStep - 1].title}</h1>
                            <p className="text-sm text-muted-foreground hidden sm:block">{STEP_TITLES[currentStep - 1].description}</p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleExit}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    {/* Mobile progress bar */}
                    <div className="md:hidden px-4 pt-2 pb-1">
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary rounded-full transition-all duration-500"
                                style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Form Content */}
                    <div className="flex-1 overflow-auto p-4 md:p-8">
                        <div className="max-w-3xl">
                            {renderStep()}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t px-4 md:px-8 py-4 flex items-center justify-between">
                        <Button
                            variant="ghost"
                            onClick={handleBack}
                            disabled={currentStep === 1}
                            className="gap-2"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Back</span>
                        </Button>

                        {currentStep === TOTAL_STEPS ? (
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="gap-2 min-w-35 md:min-w-40"
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

