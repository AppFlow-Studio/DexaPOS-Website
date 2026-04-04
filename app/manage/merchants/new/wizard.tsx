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
import { ImagePlus, X } from 'lucide-react'
import { createMerchantOnboarding } from '@/app/manage/actions/create-merchant-onboarding'
import { uploadOrganizationLogo } from '@/lib/cdn/server'

const createMerchantSchema = z.object({
  businessLegalName: z.string().min(2, 'Business legal name is required.'),
  dbaName: z.string().optional(),
  businessType: z.enum(['llc', 'corporation', 'sole_proprietor', 'partnership', 'nonprofit']),
  einLastFour: z.string().regex(/^[0-9]{4}$/, 'EIN must be exactly 4 digits.'),
  ownerFirstName: z.string().min(1, 'Owner first name is required.'),
  ownerLastName: z.string().min(1, 'Owner last name is required.'),
  ownerEmail: z.string().email('Valid owner email is required.'),
  ownerPhone: z.string().min(7, 'Owner phone is required.'),
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

export function CreateMerchantWizard({}: CreateMerchantWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [isSubmitting, startTransition] = useTransition()
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

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

  const form = useForm<CreateMerchantWizardValues>({
    resolver: zodResolver(createMerchantSchema),
    mode: 'onBlur',
    defaultValues: {
      businessLegalName: '',
      dbaName: '',
      businessType: 'llc',
      einLastFour: '',
      ownerFirstName: '',
      ownerLastName: '',
      ownerEmail: '',
      ownerPhone: '',
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
      1: ['businessLegalName', 'businessType', 'einLastFour'] as const,
      2: [
        'ownerFirstName',
        'ownerLastName',
        'ownerEmail',
        'ownerPhone',
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
    if (step < 3) setStep((step + 1) as 1 | 2 | 3)
  }

  const previousStep = () => {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3)
  }

  const onSubmit = (data: CreateMerchantWizardValues) => {
    startTransition(async () => {
      const result = await createMerchantOnboarding({
        businessLegalName: data.businessLegalName,
        dbaName: data.dbaName,
        businessType: data.businessType,
        einLastFour: data.einLastFour,
        ownerFirstName: data.ownerFirstName,
        ownerLastName: data.ownerLastName,
        ownerEmail: data.ownerEmail,
        ownerPhone: data.ownerPhone,
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
        toast.error(result.error || 'Failed to create merchant.')
        return
      }

      // Upload logo if provided
      if (logoFile && result.organizationId) {
        const uploadResult = await uploadOrganizationLogo(logoFile, result.organizationId)
        if (!uploadResult.success) {
          toast.warning('Merchant created but logo upload failed: ' + (uploadResult.error || 'Unknown error'))
        }
      }

      toast.success('Merchant created and owner invited.')
      router.push(`/manage/merchants/${result.organizationId || result.merchantId}`)
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                  name="einLastFour"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>EIN (Last 4)</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={4} inputMode="numeric" placeholder="4567" />
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
                  name="businessAddressLine1"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Business Address Line 1</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="123 Main St" />
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
                      <span className="font-medium text-foreground">EIN:</span> ****{values.einLastFour}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Owner:</span> {values.ownerFirstName}{' '}
                      {values.ownerLastName} - {values.ownerEmail}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Phone:</span> {values.ownerPhone}
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Merchant'}
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Required permissions: <Label className="font-mono text-xs">hq.merchant.create</Label>
        </div>
      </form>
    </Form>
  )
}
