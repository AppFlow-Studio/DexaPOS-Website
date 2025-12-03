"use client"

import React, { useState } from "react"
import { z } from "zod"
import { useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { FileUpload } from "@/components/ui/file-upload"
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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Create Organization</h1>
                    <p className="text-muted-foreground">Add a new partner organization</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/manage/organizations">
                        <Button variant="outline">Cancel</Button>
                    </Link>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Organization Details</CardTitle>
                    <CardDescription>
                        Provide the organization name and upload a square logo (recommended 512x512)
                    </CardDescription>
                </CardHeader>
                <CardContent>
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

                            <div className="md:col-span-2 flex items-center justify-between">
                                <div className="space-x-2">
                                    {/* <Badge variant="secondary">Validated with Zod</Badge>
                                    <Badge variant="outline">RHF Integrated</Badge> */}
                                </div>
                                <Button type="submit" disabled={submitting || !form.formState.isValid}>
                                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {submitting ? "Creating..." : "Create Organization"}
                                </Button>
                            </div>

                            {/* {error && (
                                <p className="text-destructive md:col-span-2">{error}</p>
                            )}
                            {success && (
                                <p className="text-green-600 md:col-span-2">{success}</p>
                            )} */}
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    )
}