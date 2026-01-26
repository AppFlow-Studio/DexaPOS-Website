'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileUpload } from '@/components/ui/file-upload'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Store, Plus, Loader2, X, ChevronDown, Truck, Building2, AlertCircle, Search, Utensils, ShoppingBag, ShoppingCart, Wrench, Coffee } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { useUser } from '@clerk/nextjs'
import { Sheet } from 'react-modal-sheet'
import { createCarrierMerchantAccountAdmin } from '../../actions/create-carrier-merchant-account-admin'
import { useCarrierOrganizations } from '@/app/manage/hooks/useCarrierOrganizations'
import Image from 'next/image'
import { CarriersModel } from '@/types/db-modles'
const merchantSchema = z.object({
    carrierId: z.string().min(1, "Please select a carrier"),
    merchantType: z.enum(["Restaurant", "Retail", "Grocery", "Service", "Cafe"], {
        required_error: "Please select a merchant type",
    }),
    merchantName: z
        .string()
        .min(2, "Merchant name must be at least 2 characters")
        .max(80, "Merchant name must be less than 80 characters"),
    businessAddress: z
        .string()
        .min(5, "Business address must be at least 5 characters")
        .max(200, "Business address must be less than 200 characters"),
    ownerName: z
        .string()
        .min(2, "Owner name must be at least 2 characters")
        .max(100, "Owner name must be less than 100 characters"),
    ownerEmail: z
        .string()
        .email("Please enter a valid email address"),
    ownerPhone: z
        .string()
        .min(10, "Phone number must be at least 10 characters")
        .max(20, "Phone number must be less than 20 characters"),
    merchantImage: z.instanceof(File, { message: "Please upload a logo image" })
        .refine((file) => file && file.size < 5 * 1024 * 1024, {
            message: "Logo must be smaller than 5MB",
        })
        .refine((file) => file && ["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type), {
            message: "Accepted formats: PNG, JPG, WEBP, SVG",
        }),
})

type MerchantFormValues = z.infer<typeof merchantSchema>

interface Carrier {
    id: string
    name: string
    description?: string
    imageURL?: string
}

export const CreateMerchantsButton = ({
    organizationId,
    refetch,
}: {
    organizationId: string
    refetch?: () => void
}) => {
    const [merchantDialog, setMerchantDialog] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const { data: carriers, isLoading: isCarriersLoading, isError: isCarriersError, refetch: refetchCarriers } = useCarrierOrganizations()
    const [showScrollIndicator, setShowScrollIndicator] = useState(false)
    const [carrierSearchTerm, setCarrierSearchTerm] = useState('')
    const [showAllCarriers, setShowAllCarriers] = useState(false)
    const { user } = useUser()
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const form = useForm<MerchantFormValues>({
        resolver: zodResolver(merchantSchema),
        mode: "onChange",
        defaultValues: {
            carrierId: "",
            merchantType: undefined,
            merchantName: "",
            businessAddress: "",
            ownerName: "",
            ownerEmail: "",
            ownerPhone: "",
        } as Partial<MerchantFormValues>,
    })

    const setupScrollDetection = (container: HTMLDivElement) => {
        const handleScroll = (event: Event) => {
            const target = event.target as HTMLElement
            const { scrollTop, scrollHeight, clientHeight } = target
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10
            const hasScrollableContent = scrollHeight > clientHeight

            setShowScrollIndicator(hasScrollableContent && !isAtBottom)
        }

        // Add scroll listener to the container
        container.addEventListener('scroll', handleScroll)

        // Check initial state with multiple attempts
        const checkScrollState = () => {
            const { scrollTop, scrollHeight, clientHeight } = container
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10
            const hasScrollableContent = scrollHeight > clientHeight

            setShowScrollIndicator(hasScrollableContent && !isAtBottom)
        }

        // Check multiple times to ensure content is loaded
        setTimeout(checkScrollState, 100)
        setTimeout(checkScrollState, 500)
        setTimeout(checkScrollState, 1000)

        return () => {
            container.removeEventListener('scroll', handleScroll)
        }
    }

    useEffect(() => {
        if (merchantDialog) {
            // Wait for the sheet to be fully rendered
            const timer = setTimeout(() => {
                if (scrollContainerRef.current) {
                    const cleanup = setupScrollDetection(scrollContainerRef.current)
                    return cleanup
                }
            }, 200)

            return () => clearTimeout(timer)
        }
    }, [merchantDialog])

    const onSubmit = async (values: MerchantFormValues) => {
        if (!user?.id) return
        setIsLoading(true)
        try {
            console.log('Creating merchant:', values)

            const res = await createCarrierMerchantAccountAdmin({
                merchantName: values.merchantName,
                merchantType: values.merchantType,
                businessAddress: values.businessAddress,
                ownerName: values.ownerName,
                ownerEmail: values.ownerEmail,
                ownerPhone: values.ownerPhone,
                merchantImage: values.merchantImage,
                userId: user.id,
                carrierId: values.carrierId,
            })

            if (res?.success) {
                toast.success('Merchant Created', {
                    description: res.message
                })
                setMerchantDialog(false)
                form.reset()
                setCarrierSearchTerm('')
                setShowAllCarriers(false)
                refetch?.()
            } else {
                toast.error('Creation Failed', {
                    description: res?.message || 'Unable to create the merchant. Please try again.'
                })
            }
        } catch (error) {
            console.error('Error creating merchant:', error)
            toast.error('Creation Failed', {
                description: 'Unable to create the merchant. Please try again.'
            })
        } finally {
            setIsLoading(false)
        }
    }

    // Filter carriers based on search term
    const filteredCarriers = Array.isArray(carriers) ? carriers.filter((carrier: Carrier) =>
        carrier.name.toLowerCase().includes(carrierSearchTerm.toLowerCase()) ||
        (carrier.description && carrier.description.toLowerCase().includes(carrierSearchTerm.toLowerCase()))
    ) : []

    // Show limited carriers initially, all if showAllCarriers is true
    const displayedCarriers = showAllCarriers ? filteredCarriers : filteredCarriers.slice(0, 5)
    const hasMoreCarriers = filteredCarriers.length > 5

    console.log(form.formState.isValid)
    return (
        <>
            <Button size="sm" onClick={() => setMerchantDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Merchant
            </Button>

            <Sheet isOpen={merchantDialog} onClose={() => {
                setMerchantDialog(false)
                setCarrierSearchTerm('')
                setShowAllCarriers(false)
            }}>
                <Sheet.Container>
                    <Sheet.Header>
                        <div className="flex items-center justify-between p-4 border-b">
                            <div>
                                <h2 className="text-xl font-semibold">Create New Merchant</h2>
                                <p className="text-sm text-muted-foreground">
                                    Create a new merchant store and assign it to a carrier
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setMerchantDialog(false)}
                                className="h-8 w-8 p-0"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </Sheet.Header>
                    <Sheet.Content>
                        <div className="relative">
                            <div
                                ref={scrollContainerRef}
                                className="p-4 space-y-6 max-h-[85vh] overflow-y-auto"
                            >
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                        {/* Carrier Selection Card */}
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    <Truck className="h-5 w-5" />
                                                    Carrier Selection
                                                </CardTitle>
                                                <CardDescription>
                                                    Select the carrier that will manage this merchant
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                {isCarriersLoading ? (
                                                    <div className="flex items-center justify-center py-8">
                                                        <Loader2 className="h-6 w-6 animate-spin" />
                                                    </div>
                                                ) : isCarriersError || carriers instanceof Error ? (
                                                    <div className="flex items-center justify-center py-8">
                                                        <AlertCircle className="h-6 w-6 text-red-500" />
                                                        <span className="ml-2 text-sm text-muted-foreground">Failed to load carriers</span>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        {/* Search Bar */}
                                                        <div className="relative">
                                                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                                            <Input
                                                                placeholder="Search carriers..."
                                                                value={carrierSearchTerm}
                                                                onChange={(e) => setCarrierSearchTerm(e.target.value)}
                                                                className="pl-9"
                                                            />
                                                        </div>

                                                        <FormField
                                                            control={form.control}
                                                            name="carrierId"
                                                            render={({ field }: { field: any }) => (
                                                                <FormItem className="space-y-3">
                                                                    <FormLabel>Select Carrier</FormLabel>
                                                                    <FormControl>
                                                                        <RadioGroup
                                                                            onValueChange={field.onChange}
                                                                            value={field.value}
                                                                            className="grid grid-cols-1 gap-3"
                                                                        >
                                                                            {displayedCarriers.length > 0 ? (
                                                                                displayedCarriers.map((carrier) => (
                                                                                    <div key={carrier.id} className="flex items-center space-x-3">
                                                                                        <RadioGroupItem value={carrier.id} id={carrier.id} />
                                                                                        <label
                                                                                            htmlFor={carrier.id}
                                                                                            className="flex items-center space-x-3 cursor-pointer flex-1 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                                                                                        >
                                                                                            <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                                                                                                {carrier?.organizations?.imageURL ? <Image src={carrier.organizations.imageURL} alt={carrier.name} width={32} height={32} /> : <Building2 className="h-4 w-4 text-blue-600" />}
                                                                                            </div>
                                                                                            <div className="flex-1">
                                                                                                <div className="font-medium text-sm">{carrier.name}</div>
                                                                                                {carrier.description && (
                                                                                                    <div className="text-xs text-muted-foreground">
                                                                                                        {carrier.description}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        </label>
                                                                                    </div>
                                                                                ))
                                                                            ) : (
                                                                                <div className="text-center py-6 text-muted-foreground">
                                                                                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                                                    <p className="text-sm">No carriers found</p>
                                                                                    {carrierSearchTerm && (
                                                                                        <p className="text-xs mt-1">Try adjusting your search terms</p>
                                                                                    )}
                                                                                </div>
                                                                            )}

                                                                            {/* Show More Button */}
                                                                            {hasMoreCarriers && !showAllCarriers && (
                                                                                <div className="pt-2">
                                                                                    <Button
                                                                                        type="button"
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        onClick={() => setShowAllCarriers(true)}
                                                                                        className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                                                    >
                                                                                        Show {filteredCarriers.length - 5} more carriers
                                                                                    </Button>
                                                                                </div>
                                                                            )}

                                                                            {/* Show Less Button */}
                                                                            {hasMoreCarriers && showAllCarriers && (
                                                                                <div className="pt-2">
                                                                                    <Button
                                                                                        type="button"
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        onClick={() => setShowAllCarriers(false)}
                                                                                        className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                                                    >
                                                                                        Show less
                                                                                    </Button>
                                                                                </div>
                                                                            )}
                                                                        </RadioGroup>
                                                                    </FormControl>
                                                                    <FormDescription>
                                                                        Choose which carrier will be responsible for this merchant.
                                                                    </FormDescription>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>

                                        {/* Merchant Type Selection Card */}
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    <Store className="h-5 w-5" />
                                                    Business Type
                                                </CardTitle>
                                                <CardDescription>
                                                    Select the type of business for this merchant
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <FormField
                                                    control={form.control}
                                                    name="merchantType"
                                                    render={({ field }: { field: any }) => (
                                                        <FormItem className="space-y-3">
                                                            <FormLabel>Merchant Type</FormLabel>
                                                            <FormControl>
                                                                <RadioGroup
                                                                    onValueChange={field.onChange}
                                                                    value={field.value}
                                                                    className="grid grid-cols-1 gap-3"
                                                                >
                                                                    {[
                                                                        { value: "Restaurant", label: "Restaurant", icon: Utensils, description: "Food service and dining establishments" },
                                                                        { value: "Retail", label: "Retail", icon: ShoppingBag, description: "General retail and merchandise stores" },
                                                                        { value: "Grocery", label: "Grocery", icon: ShoppingCart, description: "Food and household item stores" },
                                                                        { value: "Service", label: "Service", icon: Wrench, description: "Professional and personal services" },
                                                                        { value: "Cafe", label: "Cafe", icon: Coffee, description: "Coffee shops and casual dining" },
                                                                    ].map((type) => {
                                                                        const IconComponent = type.icon
                                                                        return (
                                                                            <div key={type.value} className="flex items-center space-x-3">
                                                                                <RadioGroupItem value={type.value} id={type.value} />
                                                                                <label
                                                                                    htmlFor={type.value}
                                                                                    className="flex items-center space-x-3 cursor-pointer flex-1 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                                                                                >
                                                                                    <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center">
                                                                                        <IconComponent className="h-4 w-4 text-green-600" />
                                                                                    </div>
                                                                                    <div className="flex-1">
                                                                                        <div className="font-medium text-sm">{type.label}</div>
                                                                                        <div className="text-xs text-muted-foreground">
                                                                                            {type.description}
                                                                                        </div>
                                                                                    </div>
                                                                                </label>
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </RadioGroup>
                                                            </FormControl>
                                                            <FormDescription>
                                                                Choose the category that best describes this business.
                                                            </FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </CardContent>
                                        </Card>

                                        {/* Business Information Card */}
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="text-lg">Business Information</CardTitle>
                                                <CardDescription>
                                                    Basic information about the merchant business
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="grid gap-4 md:grid-cols-2">
                                                <FormField
                                                    control={form.control}
                                                    name="merchantName"
                                                    render={({ field }: { field: any }) => (
                                                        <FormItem>
                                                            <FormLabel>Business Name</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="Joe's Coffee Shop" {...field} />
                                                            </FormControl>
                                                            <FormDescription>
                                                                The public display name for this business.
                                                            </FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="businessAddress"
                                                    render={({ field }: { field: any }) => (
                                                        <FormItem>
                                                            <FormLabel>Business Address</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="123 Main St, City, State 12345" {...field} />
                                                            </FormControl>
                                                            <FormDescription>
                                                                Main business address for the merchant.
                                                            </FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </CardContent>
                                        </Card>

                                        {/* Owner Information Card */}
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="text-lg">Owner Information</CardTitle>
                                                <CardDescription>
                                                    Contact details for the business owner
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent className="grid gap-4 md:grid-cols-2">
                                                <FormField
                                                    control={form.control}
                                                    name="ownerName"
                                                    render={({ field }: { field: any }) => (
                                                        <FormItem>
                                                            <FormLabel>Owner Name</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="John Doe" {...field} />
                                                            </FormControl>
                                                            <FormDescription>
                                                                Full name of the business owner.
                                                            </FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="ownerEmail"
                                                    render={({ field }: { field: any }) => (
                                                        <FormItem>
                                                            <FormLabel>Owner Email</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="john@joescoffee.com" type="email" {...field} />
                                                            </FormControl>
                                                            <FormDescription>
                                                                Email address for the owner account.
                                                            </FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="ownerPhone"
                                                    render={({ field }: { field: any }) => (
                                                        <FormItem>
                                                            <FormLabel>Owner Phone</FormLabel>
                                                            <FormControl>
                                                                <Input placeholder="(555) 123-4567" {...field} />
                                                            </FormControl>
                                                            <FormDescription>
                                                                Contact phone number for the owner.
                                                            </FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </CardContent>
                                        </Card>

                                        {/* Business Logo Card */}
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="text-lg">Business Logo</CardTitle>
                                                <CardDescription>
                                                    Upload a logo for the merchant store
                                                </CardDescription>
                                            </CardHeader>
                                            <CardContent>
                                                <FormField
                                                    control={form.control}
                                                    name="merchantImage"
                                                    render={({ field }: { field: any }) => (
                                                        <FormItem>
                                                            <FormLabel>Store Logo</FormLabel>
                                                            <FormControl>
                                                                <FileUpload
                                                                    onChange={(file: File | null) => {
                                                                        field.onChange(file)
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            <FormDescription>
                                                                PNG, JPG, WEBP, or SVG up to 5MB. Recommended size: 512x512px.
                                                            </FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </CardContent>
                                        </Card>

                                        {/* Action Buttons */}
                                        <div className="flex justify-end gap-2 pt-4 pb-4">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => {
                                                    setMerchantDialog(false)
                                                    setCarrierSearchTerm('')
                                                    setShowAllCarriers(false)
                                                }}
                                                disabled={isLoading}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                type="submit"
                                                disabled={isLoading || !form.formState.isValid || !carriers || (Array.isArray(carriers) && carriers.length === 0)}
                                            >
                                                {isLoading ? (
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                ) : (
                                                    <Store className="h-4 w-4 mr-2" />
                                                )}
                                                {isLoading ? "Creating..." : "Create Merchant"}
                                            </Button>
                                        </div>
                                    </form>
                                </Form>
                            </div>

                            {/* Scroll Indicator */}
                            {showScrollIndicator && (
                                <div className={`fixed bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none z-50 transition-opacity duration-300 ${showScrollIndicator ? 'opacity-100' : 'opacity-0'}`}>
                                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
                                        <div className="flex items-center gap-1 text-gray-600 text-sm font-medium">
                                            <span>Scroll for more</span>
                                            <ChevronDown className="w-4 h-4 animate-bounce" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Sheet.Content>
                </Sheet.Container>
                <Sheet.Backdrop />
            </Sheet>
        </>
    )
}
