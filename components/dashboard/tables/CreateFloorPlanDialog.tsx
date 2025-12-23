'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useCreateFloorPlanMutation } from '@/app/dashboard/hooks/useFloorPlan'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

const createFloorPlanSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
    description: z.string().max(500, 'Description must be less than 500 characters').optional(),
})

type CreateFloorPlanFormValues = z.infer<typeof createFloorPlanSchema>

interface CreateFloorPlanDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    locationId: string
    onSuccess: (floorPlanId: string) => void
}

export function CreateFloorPlanDialog({
    open,
    onOpenChange,
    locationId,
    onSuccess,
}: CreateFloorPlanDialogProps) {
    const createMutation = useCreateFloorPlanMutation(locationId)

    const form = useForm<CreateFloorPlanFormValues>({
        resolver: zodResolver(createFloorPlanSchema),
        defaultValues: {
            name: '',
            description: '',
        },
    })

    const handleSubmit = async (values: CreateFloorPlanFormValues) => {
        try {
            const result = await createMutation.mutateAsync({
                name: values.name,
                description: values.description || undefined,
            })

            toast.success('Floor plan created successfully')
            form.reset()
            onOpenChange(false)
            // The mutation returns { floorPlanId, floorPlans }
            onSuccess(result.floorPlanId)
        } catch (error) {
            console.error('Error creating floor plan:', error)
            toast.error('Failed to create floor plan. Please try again.')
        }
    }

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen && !createMutation.isPending) {
            form.reset()
        }
        onOpenChange(newOpen)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Create Floor Plan</DialogTitle>
                    <DialogDescription>
                        Create a new floor plan to start managing tables and reservations.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">
                            Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="name"
                            {...form.register('name')}
                            placeholder="e.g., Main Dining Room"
                            disabled={createMutation.isPending}
                            aria-invalid={!!form.formState.errors.name}
                        />
                        {form.formState.errors.name && (
                            <p className="text-sm text-destructive">
                                {form.formState.errors.name.message}
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description (Optional)</Label>
                        <Textarea
                            id="description"
                            {...form.register('description')}
                            placeholder="Add a description for this floor plan..."
                            rows={3}
                            disabled={createMutation.isPending}
                            aria-invalid={!!form.formState.errors.description}
                        />
                        {form.formState.errors.description && (
                            <p className="text-sm text-destructive">
                                {form.formState.errors.description.message}
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={createMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending}>
                            {createMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Floor Plan'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

