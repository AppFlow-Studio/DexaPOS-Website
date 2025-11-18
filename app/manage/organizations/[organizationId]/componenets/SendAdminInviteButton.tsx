'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Card } from '@/components/ui/card'
import { UserPlus2, Users, Mail, User, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { createOrganizationBulkInvite } from '../../actions/clerk-create-organization-bulk-invite'
import { useUser } from '@clerk/nextjs'
import { createInvitationAdmin } from '../../actions/clerk-create-invitation-admin'
import { useRolesHQ } from '@/app/manage/hooks/useRolesHQ'
import { RolesModel } from '@/types/db-modles'

const inviteSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
})

type InviteFormValues = z.infer<typeof inviteSchema>

export const SendAdminInviteButton = ({ organizationId, refetch, role_types }: { organizationId: string, refetch: () => void, role_types?: string }) => {
    const { data: roles, isLoading: isLoadingRoles, isError: isErrorRoles } = useRolesHQ(role_types)
    const [adminInviteDialog, setAdminInviteDialog] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const { user } = useUser()
    const form = useForm<InviteFormValues>({
        resolver: zodResolver(inviteSchema),
        defaultValues: { email: '' },
    })
    if (isErrorRoles || roles instanceof Error) {
        return (
            <div className="flex flex-col items-center justify-center space-y-4 py-12">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                </div>
            </div>
        )
    }
    const selectedOrgAdminRole = roles?.find((role: RolesModel) => role.level === 10)



    const onSubmit = async (values: InviteFormValues) => {
        try {
            setIsLoading(true)

            const email = values.email.trim()
            if (!email) {
                toast.error('Please enter an email address')
                return
            }
            console.log(email)
            const res = await createInvitationAdmin({organizationId, email, role: selectedOrgAdminRole?.code, level_type: selectedOrgAdminRole?.level_type, org_type: role_types as string})
            if (res?.success) {
                toast.success('Admin invitation sent')
                refetch()
            } else {
                toast.error(res?.message || 'Failed to send invitations. Please try again.')
            }
            setAdminInviteDialog(false)
            form.reset()
        } catch (error) {
            toast.error('Failed to send invitations. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    if (isLoadingRoles) {
        return (
            <div className="flex flex-col items-center justify-center space-y-4 py-12">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </div>
        )
    }


    return (
        <Dialog open={adminInviteDialog} onOpenChange={setAdminInviteDialog}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <UserPlus2 className="h-4 w-4 mr-2" />
                    Send Invitation
                </Button>
            </DialogTrigger>
            <DialogContent className="min-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Section - Form */}
                    <div className="lg:col-span-2 space-y-6">
                        <div>
                            <DialogTitle className="text-2xl font-bold mb-2">Invite the organization admin</DialogTitle>
                            <p className="text-muted-foreground">
                                Send the first invitation to the owner/admin to get them into DexaPOS.
                            </p>
                        </div>

                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <Card className="p-4">
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <FormField
                                                control={form.control}
                                                name={`email`}
                                                render={({ field }: { field: any }) => (
                                                    <FormItem>
                                                        <FormLabel className="text-sm font-medium">Admin email address</FormLabel>
                                                        <FormControl>
                                                            <div className="relative">
                                                                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                                <Input
                                                                    placeholder="owner@business.com"
                                                                    className="pl-10"
                                                                    {...field}
                                                                />
                                                            </div>
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                        <div className="w-32">
                                            <div className="text-xs text-muted-foreground">Role</div>
                                            <div className="flex items-center gap-2 text-sm">
                                                <User className="h-4 w-4" /> {selectedOrgAdminRole?.code}
                                            </div>
                                        </div>
                                    </div>
                                </Card>

                                <div className="flex items-center justify-between pt-4">
                                    {/* <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setAdminInviteDialog(false)}
                                    >
                                        Remind me later
                                    </Button> */}
                                    <Button type="submit" className="px-8" disabled={isLoading}>
                                        Send Admin Invite
                                        {isLoading && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </div>

                    {/* Right Section - Illustration */}
                    <div className="lg:col-span-1 bg-muted/30 rounded-lg p-8 flex flex-col items-center justify-center space-y-6">
                        <div className="relative">
                            {/* Main circle */}
                            <div className="w-32 h-32 bg-primary rounded-full flex items-center justify-center">
                                <Users className="h-16 w-16 text-primary-foreground" />
                            </div>

                            {/* Profile circles */}
                            <div className="absolute -top-2 -right-2 w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                                <User className="h-6 w-6 text-white" />
                            </div>
                            <div className="absolute -bottom-2 -left-2 w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center">
                                <User className="h-6 w-6 text-white" />
                            </div>

                            {/* Chat bubbles */}
                            {/* <div className="absolute top-4 -right-8 w-16 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center">
                                <div className="flex space-x-1">
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                </div>
                            </div> */}
                            {/* <div className="absolute -bottom-4 -left-8 w-16 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center">
                                <div className="flex space-x-1">
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                </div>
                            </div> */}
                        </div>

                        <div className="text-center">
                            <h3 className="text-xl font-bold">Work better together.</h3>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}