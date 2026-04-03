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
import { WizardSidebar } from '@/components/dashboard/locations/WizardSidebar'
import { BasicInfoStep } from '@/components/dashboard/locations/steps/BasicInfoStep'
import { AddressStep } from '@/components/dashboard/locations/steps/AddressStep'
import { TaxComplianceStep } from '@/components/dashboard/locations/steps/TaxComplianceStep'
import { BankingPayoutsStep } from '@/components/dashboard/locations/steps/BankingPayoutsStep'
import { BusinessHoursStep } from '@/components/dashboard/locations/steps/BusinessHoursStep'
import { AssignManagerStep } from '@/components/dashboard/locations/steps/AssignManagerStep'
import { ReviewStep } from '@/components/dashboard/locations/steps/ReviewStep'
import {
    adminCreateLocation,
    adminGetMerchantClerkOrgId,
    adminGetManagerAssignableUsers,
} from '@/app/manage/actions/admin-merchant/locations'
import {
    ApplyLocationManagerAssignment,
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

interface AdminCreateLocationWizardProps {
    merchantId: string
    merchantName: string
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
    ein: '',
    tax_id: '',
    sales_tax_rate: '8.75',
    bank_name: '',
    account_holder_name: '',
    routing_number: '',
    account_number: '',
    confirm_account_number: '',
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

export function AdminCreateLocationWizard({ merchantId, merchantName }: AdminCreateLocationWizardProps) {
    const router = useRouter()
    const queryClient = useQueryClient()

    const [currentStep, setCurrentStep] = useState(1)
    const [completedSteps, setCompletedSteps] = useState<number[]>([])
    const [formData, setFormData] = useState<LocationFormData>(initialFormData)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showExitDialog, setShowExitDialog] = useState(false)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    const [managerCandidates, setManagerCandidates] = useState<ManagerAssignableUser[]>([])
    const [isLoadingManagerCandidates, setIsLoadingManagerCandidates] = useState(false)
    const [managerCandidatesError, setManagerCandidatesError] = useState<string | null>(null)
    const [clerkOrgId, setClerkOrgId] = useState<string | null>(null)

    const backUrl = `/manage/merchants/${merchantId}`

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

    // Resolve clerkOrgId for manager assignment
    useEffect(() => {
        adminGetMerchantClerkOrgId(merchantId).then((result) => {
            if (result.success && result.clerkOrgId) {
                setClerkOrgId(result.clerkOrgId)
            }
        })
    }, [merchantId])

    const loadManagerCandidates = useCallback(async () => {
        if (!merchantId) return
        setIsLoadingManagerCandidates(true)
        setManagerCandidatesError(null)
        try {
            const users = await adminGetManagerAssignableUsers(merchantId)
            setManagerCandidates(users)
        } catch (_error) {
            setManagerCandidatesError('Unable to load existing users.')
        } finally {
            setIsLoadingManagerCandidates(false)
        }
    }, [merchantId])

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
        setErrors({})
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
                break

            case 5: {
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
            }

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

            const result = await adminCreateLocation(merchantId, {
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
                public_metadata: {},
            })

            if (result.error) {
                toast.error('Creation Failed', {
                    description: result.error
                })
                return
            }

            // Manager assignment (needs clerkOrgId)
            if (result.data && clerkOrgId && formData.manager_assignment_type !== 'skip') {
                const managerAssignmentResult = await ApplyLocationManagerAssignment({
                    clerkOrgId,
                    locationId: result.data.id,
                    assignmentType: formData.manager_assignment_type,
                    managerInviteEmail: formData.manager_invite_email,
                    existingManagerIdentifier: formData.existing_manager_identifier,
                })

                if ('error' in managerAssignmentResult) {
                    toast.warning('Location created, manager assignment not completed', {
                        description: managerAssignmentResult.error,
                    })
                }
            }

            // Sync global menus to the new location
            if (result.data && formData.uses_global_menu) {
                try {
                    await SyncGlobalMenusToLocation(result.data.id)
                } catch (syncError) {
                    console.error('Error syncing menus to location:', syncError)
                }
            }

            toast.success('Location Created!', {
                description: `"${formData.name}" has been added to ${merchantName}.`
            })

            queryClient.invalidateQueries({ queryKey: ['admin-merchant'] })
            queryClient.invalidateQueries({ queryKey: ['merchant'] })
            queryClient.invalidateQueries({ queryKey: ['locations'] })

            setHasUnsavedChanges(false)
            if (result.data?.id) {
                router.push(`${backUrl}?tab=business-info&openLocation=${result.data.id}`)
            } else {
                router.push(`${backUrl}?tab=business-info`)
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
            router.push(backUrl)
        }
    }

    const confirmExit = () => {
        setHasUnsavedChanges(false)
        router.push(backUrl)
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
                {/* Sidebar */}
                <WizardSidebar
                    currentStep={currentStep}
                    completedSteps={completedSteps}
                    onStepClick={handleStepClick}
                />

                {/* Main Content */}
                <div className="flex-1 h-full flex flex-col">
                    {/* Header */}
                    <div className="border-b px-8 py-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Adding location for: {merchantName}</p>
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
                        <div className="max-w-3xl">
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
