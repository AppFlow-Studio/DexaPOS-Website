'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { UserPlus2, Plus, Users, Mail, Shield, User, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { useUser } from '@clerk/nextjs'
import { createBulkInvitationAdmin } from '../../actions/clerk-create-bulk-invitiation-admin'
import { useRolesHQ } from '@/app/manage/hooks/useRolesHQ'
import { RolesModel } from '@/types/db-modles'

const inviteSchema = z.object({
    invitations: z.array(
        z.object({
            email: z.string().email('Please enter a valid email address'),
            role: z.string().min(1, 'Please select a role'),
            level_type: z.string().min(1, 'Please select a level type'),
        }),

    ).min(1, 'At least one invitation is required'),
})

type InviteFormValues = z.infer<typeof inviteSchema>

export const SendOrganizationMembersInviteButton = ({ organizationId, refetch, role_types }: { organizationId: string, refetch?: () => void, role_types?: string }) => {
    const { data: roles, isLoading: isLoadingRoles } = useRolesHQ(role_types)
    const [organizationMembersInviteDialog, setOrganizationMembersInviteDialog] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const form = useForm<InviteFormValues>({
        resolver: zodResolver(inviteSchema),
        defaultValues: {
            invitations: [
                { email: '', role: '', level_type: 'member' },
            ],
        },
    })

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'invitations',

    })
    console.log(roles)

    const onSubmit = async (values: InviteFormValues) => {
        try {
            setIsLoading(true)
            // Filter out empty emails
            const validInvitations = values.invitations.filter(invite => invite.email.trim() !== '')

            if (validInvitations.length === 0) {
                toast.error('Please enter at least one email address')
                return
            }

            const res = await createBulkInvitationAdmin(organizationId, validInvitations)
            console.log('Sending invitations:', validInvitations)
            if (res?.success === true) {
                toast.success(`Successfully sent ${validInvitations.length} invitation${validInvitations.length > 1 ? 's' : ''}`)
                refetch?.()
            } else {
                toast.error(res?.message || 'Failed to send invitations. Please try again.')
            }
            setOrganizationMembersInviteDialog(false)
            form.reset()
        } catch (error) {
            toast.error('Failed to send invitations. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    const addAnother = () => {
        append({ email: '', role: 'org:member', level_type: 'member' })
    }

    return (
        <Dialog open={organizationMembersInviteDialog} onOpenChange={setOrganizationMembersInviteDialog}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <UserPlus2 className="h-4 w-4 mr-2" />
                    Send Organization Members Invitation
                </Button>
            </DialogTrigger>
            <DialogContent className="min-w-5xl max-h-[90vh] overflow-y-auto">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Section - Form */}
                    <div className="lg:col-span-2 space-y-6">
                        <div>
                            <DialogTitle className="text-2xl font-bold mb-2">Invite your teammates</DialogTitle>
                            <p className="text-muted-foreground">
                                Collaborate with your team to get the most out of DexaPOS.
                            </p>
                        </div>

                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <div className="space-y-4">
                                    {fields.map((field, index) => (
                                        <Card key={field.id} className="p-4">
                                            <div className="flex items-center gap-4">
                                                <div className="flex-1">
                                                    <FormField
                                                        control={form.control}
                                                        name={`invitations.${index}.email`}
                                                        render={({ field }: { field: any }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-sm font-medium">Email Address</FormLabel>
                                                                <FormControl>
                                                                    <div className="relative">
                                                                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                                        <Input
                                                                            placeholder="Add email here"
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
                                                <div className="w-fit">
                                                    <FormField
                                                        control={form.control}
                                                        name={`invitations.${index}.role`}
                                                        render={({ field }: { field: any }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-sm font-medium">Role</FormLabel>
                                                                <Select onValueChange={(value) => {
                                                                    field.onChange(value);
                                                                    const selectedRole = roles?.find(role => role.code === value);
                                                                    if (selectedRole) {
                                                                        form.setValue(`invitations.${index}.level_type`, selectedRole.level_type);
                                                                    }
                                                                }} defaultValue={field.value}>
                                                                    <FormControl>
                                                                        <SelectTrigger className='h-fit py-2'>
                                                                            <SelectValue placeholder="Select role" />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        {
                                                                            roles?.map((role: RolesModel) => (
                                                                                <SelectItem key={role.id} value={role.code}>
                                                                                    <div className="flex flex-col items-center gap-2">
                                                                                        <div className='flex items-center gap-2'>
                                                                                            <Shield className="h-4 w-4" />
                                                                                            {role.name}
                                                                                        </div>
                                                                                        {/* <span className='text-xs text-muted-foreground'>{role.description}</span> */}
                                                                                    </div>
                                                                                </SelectItem>
                                                                            ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                {fields.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => remove(index)}
                                                        className="text-muted-foreground hover:text-destructive"
                                                    >
                                                        ×
                                                    </Button>
                                                )}
                                            </div>
                                        </Card>
                                    ))}
                                </div>

                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={addAnother}
                                    className="w-full border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50"
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add another
                                </Button>

                                <div className="flex items-center justify-between pt-4">
                                    {/* <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setAdminInviteDialog(false)}
                                    >
                                        Remind me later
                                    </Button> */}
                                    <Button type="submit" className="px-8" disabled={isLoading}>
                                        Send Invites
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
                            <div className="absolute top-4 -right-8 w-16 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center">
                                <div className="flex space-x-1">
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                </div>
                            </div>
                            <div className="absolute -bottom-4 -left-8 w-16 h-8 bg-white rounded-lg shadow-sm flex items-center justify-center">
                                <div className="flex space-x-1">
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                    <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
                                </div>
                            </div>
                        </div>

                        <div className="text-center">
                            <h3 className="text-xl font-bold">Work better together.</h3>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog >
    )
}