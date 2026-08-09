'use client'

import { useEffect } from 'react'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Globe, MapPin, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useMerchantCdnImageUpload } from '@/lib/cdn/use-merchant-cdn-image-upload'
import { cn } from '@/lib/utils'

import {
  createAdminMenu,
  updateAdminMenu,
  type AdminMenu,
} from '@/app/manage/actions/admin-merchant/menus'

const menuFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional().nullable(),
  image: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  is_global: z.boolean().default(true),
})

type MenuFormValues = z.infer<typeof menuFormSchema>

interface MenuFormSheetProps {
  open: boolean
  onClose: () => void
  merchantId: string
  locationId: string | null
  mode: 'create' | 'edit'
  menu?: AdminMenu | null
  onSuccess: () => void
}

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

  useEffect(() => {
    if (!open) return

    if (isEdit && menu) {
      form.reset({
        name: menu.name,
        description: menu.description || '',
        image: menu.image || '',
        is_active: menu.is_active,
        is_global: menu.is_global,
      })
      imageUpload.reset(menu.image || null)
      return
    }

    form.reset({
      name: '',
      description: '',
      image: '',
      is_active: true,
      is_global: !isLocationView,
    })
    imageUpload.reset(null)
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
          location_id: isLocationView ? locationId : null,
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

  const isGlobalContext = isEdit ? !!menu?.is_global : !isLocationView

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        overlayClassName="bg-slate-950/40 backdrop-blur-md"
        className="w-full max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-background/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-xl"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-h-[min(90vh,860px)] flex-col">
            <DialogHeader className="gap-2 border-b border-border/70 bg-background/95 px-6 py-5 pr-14 text-left sm:text-left">
              <DialogTitle className="text-[1.625rem] font-semibold tracking-tight">
                {isEdit ? 'Edit Menu' : 'Create New Menu'}
              </DialogTitle>
              <DialogDescription className="max-w-[52ch] text-sm leading-6">
                {isEdit
                  ? 'Update the menu details below.'
                  : 'Add a new menu to organize your items and categories.'}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm',
                    isGlobalContext
                      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
                      : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950',
                  )}
                >
                  <Info
                    className={cn(
                      'h-4 w-4',
                      isGlobalContext ? 'text-emerald-600' : 'text-blue-600',
                    )}
                  />
                  <span className="text-muted-foreground">
                    {isGlobalContext
                      ? 'This menu will be available at all locations. Locations can customize pricing and availability.'
                      : `This menu will only be available at ${menu?.location_name || 'the selected location'}. You have full control over this menu.`}
                  </span>
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Menu Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Lunch Menu" {...field} />
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
                        <Input
                          placeholder="Our delicious lunch offerings"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>
                          Menus marked inactive stay hidden from POS.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Button
                          type="button"
                          variant={field.value ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => field.onChange(!field.value)}
                        >
                          {field.value ? 'Active' : 'Inactive'}
                        </Button>
                      </FormControl>
                    </FormItem>
                  )}
                />

                {isEdit && menu && (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
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
                            <Globe className="mr-1 h-3 w-3" />
                            Global
                          </>
                        ) : (
                          <>
                            <MapPin className="mr-1 h-3 w-3" />
                            Location
                          </>
                        )}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-border/70 bg-background/95 px-6 py-4 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save Changes' : 'Create Menu'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
