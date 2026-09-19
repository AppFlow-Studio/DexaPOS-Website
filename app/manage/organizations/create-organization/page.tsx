"use client"

import React, { useState } from "react"
import { z } from "zod"
import { useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { FileUpload } from "@/components/ui/file-upload"
import { PageHeader, PageShell, Panel, PanelSection } from "@/components/dashboard/shell"
import { ClerkCreateOrganization } from "../actions/clerk-create-organization"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

const schema = z.object({
    organizationName: z
        .string()
        .min(2, "Organization name must be at least 2 characters")
        .max(80, "Organization name must be less than 80 characters"),
    organizationImage: z.instanceof(File, { message: "Please upload a logo image" })
        .refine((file) => file && file.size < 5 * 1024 * 1024, {
            message: "Logo must be smaller than 5MB",
        })
        .refine((file) => file && ["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type), {
            message: "Accepted formats: PNG, JPG, WEBP, SVG",
        }),
})

type FormValues = z.infer<typeof schema>

export default function CreateOrganizationPage() {
    const { user } = useUser()
    const router = useRouter()
    const [submitting, setSubmitting] = useState(false)


    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        mode: "onChange",
        defaultValues: {
            organizationName: "",
        } as Partial<FormValues>,
    })

    async function onSubmit(values: FormValues) {
        if (!user?.id) return
        setSubmitting(true)
        try {
            const res = await ClerkCreateOrganization({
                organizationName: values.organizationName,
                organizationImage: values.organizationImage,
                userId: user.id,
            })
            if ((res as any)?.success) {
                toast.success('Organization Created', {
                    description: res.message
                })
                router.back()
            } else {
                toast.error('Creation Failed', {
                    description: (res as any)?.message || 'Unable to create the organization.'
                })
            }
        } catch (e: any) {
            toast.error('Creation Failed', {
                description: e?.message || 'Unable to create the organization.'
            })
        } finally {
            setSubmitting(false)
            form.reset()
        }
    }

    return (
        /* `as="div"`: app/manage/layout.tsx already owns this surface's <main>.
           `width="narrow"` is the form-page width (§3.1). */
        <PageShell as="div" width="narrow">
            <PageHeader
                title="Create Organization"
                subtitle="Add a new partner organization"
                backHref="/manage/organizations"
                backLabel="Back to Organizations"
                actions={
                    <Button variant="outline" asChild>
                        <Link href="/manage/organizations">Cancel</Link>
                    </Button>
                }
            />

            <Panel>
                <PanelSection
                    label="Organization Details"
                    caption="Provide the organization name and upload a square logo (recommended 512x512)"
                >
                    <Form {...(form as unknown as UseFormReturn)}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6 md:grid-cols-2">
                            <FormField
                                control={form.control}
                                name="organizationName"
                                render={({ field }: { field: any }) => (
                                    <FormItem>
                                        <FormLabel>Organization Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Acme Corporation" {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            The public display name for this organization.
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="organizationImage"
                                render={({ field }: { field: any }) => (
                                    <FormItem>
                                        <FormLabel>Organization Logo</FormLabel>
                                        <FormControl>
                                            <div>
                                                <FileUpload
                                                    onChange={(file: File | null) => {
                                                        field.onChange(file ?? undefined)
                                                    }}
                                                />
                                            </div>
                                        </FormControl>
                                        <FormDescription>PNG, JPG, WEBP, or SVG up to 5MB.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Centred on a phone, right-aligned from `sm` up: a
                                lone right-hugging button reads as clipped at
                                narrow widths. Full-width below `sm` gives it a
                                comfortable tap target. */}
                            <div className="flex items-center justify-center sm:justify-end md:col-span-2">
                                <Button
                                    type="submit"
                                    disabled={submitting || !form.formState.isValid}
                                    className="w-full sm:w-auto"
                                >
                                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {submitting ? "Creating..." : "Create Organization"}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </PanelSection>
            </Panel>
        </PageShell>
    )
}