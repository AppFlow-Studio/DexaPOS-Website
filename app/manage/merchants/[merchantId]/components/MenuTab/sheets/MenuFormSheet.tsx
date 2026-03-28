'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetSection,
} from '@/components/ui/bottom-sheet'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { CdnImageUploadField } from '@/components/ui/cdn-image-upload-field'
import { Loader2, Globe, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useMerchantCdnImageUpload } from '@/lib/cdn/use-merchant-cdn-image-upload'

import {
  createAdminMenu,
  updateAdminMenu,
  type AdminMenu,
} from '@/app/manage/actions/admin-merchant/menus'

// ============================================================================
// SCHEMA
// ============================================================================

const menuFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional().nullable(),
  image: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  is_global: z.boolean().default(true),
})

type MenuFormValues = z.infer<typeof menuFormSchema>

// ============================================================================
// PROPS
// ============================================================================

interface MenuFormSheetProps {
  open: boolean
  onClose: () => void
  merchantId: string
  locationId: string | null
  mode: 'create' | 'edit'
  menu?: AdminMenu | null
  onSuccess: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function MenuFormSheet({
  open,
  onClose,
  merchantId,
  locationId,
  mode,
  menu,
  onSuccess,
}: MenuFormSheetProps) {
  const isEdit = mode === 'edit'
  const isLocationView = locationId && locationId !== 'all'
  const imageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: 'menus',
    fileNamePrefix: 'menu',
  })

  const form = useForm<MenuFormValues>({
    resolver: zodResolver(menuFormSchema),
    defaultValues: {
      name: '',
      description: '',
      image: '',
      is_active: true,
      is_global: true,
    },
  })

  const { isSubmitting } = form.formState

  // Reset form when menu changes or sheet opens
  useEffect(() => {
    if (open) {
      if (isEdit && menu) {
        form.reset({
          name: menu.name,
          description: menu.description || '',
          image: menu.image || '',
          is_active: menu.is_active,
          is_global: menu.is_global,
        })
        imageUpload.reset(menu.image || null)
      } else {
        form.reset({
          name: '',
          description: '',
          image: '',
          is_active: true,
          is_global: !isLocationView, // Default to location-specific if viewing a location
        })
        imageUpload.reset(null)
      }
    }
  }, [form, imageUpload.reset, isEdit, isLocationView, menu, open])

  const onSubmit = async (values: MenuFormValues) => {
    let uploadedAsset: { cdnUrl: string; storagePath: string } | undefined

    try {
      const resolvedImage = await imageUpload.resolveImageValue()
      uploadedAsset = resolvedImage.uploadedAsset

      if (isEdit && menu) {
        const result = await updateAdminMenu(merchantId, menu.id, {
          name: values.name,
          description: values.description || null,
          image: resolvedImage.value,
          is_active: values.is_active,
        })

        if (result.error) {
          if (uploadedAsset) {
            await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error)
          }
          toast.error('Failed to update menu', { description: result.error })
          return
        }

        toast.success('Menu updated successfully')
      } else {
        const result = await createAdminMenu(merchantId, {
          name: values.name,
          description: values.description || null,
          image: resolvedImage.value,
          is_active: values.is_active,
          location_id: values.is_global ? null : locationId,
        })

        if (result.error) {
          if (uploadedAsset) {
            await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error)
          }
          toast.error('Failed to create menu', { description: result.error })
          return
        }

        toast.success('Menu created successfully')
      }

      onSuccess()
      onClose()
    } catch (error) {
      if (uploadedAsset) {
        await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error)
      }
      toast.error('An unexpected error occurred')
      console.error(error)
    }
  }

  return (
    <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BottomSheetContent height="95">
        <BottomSheetHeader>
          <BottomSheetTitle>
            {isEdit ? 'Edit Menu' : 'Create Menu'}
          </BottomSheetTitle>
          <BottomSheetDescription>
            {isEdit
              ? 'Update the menu details below.'
              : 'Create a new menu to organize your categories and items.'}
          </BottomSheetDescription>
        </BottomSheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col">
            <BottomSheetBody className="space-y-6">
              {/* Basic Info Section */}
              <BottomSheetSection title="Basic Information">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Menu Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Lunch Menu, Dinner Specials"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief description of this menu..."
                          rows={3}
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional description shown to staff
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="image"
                  render={() => (
                    <FormItem>
                      <FormLabel>Menu Image</FormLabel>
                      <FormControl>
                        <CdnImageUploadField
                          disabled={isSubmitting}
                          helperText="Uploads to Bunny CDN when you save the menu."
                          onClear={imageUpload.clear}
                          onFileSelect={imageUpload.selectFile}
                          previewUrl={imageUpload.previewUrl}
                          selectedFileName={imageUpload.selectedFileName}
                          uploadLabel="Upload menu image"
                          uploading={imageUpload.isUploading}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional image for this menu
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </BottomSheetSection>

              {/* Settings Section */}
              <BottomSheetSection title="Settings">
                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>
                          Menu is visible and usable in POS
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Scope - only show on create and when in location view */}
                {!isEdit && isLocationView && (
                  <FormField
                    control={form.control}
                    name="is_global"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base flex items-center gap-2">
                            {field.value ? (
                              <>
                                <Globe className="h-4 w-4" />
                                Global Menu
                              </>
                            ) : (
                              <>
                                <MapPin className="h-4 w-4" />
                                Location Menu
                              </>
                            )}
                          </FormLabel>
                          <FormDescription>
                            {field.value
                              ? 'Available across all locations'
                              : 'Only available at the selected location'}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                {/* Show current scope badge in edit mode */}
                {isEdit && menu && (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">Scope</p>
                        <p className="text-sm text-muted-foreground">
                          {menu.is_global
                            ? 'This menu is available across all locations'
                            : `This menu is specific to ${menu.location_name || 'a location'}`}
                        </p>
                      </div>
                      <Badge variant="outline" className={menu.is_global ? 'bg-slate-50' : 'bg-blue-50 text-blue-700'}>
                        {menu.is_global ? (
                          <>
                            <Globe className="h-3 w-3 mr-1" />
                            Global
                          </>
                        ) : (
                          <>
                            <MapPin className="h-3 w-3 mr-1" />
                            Location
                          </>
                        )}
                      </Badge>
                    </div>
                  </div>
                )}
              </BottomSheetSection>
            </BottomSheetBody>

            <BottomSheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEdit ? 'Save Changes' : 'Create Menu'}
              </Button>
            </BottomSheetFooter>
          </form>
        </Form>
      </BottomSheetContent>
    </BottomSheet>
  )
}
