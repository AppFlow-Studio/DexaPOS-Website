'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import { PhoneInput } from '@/components/ui/phone-input'
import { isValidPhone, normalizePhone, formatPhoneForDisplay } from '@/lib/phone'
import { ImagePlus, X, Loader2 } from 'lucide-react'
import {
  createMerchantOnboarding,
  updateMerchantLogo,
  updateMerchantOnboardingMetadata,
} from '@/app/manage/actions/create-merchant-onboarding'
import { uploadOrganizationDocument, uploadOrganizationLogo } from '@/lib/cdn/server'
import { cn } from '@/lib/utils'

const createMerchantSchema = z.object({
  businessLegalName: z.string().min(2, 'Business legal name is required.'),
  dbaName: z.string().optional(),
  businessType: z.enum(['llc', 'corporation', 'sole_proprietor', 'partnership', 'nonprofit']),
  einTaxId: z.string().regex(/^\d{2}-?\d{7}$/, 'EIN / Tax ID must be 9 digits.'),
  ownerFirstName: z.string().min(1, 'Owner first name is required.'),
  ownerLastName: z.string().min(1, 'Owner last name is required.'),
  ownerEmail: z.string().email('Valid owner email is required.'),
  ownerPhone: z.string().refine(v => !v || isValidPhone(v), { message: 'Enter a valid phone number' }),
  ownerDob: z.string().min(1, 'Owner date of birth is required.'),
  businessAddressLine1: z.string().min(1, 'Address line 1 is required.'),
  businessAddressLine2: z.string().optional(),
  businessCity: z.string().min(1, 'City is required.'),
  businessState: z.string().min(2, 'State is required.'),
  businessPostalCode: z.string().min(3, 'Postal code is required.'),
  businessCountry: z.string().default('US'),
})

type CreateMerchantWizardValues = z.infer<typeof createMerchantSchema>

const FIELD_LABELS: Record<string, string> = {
  businessLegalName: 'Business Legal Name',
  businessType: 'Business Type',
  einTaxId: 'EIN / Tax ID',
  ownerFirstName: 'Owner First Name',
  ownerLastName: 'Owner Last Name',
  ownerEmail: 'Owner Email',
  ownerPhone: 'Owner Phone',
  ownerDob: 'Owner Date of Birth',
  businessAddressLine1: 'Business Address Line 1',
  businessCity: 'City',
  businessState: 'State',
  businessPostalCode: 'Postal Code',
}

const STEP_TITLES = ['Business Info', 'Owner Contact', 'Review & Create'] as const
type StepNumber = 1 | 2 | 3

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const MAX_LOGO_SIZE = 5 * 1024 * 1024
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024

function formatEinTaxId(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}-${digits.slice(2)}`
}

export function CreateMerchantWizard() {
  const router = useRouter()
  const [step, setStep] = useState<StepNumber>(1)
  const [isSubmitting, startTransition] = useTransition()
  const hasSubmitted = useRef(false)

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const [ownerIdFile, setOwnerIdFile] = useState<File | null>(null)
  const [ownerIdError, setOwnerIdError] = useState(false)
  const ownerIdInputRef = useRef<HTMLInputElement>(null)

  const handleLogoSelect = (file: File | null) => {
    if (!file) return
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Use PNG, JPG, WEBP, or SVG.')
      return
    }
    if (file.size > MAX_LOGO_SIZE) {
      toast.error('File too large. Maximum size is 5MB.')
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const removeLogo = () => {
    setLogoFile(null)
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setLogoPreview(null)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const handleOwnerIdSelect = (file: File | null) => {
    if (!file) return
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Use PDF, PNG, JPG, or WEBP.')
      return
    }
    if (file.size > MAX_DOCUMENT_SIZE) {
      toast.error('File too large. Maximum size is 10MB.')
      return
    }
    setOwnerIdFile(file)
    setOwnerIdError(false)
  }

  const clearOwnerIdFile = () => {
    setOwnerIdFile(null)
    if (ownerIdInputRef.current) ownerIdInputRef.current.value = ''
  }

  const form = useForm<CreateMerchantWizardValues>({
    resolver: zodResolver(createMerchantSchema),
    mode: 'onBlur',
    defaultValues: {
      businessLegalName: '',
      dbaName: '',
      businessType: 'llc',
      einTaxId: '',
      ownerFirstName: '',
      ownerLastName: '',
      ownerEmail: '',
      ownerPhone: '',
      ownerDob: '',
      businessAddressLine1: '',
      businessAddressLine2: '',
      businessCity: '',
      businessState: '',
      businessPostalCode: '',
      businessCountry: 'US',
    },
  })

  const stepFields = useMemo(
    () => ({
      1: ['businessLegalName', 'businessType', 'einTaxId'] as const,
      2: [
        'ownerFirstName',
        'ownerLastName',
        'ownerEmail',
        'ownerPhone',
        'ownerDob',
        'businessAddressLine1',
        'businessCity',
        'businessState',
        'businessPostalCode',
      ] as const,
      3: [] as const,
    }),
    []
  )

  const values = form.watch()

  const nextStep = async () => {
    const valid = await form.trigger(stepFields[step])

    // Collect all missing items for the toast
    const missingItems: string[] = []

    if (!valid) {
      const errors = form.formState.errors
      stepFields[step].forEach((field) => {
        if (errors[field as keyof typeof errors]) {
          missingItems.push(FIELD_LABELS[field] ?? field)
        }
      })
    }

    if (step === 2 && !ownerIdFile) {
      missingItems.push('Owner Government ID')
      setOwnerIdError(true)
    }

    if (missingItems.length > 0) {
      toast.error('Please complete all required fields before continuing.', {
        description: `Missing: ${missingItems.join(', ')}`,
      })
      // Scroll to first invalid form field
      if (!valid) {
        const firstErrorField = stepFields[step].find(
          (field) => !!form.formState.errors[field as keyof typeof form.formState.errors]
        )
        if (firstErrorField) {
          const el = document.querySelector(`[name="${firstErrorField}"]`) as HTMLElement | null
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
      return
    }

    if (step < 3) setStep((step + 1) as StepNumber)
  }

  const previousStep = () => {
    if (step > 1) setStep((step - 1) as StepNumber)
  }

  const onSubmit = (data: CreateMerchantWizardValues) => {
    if (step !== 3 || hasSubmitted.current) return
    hasSubmitted.current = true
    startTransition(async () => {
      const result = await createMerchantOnboarding({
        businessLegalName: data.businessLegalName,
        dbaName: data.dbaName,
        businessType: data.businessType,
        einTaxId: data.einTaxId,
        ownerFirstName: data.ownerFirstName,
        ownerLastName: data.ownerLastName,
        ownerEmail: data.ownerEmail,
        ownerPhone: normalizePhone(data.ownerPhone) ?? data.ownerPhone,
        ownerDob: data.ownerDob,
        businessAddress: {
          line1: data.businessAddressLine1,
          line2: data.businessAddressLine2,
          city: data.businessCity,
          state: data.businessState,
          postalCode: data.businessPostalCode,
          country: data.businessCountry || 'US',
        },
      })

      if (!result.success) {
        hasSubmitted.current = false
        toast.error(result.error || 'Failed to create merchant.')
        return
      }

      if (logoFile && result.organizationId) {
        const uploadResult = await uploadOrganizationLogo(logoFile, result.organizationId)
        if (uploadResult.success && uploadResult.cdnUrl) {
          await updateMerchantLogo(result.organizationId, uploadResult.cdnUrl)
        } else if (!uploadResult.success) {
          toast.warning('Merchant created but logo upload failed: ' + (uploadResult.error || 'Unknown error'))
        }
      }

      if (result.organizationId) {
        const metadataUpdates: Record<string, unknown> = {}

        if (ownerIdFile) {
          const uploadResult = await uploadOrganizationDocument(
            ownerIdFile,
            result.organizationId,
            'online-store-owner-id'
          )
          if (uploadResult.success && uploadResult.cdnUrl) {
            metadataUpdates.online_store_owner_government_id_url = uploadResult.cdnUrl
          } else if (!uploadResult.success) {
            toast.warning('Merchant created but owner ID upload failed: ' + (uploadResult.error || 'Unknown error'))
          }
        }

        if (Object.keys(metadataUpdates).length > 0) {
          await updateMerchantOnboardingMetadata(result.organizationId, metadataUpdates)
        }
      }

      toast.success('Merchant created and owner invited.')
      router.push(`/manage/merchants/${result.organizationId}`)
    })
  }

  return (
    <Form {...form}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Create New Merchant: Step {step} of 3</CardTitle>
            <CardDescription>{STEP_TITLES[step - 1]}</CardDescription>
            <div className="grid grid-cols-3 gap-2 pt-2">
              {STEP_TITLES.map((title, index) => {
                const stepNumber = index + 1
                const isActive = step === stepNumber
                const isComplete = step > stepNumber
                return (
                  <div
                    key={title}
                    className={cn(
                      'rounded-md border px-3 py-2 text-xs sm:text-sm truncate',
                      isActive && 'border-primary bg-primary/5',
                      isComplete && 'border-green-500 bg-green-50 dark:bg-green-950/20'
                    )}
                  >
                    {stepNumber}. {title}
                  </div>
                )
              })}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">

            {/* ── Step 1: Business Info ───────────────────────────────────── */}
            {step === 1 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="businessLegalName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Legal Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Joe's Coffee LLC" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dbaName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>DBA Name <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Joe's Coffee" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select business type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="llc">LLC</SelectItem>
                            <SelectItem value="corporation">Corporation</SelectItem>
                            <SelectItem value="sole_proprietor">Sole Proprietor</SelectItem>
                            <SelectItem value="partnership">Partnership</SelectItem>
                            <SelectItem value="nonprofit">Nonprofit</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="einTaxId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>EIN / Tax ID</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            onChange={(e) => field.onChange(formatEinTaxId(e.target.value))}
                            maxLength={10}
                            inputMode="numeric"
                            placeholder="12-3456789"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Business Logo Upload */}
                <div className="rounded-lg border bg-muted/30 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4 sm:gap-6">
                    <div className="flex-1 min-w-0 space-y-1">
                      <Label className="text-sm font-semibold">Business Logo</Label>
                      <p className="text-xs text-muted-foreground">
                        PNG, JPG, WEBP, or SVG — max 5 MB, recommended 512×512 px.
                      </p>
                      {!logoPreview ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3 gap-1.5"
                          onClick={() => logoInputRef.current?.click()}
                        >
                          <ImagePlus className="h-4 w-4" />
                          Choose File
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 pt-2 min-w-0">
                          <span className="text-sm text-muted-foreground truncate max-w-50 sm:max-w-65">
                            {logoFile?.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive shrink-0"
                            onClick={removeLogo}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className={cn(
                        'shrink-0 h-20 w-20 sm:h-24 sm:w-24 rounded-xl border-2 flex items-center justify-center overflow-hidden transition-colors',
                        logoPreview
                          ? 'border-solid border-border'
                          : 'border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50'
                      )}
                    >
                      {logoPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                      ) : (
                        <ImagePlus className="h-7 w-7 text-muted-foreground/40" />
                      )}
                    </button>
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.svg"
                    className="hidden"
                    onChange={(e) => handleLogoSelect(e.target.files?.[0] || null)}
                  />
                </div>
              </>
            )}

            {/* ── Step 2: Owner Contact ───────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="ownerFirstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner First Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="John" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ownerLastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner Last Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Doe" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ownerEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="john@coffee.com" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ownerPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner Phone</FormLabel>
                        <FormControl>
                          <PhoneInput
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ownerDob"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner Date of Birth</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Government ID upload — full width */}
                <div className={cn(
                  'rounded-lg border p-4 space-y-3',
                  ownerIdError && 'border-destructive'
                )}>
                  <div>
                    <Label className={ownerIdError ? 'text-destructive' : ''}>
                      Government ID <span className="text-destructive">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Upload the owner government ID used for storefront compliance review. PDF, PNG, JPG, or WEBP — max 10 MB.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => ownerIdInputRef.current?.click()}
                    >
                      Choose File
                    </Button>
                    {ownerIdFile ? (
                      <>
                        <span className="text-sm text-muted-foreground truncate min-w-0">{ownerIdFile.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive shrink-0"
                          onClick={clearOwnerIdFile}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">No file selected</span>
                    )}
                  </div>
                  {ownerIdError && (
                    <p className="text-sm text-destructive">Owner government ID is required.</p>
                  )}
                  <input
                    ref={ownerIdInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => handleOwnerIdSelect(e.target.files?.[0] || null)}
                  />
                </div>

                {/* Business address */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="businessAddressLine1"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Business Address Line 1</FormLabel>
                        <FormControl>
                          <AddressAutocomplete
                            value={field.value ?? ''}
                            onInputChange={(v) =>
                              form.setValue('businessAddressLine1', v, { shouldDirty: true, shouldValidate: true })
                            }
                            onAddressSelected={(parts) => {
                              form.setValue('businessAddressLine1', parts.address_line1, { shouldDirty: true, shouldValidate: true })
                              form.setValue('businessCity', parts.city, { shouldDirty: true, shouldValidate: true })
                              form.setValue('businessState', parts.state, { shouldDirty: true, shouldValidate: true })
                              form.setValue('businessPostalCode', parts.postal_code, { shouldDirty: true, shouldValidate: true })
                              if (parts.country) {
                                form.setValue('businessCountry', parts.country, { shouldDirty: true, shouldValidate: true })
                              }
                            }}
                            placeholder="123 Main St"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessAddressLine2"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Address Line 2 <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Suite 100" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Brooklyn" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessState"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="NY" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessPostalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postal Code</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="11201" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessCountry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="US" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* ── Step 3: Review ──────────────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="rounded-md border p-4">
                  <h3 className="mb-3 font-semibold">Review</h3>
                  <div className="flex gap-4 flex-wrap sm:flex-nowrap">
                    {logoPreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoPreview}
                        alt="Logo"
                        className="h-16 w-16 rounded-lg object-cover border shrink-0"
                      />
                    )}
                    <div className="space-y-1 text-sm text-muted-foreground min-w-0">
                      <p>
                        <span className="font-medium text-foreground">Business:</span>{' '}
                        {values.dbaName?.trim() || values.businessLegalName}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Legal Name:</span> {values.businessLegalName}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Type:</span> {values.businessType}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">EIN / Tax ID:</span> {values.einTaxId}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Owner:</span> {values.ownerFirstName}{' '}
                        {values.ownerLastName} — {values.ownerEmail}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Phone:</span> {formatPhoneForDisplay(values.ownerPhone)}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">DOB:</span> {values.ownerDob}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Government ID:</span>{' '}
                        {ownerIdFile?.name || <span className="text-destructive">Missing</span>}
                      </p>
                      <p className="truncate">
                        <span className="font-medium text-foreground">Address:</span>{' '}
                        {values.businessAddressLine1}
                        {values.businessAddressLine2 ? `, ${values.businessAddressLine2}` : ''},{' '}
                        {values.businessCity}, {values.businessState} {values.businessPostalCode}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Owner will receive an organization invitation email after creation.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={previousStep}
            disabled={step === 1 || isSubmitting}
          >
            Back
          </Button>

          {step < 3 ? (
            <Button type="button" onClick={nextStep} disabled={isSubmitting}>
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={form.handleSubmit(onSubmit)}
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>
              ) : (
                'Create Merchant'
              )}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Required permissions: <code className="font-mono">hq.merchant.create</code>
        </p>
      </div>
    </Form>
  )
}
