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
import { ImagePlus, X } from 'lucide-react'
import {
  createMerchantOnboarding,
  updateMerchantLogo,
  updateMerchantOnboardingMetadata,
} from '@/app/manage/actions/create-merchant-onboarding'
import { uploadOrganizationDocument, uploadOrganizationLogo } from '@/lib/cdn/server'

const createMerchantSchema = z.object({
  businessLegalName: z.string().min(2, 'Business legal name is required.'),
  dbaName: z.string().optional(),
  businessType: z.enum(['llc', 'corporation', 'sole_proprietor', 'partnership', 'nonprofit']),
  einTaxId: z.string().regex(/^\d{2}-?\d{7}$/, 'EIN / Tax ID must be 9 digits.'),
  ownerFirstName: z.string().min(1, 'Owner first name is required.'),
  ownerLastName: z.string().min(1, 'Owner last name is required.'),
  ownerEmail: z.string().email('Valid owner email is required.'),
  ownerPhone: z.string().min(7, 'Owner phone is required.'),
  ownerDob: z.string().min(1, 'Owner date of birth is required.'),
  ownerSsn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/, 'Owner SSN must be 9 digits.'),
  businessAddressLine1: z.string().min(1, 'Address line 1 is required.'),
  businessAddressLine2: z.string().optional(),
  businessCity: z.string().min(1, 'City is required.'),
  businessState: z.string().min(2, 'State is required.'),
  businessPostalCode: z.string().min(3, 'Postal code is required.'),
  businessCountry: z.string().default('US'),
})

type CreateMerchantWizardValues = z.infer<typeof createMerchantSchema>

interface CreateMerchantWizardProps {}

const STEP_TITLES = ['Business Info', 'Owner Contact', 'Review & Create'] as const
type StepNumber = 1 | 2 | 3

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const MAX_LOGO_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024 // 10MB

function formatEinTaxId(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}-${digits.slice(2)}`
}

function formatSsn(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  if (digits.length <= 3) return digits
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

export function CreateMerchantWizard({}: CreateMerchantWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [isSubmitting, startTransition] = useTransition()
  const hasSubmitted = useRef(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [w9File, setW9File] = useState<File | null>(null)
  const [ownerIdFile, setOwnerIdFile] = useState<File | null>(null)
  const w9InputRef = useRef<HTMLInputElement>(null)
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

  const handleDocumentSelect = (
    file: File | null,
    kind: 'w9' | 'ownerId'
  ) => {
    if (!file) return
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf')
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
    if (kind === 'w9' && !isPdf) {
      toast.error('Signed W-9 must be uploaded as a PDF.')
      return
    }
    if (kind !== 'w9' && !allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Use PDF, PNG, JPG, or WEBP.')
      return
    }
    if (file.size > MAX_DOCUMENT_SIZE) {
      toast.error('File too large. Maximum size is 10MB.')
      return
    }
    if (kind === 'w9') {
      setW9File(file)
      return
    }
    setOwnerIdFile(file)
  }

  const clearDocument = (kind: 'w9' | 'ownerId') => {
    if (kind === 'w9') {
      setW9File(null)
      if (w9InputRef.current) w9InputRef.current.value = ''
      return
    }
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
      ownerSsn: '',
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
        'ownerSsn',
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
    if (!valid) return
    if (step === 2) {
      if (!w9File) {
        toast.error('Signed W-9 is required.')
        return
      }
      if (!ownerIdFile) {
        toast.error('Owner government ID is required.')
        return
      }
    }
    if (step < 3) setStep((step + 1) as 1 | 2 | 3)
  }

  const previousStep = () => {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3)
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
        ownerPhone: data.ownerPhone,
        ownerDob: data.ownerDob,
        ownerSsn: data.ownerSsn,
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

      // Upload logo if provided, then set it on the Clerk org
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

        if (w9File) {
          const uploadResult = await uploadOrganizationDocument(
            w9File,
            result.organizationId,
            'online-store-w9'
          )
          if (uploadResult.success && uploadResult.cdnUrl) {
            metadataUpdates.online_store_w9_form_url = uploadResult.cdnUrl
          } else if (!uploadResult.success) {
            toast.warning('Merchant created but W-9 upload failed: ' + (uploadResult.error || 'Unknown error'))
          }
        }

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
            <CardTitle>
              Create New Merchant: Step {step} of 3
            </CardTitle>
            <CardDescription>{STEP_TITLES[step - 1]}</CardDescription>
            <div className="grid grid-cols-3 gap-2 pt-2">
              {STEP_TITLES.map((title, index) => {
                const stepNumber = index + 1
                const isActive = step === stepNumber
                const isComplete = step > stepNumber
                return (
                  <div
                    key={title}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      isActive ? 'border-primary bg-primary/5' : isComplete ? 'border-green-500 bg-green-50' : ''
                    }`}
                  >
                    {stepNumber}. {title}
                  </div>
                )
              })}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {step === 1 && (
              <>
              <div className="grid gap-4 md:grid-cols-2">
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
                      <FormLabel>DBA Name (Optional)</FormLabel>
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
                          value={field.value}
                          onChange={(event) => field.onChange(formatEinTaxId(event.target.value))}
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
              <div className="rounded-lg border bg-muted/30 p-5">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1 space-y-1">
                    <Label className="text-sm font-semibold">Business Logo</Label>
                    <p className="text-xs text-muted-foreground">
                      Upload a logo for the merchant. PNG, JPG, WEBP, or SVG — max 5MB, recommended 512×512px.
                    </p>
                    {!logoPreview && (
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
                    )}
                    {logoPreview && (
                      <div className="flex items-center gap-2 pt-2">
                        <span className="text-sm text-muted-foreground truncate max-w-[260px]">{logoFile?.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive"
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
                    className={`shrink-0 h-24 w-24 rounded-xl border-2 flex items-center justify-center overflow-hidden transition-colors ${
                      logoPreview
                        ? 'border-solid border-border'
                        : 'border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50'
                    }`}
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

            {step === 2 && (
              <div className="grid gap-4 md:grid-cols-2">
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
                        <Input {...field} placeholder="(555) 123-4567" />
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
                      <FormLabel>Owner DOB</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ownerSsn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Owner SSN</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value}
                          onChange={(event) => field.onChange(formatSsn(event.target.value))}
                          placeholder="123-45-6789"
                          maxLength={11}
                          inputMode="numeric"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4 space-y-3">
                    <div>
                      <Label>Signed W-9 Form (PDF)</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Upload the signed W-9 that HQ will review before approving online-store setup.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => w9InputRef.current?.click()}
                      >
                        Choose File
                      </Button>
                      {w9File ? (
                        <>
                          <span className="text-sm text-muted-foreground truncate">{w9File.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => clearDocument('w9')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">No file selected</span>
                      )}
                    </div>
                    <input
                      ref={w9InputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(event) => handleDocumentSelect(event.target.files?.[0] || null, 'w9')}
                    />
                  </div>

                  <div className="rounded-lg border p-4 space-y-3">
                    <div>
                      <Label>Government ID</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Upload the owner government ID used for storefront compliance review.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => ownerIdInputRef.current?.click()}
                      >
                        Choose File
                      </Button>
                      {ownerIdFile ? (
                        <>
                          <span className="text-sm text-muted-foreground truncate">{ownerIdFile.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => clearDocument('ownerId')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">No file selected</span>
                      )}
                    </div>
                    <input
                      ref={ownerIdInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      className="hidden"
                      onChange={(event) => handleDocumentSelect(event.target.files?.[0] || null, 'ownerId')}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="businessAddressLine1"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Business Address Line 1</FormLabel>
                      <FormControl>
                        <AddressAutocomplete
                          value={field.value ?? ''}
                          onInputChange={(v) =>
                            form.setValue('businessAddressLine1', v, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                          onAddressSelected={(parts) => {
                            form.setValue('businessAddressLine1', parts.address_line1, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                            form.setValue('businessCity', parts.city, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                            form.setValue('businessState', parts.state, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                            form.setValue('businessPostalCode', parts.postal_code, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                            if (parts.country) {
                              form.setValue('businessCountry', parts.country, {
                                shouldDirty: true,
                                shouldValidate: true,
                              })
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
                    <FormItem className="md:col-span-2">
                      <FormLabel>Business Address Line 2 (Optional)</FormLabel>
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
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div className="rounded-md border p-4">
                  <h3 className="mb-2 font-semibold">Review</h3>
                  <div className="flex gap-4">
                    {logoPreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoPreview}
                        alt="Logo"
                        className="h-16 w-16 rounded-lg object-cover border shrink-0"
                      />
                    )}
                    <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">Business:</span>{' '}
                      {values.dbaName?.trim() || values.businessLegalName}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Type:</span> {values.businessType}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">EIN / Tax ID:</span> {values.einTaxId}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Owner:</span> {values.ownerFirstName}{' '}
                      {values.ownerLastName} - {values.ownerEmail}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Phone:</span> {values.ownerPhone}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">DOB:</span> {values.ownerDob}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">SSN:</span> •••-••-{values.ownerSsn.slice(-4)}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Signed W-9:</span> {w9File?.name || 'Missing'}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Government ID:</span> {ownerIdFile?.name || 'Missing'}
                    </p>
                    <p>
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
          <Button type="button" variant="outline" onClick={previousStep} disabled={step === 1 || isSubmitting}>
            Back
          </Button>

          {step < 3 ? (
            <Button type="button" onClick={nextStep} disabled={isSubmitting}>
              Continue
            </Button>
          ) : (
            <Button type="button" disabled={isSubmitting} onClick={form.handleSubmit(onSubmit)}>
              {isSubmitting ? 'Creating...' : 'Create Merchant'}
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Required permissions: <Label className="font-mono text-xs">hq.merchant.create</Label>
        </div>
      </div>
    </Form>
  )
}
