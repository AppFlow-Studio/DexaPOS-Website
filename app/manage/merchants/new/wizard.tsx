'use client'

import { useMemo, useState, useTransition } from 'react'
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
import { createMerchantOnboarding } from '@/app/manage/actions/create-merchant-onboarding'

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
  carrierId: z.string().min(1, 'Carrier selection is required.'),
})

type CreateMerchantWizardValues = z.infer<typeof createMerchantSchema>

interface CarrierOption {
  id: string
  name: string
}

interface CreateMerchantWizardProps {
  carriers: CarrierOption[]
}

const STEP_TITLES = ['Business Info', 'Owner Contact', 'Review & Create'] as const

export function CreateMerchantWizard({ carriers }: CreateMerchantWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [isSubmitting, startTransition] = useTransition()

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
      carrierId: '',
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
      3: ['carrierId'] as const,
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
        carrierId: data.carrierId,
      })

      if (!result.success) {
        toast.error(result.error || 'Failed to create merchant.')
        return
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

                <FormField
                  control={form.control}
                  name="carrierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Carrier Assignment</FormLabel>
                      {carriers.length === 0 ? (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                          No carriers found. Create a carrier first before creating a merchant.
                        </div>
                      ) : (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select carrier" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {carriers.map((carrier) => (
                              <SelectItem key={carrier.id} value={carrier.id}>
                                {carrier.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
            <Button type="submit" disabled={isSubmitting || carriers.length === 0}>
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
