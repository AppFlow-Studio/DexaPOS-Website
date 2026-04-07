'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CdnImageUploadField } from '@/components/ui/cdn-image-upload-field'
import {
  Utensils,
  Plus,
  Search,
  Grid3x3,
  List,
  Globe,
  MapPin,
  Info,
  Save
} from 'lucide-react'
import * as React from "react";
import { useState } from "react";
import { useMenus } from "../hooks/useMenus";
import { ScopeContextStrip } from "@/components/dashboard/menu/ScopeContextStrip";
import { useUserInfo } from "../../manage/hooks/useUserInfo.";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from '@/components/ui/form'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import {
  CreateMenu,
  ToggleMenuActive,
  DeleteMenu,
  GetMenuWithCategories,
  UpdateMenusOrder
} from '../actions/menus'
import {
  MenuListView,
  MenuWithLocation
} from '@/components/dashboard/menu/MenuListView'
import { useLocationStore, useSelectedLocation } from '@/stores/location-store'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useLocations } from '../hooks/useLocations'
import { useMerchantCdnImageUpload } from '@/lib/cdn/use-merchant-cdn-image-upload'
import { useState } from 'react'
const menuSchema = z.object({
  name: z
    .string()
    .min(2, 'Menu name must be at least 2 characters')
    .max(100, 'Menu name must be less than 100 characters'),
  description: z
    .string()
    .max(500, 'Description must be less than 500 characters')
    .optional(),
  image: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  menu_type: z.enum(['global', 'location']).default('global')
})

type MenuFormValues = z.infer<typeof menuSchema>

export default function MenuPage () {
  const { data: userInfo } = useUserInfo()
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
  const merchantId = userInfo?.members?.[0]?.organizations?.merchants?.id || ''
  const queryClient = useQueryClient()

  const selectedLocation = useSelectedLocation()
  console.log('selectedLocation', selectedLocation)
  const selectedLocationId = selectedLocation?.id || null
  const isAllLocations = selectedLocationId === 'all' || !selectedLocationId
  const imageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: 'menus',
    fileNamePrefix: 'menu'
  })

  const { data: locations } = useLocations(clerkOrgId || '', userInfo?.id || '')
  const currentLocation = locations?.find(l => l.id === selectedLocationId)

  const {
    data: menus,
    isLoading,
    refetch
  } = useMenus(clerkOrgId || '', selectedLocationId)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [reorderedMenus, setReorderedMenus] = useState<MenuWithLocation[]>([])
  const [hasOrderChanges, setHasOrderChanges] = useState(false)
  const [isSavingOrder, setIsSavingOrder] = useState(false)

  // Cast menus to include location info
  const menusList = (Array.isArray(menus) ? menus : []) as MenuWithLocation[]

  // Sort menus by display_order (ascending, nulls last)
  const sortedMenus = React.useMemo(() => {
    const sorted = [...menusList].sort((a, b) => {
      const aOrder = a.display_order ?? 999999
      const bOrder = b.display_order ?? 999999
      return aOrder - bOrder
    })
    return sorted
  }, [menusList])

  // Use reordered menus if there are unsaved changes, otherwise use sorted menus
  const displayMenus = hasOrderChanges ? reorderedMenus : sortedMenus

  const filteredMenus = displayMenus.filter(
    menu =>
      menu.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      menu.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const activeMenus = menusList.filter(m => m.is_active).length
  const inactiveMenus = menusList.filter(m => !m.is_active).length
  const globalMenus = menusList.filter(m => !m.location_id).length
  const locationMenus = menusList.filter(m => m.location_id).length

  const form = useForm<MenuFormValues>({
    resolver: zodResolver(menuSchema),
    defaultValues: {
      name: '',
      description: '',
      image: '',
      is_active: true,
      menu_type: isAllLocations ? 'global' : 'location'
    }
  })

  // Reset form when location changes
  React.useEffect(() => {
    form.reset({
      name: '',
      description: '',
      image: '',
      is_active: true,
      menu_type: isAllLocations ? 'global' : 'location'
    })
    imageUpload.reset(null)
  }, [form, imageUpload.reset, isAllLocations])

  const menuType = form.watch('menu_type')
  const watchedMenuValues = form.watch()

  const onSubmit = async (values: MenuFormValues) => {
    let uploadedAsset: { cdnUrl: string; storagePath: string } | undefined

    try {
      if (imageUpload.hasPendingChange && !merchantId) {
        toast.error('Merchant Not Found', {
          description: 'Please reload and try the upload again.'
        })
        return
      }

      const resolvedImage = await imageUpload.resolveImageValue()
      uploadedAsset = resolvedImage.uploadedAsset

      // Determine location_id based on menu type selection and location scope
      // When scoped to a location, always create location-specific menu
      const locationId =
        isAllLocations && values.menu_type === 'global'
          ? null
          : selectedLocationId === 'all'
          ? null
          : selectedLocationId

      const result = await CreateMenu(clerkOrgId || '', {
        name: values.name,
        description: values.description,
        image: resolvedImage.value ?? undefined,
        location_id: locationId,
        is_active: values.is_active,
        created_by: userInfo?.first_name + ' ' + userInfo?.last_name
      })

      if (result.error) {
        if (uploadedAsset) {
          await imageUpload
            .cleanupUploadedAsset(uploadedAsset.storagePath)
            .catch(console.error)
        }
        toast.error('Creation Failed', {
          description: result.error
        })
        return
      }

      const menuTypeLabel =
        isAllLocations && values.menu_type === 'global'
          ? 'global'
          : 'location-specific'
      toast.success('Menu Created', {
        description: `"${values.name}" has been created as a ${menuTypeLabel} menu.`
      })
      setIsCreateDialogOpen(false)
      form.reset()
      queryClient.invalidateQueries({ queryKey: ['menus'] })
      refetch()
    } catch (error) {
      if (uploadedAsset) {
        await imageUpload
          .cleanupUploadedAsset(uploadedAsset.storagePath)
          .catch(console.error)
      }
      toast.error('Creation Failed', {
        description: 'Unable to create the menu. Please try again.'
      })
    }
  }

  const handleToggleActive = async (menuId: string) => {
    try {
      const result = await ToggleMenuActive(
        menuId,
        selectedLocationId || undefined
      )
      if (result.error) {
        toast.error('Update Failed', {
          description: result.error
        })
        return
      }
      toast.success('Status Updated', {
        description: 'The menu status has been updated.'
      })
      queryClient.invalidateQueries({ queryKey: ['menus'] })
      refetch()
    } catch (error) {
      toast.error('Update Failed', {
        description: 'Unable to update the menu status. Please try again.'
      })
    }
  }

  const handleDelete = async (menuId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this menu? This action cannot be undone.'
      )
    ) {
      return
    }
    try {
      const result = await DeleteMenu(menuId, selectedLocationId || undefined)
      if (result.error) {
        toast.error('Delete Failed', {
          description: result.error
        })
        return
      }
      toast.success('Menu Deleted', {
        description: 'The menu has been permanently deleted.'
      })
      queryClient.invalidateQueries({ queryKey: ['menus'] })
      refetch()
    } catch (error) {
      toast.error('Delete Failed', {
        description: 'Unable to delete the menu. Please try again.'
      })
    }
  }

  const handleDialogClose = () => {
    setIsCreateDialogOpen(false)
    form.reset({
      name: '',
      description: '',
      image: '',
      is_active: true,
      menu_type: isAllLocations ? 'global' : 'location'
    })
    imageUpload.reset(null)
  }

  const handleDuplicate = async (
    menuId: string,
    targetLocationId: string | null
  ) => {
    // Get Menu Info with all the items and categories and modifiers and set settings
    const menu = await GetMenuWithCategories(menuId)
    if (!menu) {
      toast.error('Duplicate Failed', {
        description: 'Unable to duplicate the menu. Please try again.'
      })
      return
    }
    // Create a new menu with the same name and description and settings
    const result = await CreateMenu(clerkOrgId || '', {
      name: menu.name,
      description: menu.description || '',
      image: menu.image || undefined,
      location_id: targetLocationId,
      is_active: menu.is_active,
      created_by: userInfo?.first_name + ' ' + userInfo?.last_name
    })
    if (result.error) {
      toast.error('Duplicate Failed', {
        description: result.error
      })
    }
  }

  // Initialize reordered menus when menus load
  React.useEffect(() => {
    if (
      sortedMenus.length > 0 &&
      reorderedMenus.length === 0 &&
      !hasOrderChanges
    ) {
      setReorderedMenus(sortedMenus)
    }
  }, [sortedMenus, reorderedMenus.length, hasOrderChanges])

  // Reorder handlers
  const handleMoveMenuUp = (index: number) => {
    if (index === 0) return

    const newOrder = [...reorderedMenus]
    const temp = newOrder[index]
    newOrder[index] = newOrder[index - 1]
    newOrder[index - 1] = temp

    // Update display_order values
    newOrder.forEach((menu, idx) => {
      menu.display_order = idx + 1
    })

    setReorderedMenus(newOrder)
    setHasOrderChanges(true)
  }

  const handleMoveMenuDown = (index: number) => {
    if (index === reorderedMenus.length - 1) return

    const newOrder = [...reorderedMenus]
    const temp = newOrder[index]
    newOrder[index] = newOrder[index + 1]
    newOrder[index + 1] = temp

    // Update display_order values
    newOrder.forEach((menu, idx) => {
      menu.display_order = idx + 1
    })

    setReorderedMenus(newOrder)
    setHasOrderChanges(true)
  }

  const handleSaveOrder = async () => {
    setIsSavingOrder(true)
    try {
      const menuOrders = reorderedMenus.map((menu, index) => ({
        menuId: menu.id,
        displayOrder: index + 1
      }))

      const result = await UpdateMenusOrder(menuOrders, selectedLocationId)

      if (result.error) {
        toast.error('Save Failed', {
          description: result.error
        })
        return
      }

      toast.success('Order Saved', {
        description: 'Menu display order has been updated.'
      })

      await queryClient.invalidateQueries({ queryKey: ['menus'] })
      await refetch()
      setHasOrderChanges(false)
    } catch (error) {
      toast.error('Save Failed', {
        description: 'Unable to save menu order. Please try again.'
      })
    } finally {
      setIsSavingOrder(false)
    }
  }

  const handleReorder = (newMenus: MenuWithLocation[]) => {
    const updatedMenus = newMenus.map((menu, index) => ({
      ...menu,
      display_order: index + 1
    }))
    setReorderedMenus(updatedMenus)
    setHasOrderChanges(true)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ScopeContextStrip />
      <div className="flex items-center justify-between">
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Menus</h2>
          <p className='text-muted-foreground'>
            Manage your menus, categories, and items
          </p>
        </div>
        <Dialog
          open={isCreateDialogOpen}
          onOpenChange={open => {
            setIsCreateDialogOpen(open)
            if (!open) {
              form.reset({
                name: '',
                description: '',
                image: '',
                is_active: true,
                menu_type: isAllLocations ? 'global' : 'location'
              })
              imageUpload.reset(null)
            } else {
              // When opening, ensure menu_type matches location scope
              form.setValue('menu_type', isAllLocations ? 'global' : 'location')
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className='gap-2'>
              <Plus className='h-4 w-4' />
              Create Menu
            </Button>
          </DialogTrigger>
          <DialogContent
            overlayClassName='bg-slate-950/40 backdrop-blur-md'
            className='w-full max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-background/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-4xl'
          >
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='flex max-h-[min(92vh,860px)] flex-col'
              >
                <DialogHeader className='border-b border-border/70 bg-background/95 px-6 py-5 pr-14 text-left sm:text-left'>
                  <DialogTitle className='text-[1.625rem] font-semibold tracking-tight'>
                    Create New Menu
                  </DialogTitle>
                  <DialogDescription className='max-w-[60ch] text-sm leading-6'>
                    Add a new menu to organize your items and categories
                  </DialogDescription>
                </DialogHeader>

                <div className='min-h-0 flex flex-1 flex-col overflow-hidden lg:flex-row'>
                  <div className='min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4'>
                    {/* Menu Type Selection - Only show when viewing all locations */}
                    {isAllLocations && (
                      <FormField
                        control={form.control}
                        name='menu_type'
                        render={({ field }: { field: any }) => (
                          <FormItem className='space-y-3'>
                            <FormLabel>Menu Type</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className='grid grid-cols-1 gap-4'
                              >
                                <div>
                                  <RadioGroupItem
                                    value='global'
                                    id='global'
                                    className='peer sr-only'
                                  />
                                  <Label
                                    htmlFor='global'
                                    className={cn(
                                      'flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer transition-all',
                                      'peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary'
                                    )}
                                  >
                                    <Globe className='h-6 w-6 mb-2 text-emerald-500' />
                                    <span className='font-semibold'>
                                      Global Menu
                                    </span>
                                    <span className='text-xs text-muted-foreground text-center mt-1'>
                                      Available at all locations
                                    </span>
                                  </Label>
                                </div>
                                {/* <div>
                                                            <RadioGroupItem
                                                                value="location"
                                                                id="location"
                                                                className="peer sr-only"
                                                                disabled={isAllLocations}
                                                            />
                                                            <Label
                                                                htmlFor="location"
                                                                className={cn(
                                                                    "flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer transition-all",
                                                                    "peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary",
                                                                    isAllLocations && "opacity-50 cursor-not-allowed hover:bg-popover"
                                                                )}
                                                            >
                                                                <MapPin className="h-6 w-6 mb-2 text-blue-500" />
                                                                <span className="font-semibold">Location Menu</span>
                                                                <span className="text-xs text-muted-foreground text-center mt-1">
                                                                    {isAllLocations
                                                                        ? 'Select a location first'
                                                                        : `For ${currentLocation?.name || 'this location'} only`
                                                                    }
                                                                </span>
                                                            </Label>
                                                        </div> */}
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Context Banner */}
                    <div
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-lg border text-sm',
                        isAllLocations && menuType === 'global'
                          ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800'
                          : 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800'
                      )}
                    >
                      <Info
                        className={cn(
                          'h-4 w-4',
                          isAllLocations && menuType === 'global'
                            ? 'text-emerald-600'
                            : 'text-blue-600'
                        )}
                      />
                      <span className='text-muted-foreground'>
                        {isAllLocations && menuType === 'global'
                          ? 'This menu will be available at all locations. Locations can customize pricing and availability.'
                          : `This menu will only be available at ${
                              currentLocation?.name || 'the selected location'
                            }. You have full control over this menu.`}
                      </span>
                    </div>

                    <FormField
                      control={form.control}
                      name='name'
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Menu Name</FormLabel>
                          <FormControl>
                            <Input placeholder='Lunch Menu' {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name='description'
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input
                              placeholder='Our delicious lunch offerings'
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name='image'
                      render={() => (
                        <FormItem>
                          <FormLabel>Menu Image</FormLabel>
                          <FormControl>
                            <CdnImageUploadField
                              disabled={form.formState.isSubmitting}
                              helperText='Uploads to Bunny CDN when you create the menu.'
                              onClear={imageUpload.clear}
                              onFileSelect={imageUpload.selectFile}
                              previewUrl={imageUpload.previewUrl}
                              selectedFileName={imageUpload.selectedFileName}
                              uploadLabel='Upload menu image'
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
                  </div>

                  <div className='hidden min-h-0 w-[340px] shrink-0 overflow-y-auto border-l border-border/70 bg-muted/10 px-6 py-5 lg:block'>
                    <div className='space-y-6 pb-4'>
                      <div className='text-sm font-medium text-muted-foreground'>
                        Menu Preview
                      </div>

                      <div className='overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm'>
                        <div className='aspect-[4/3] bg-muted/40'>
                          {imageUpload.previewUrl ? (
                            <img
                              src={imageUpload.previewUrl}
                              alt='Menu preview'
                              className='h-full w-full object-cover'
                            />
                          ) : (
                            <div className='flex h-full items-center justify-center'>
                              <Utensils className='h-12 w-12 text-muted-foreground/30' />
                            </div>
                          )}
                        </div>
                        <div className='space-y-3 p-4'>
                          <div>
                            <h3 className='text-lg font-semibold'>
                              {watchedMenuValues.name || 'Menu Name'}
                            </h3>
                            <p className='mt-1 text-sm text-muted-foreground'>
                              {watchedMenuValues.description ||
                                'Add a short description for this menu.'}
                            </p>
                          </div>
                          <div className='flex flex-wrap gap-2'>
                            <Badge variant='outline'>
                              {isAllLocations &&
                              watchedMenuValues.menu_type === 'global' ? (
                                <>
                                  <Globe className='mr-1 h-3 w-3' />
                                  Global
                                </>
                              ) : (
                                <>
                                  <MapPin className='mr-1 h-3 w-3' />
                                  Location
                                </>
                              )}
                            </Badge>
                            <Badge
                              variant={
                                watchedMenuValues.is_active
                                  ? 'default'
                                  : 'secondary'
                              }
                            >
                              {watchedMenuValues.is_active
                                ? 'Active'
                                : 'Inactive'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter className='shrink-0 border-t border-border/70 bg-background/95 px-6 py-4 sm:justify-end'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={handleDialogClose}
                  >
                    Cancel
                  </Button>
                  <Button type='submit' className='gap-2'>
                    {isAllLocations && menuType === 'global' ? (
                      <Globe className='h-4 w-4' />
                    ) : (
                      <MapPin className='h-4 w-4' />
                    )}
                    Create{' '}
                    {isAllLocations && menuType === 'global'
                      ? 'Global'
                      : 'Location'}{' '}
                    Menu
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Overview */}
      <div className='grid gap-4 md:grid-cols-4'>
        <Card className='transition-all hover:shadow-md'>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Menus</CardTitle>
            <Utensils className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{menusList.length}</div>
            <p className='text-xs text-muted-foreground'>All menus</p>
          </CardContent>
        </Card>
        <Card className='transition-all hover:shadow-md'>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Active</CardTitle>
            <Utensils className='h-4 w-4 text-green-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>
              {activeMenus}
            </div>
            <p className='text-xs text-muted-foreground'>Currently active</p>
          </CardContent>
        </Card>
        <Card className='transition-all hover:shadow-md'>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Global</CardTitle>
            <Utensils className='h-4 w-4 text-emerald-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-emerald-600'>
              {globalMenus}
            </div>
            <p className='text-xs text-muted-foreground'>Merchant-wide menus</p>
          </CardContent>
        </Card>
        <Card className='transition-all hover:shadow-md'>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>
              Location-Specific
            </CardTitle>
            <Utensils className='h-4 w-4 text-blue-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-blue-600'>
              {locationMenus}
            </div>
            <p className='text-xs text-muted-foreground'>Location menus</p>
          </CardContent>
        </Card>
      </div>

      {/* Menus List */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle>All Menus</CardTitle>
              <CardDescription>View and manage all your menus</CardDescription>
            </div>
            <div className='flex items-center gap-2'>
              {hasOrderChanges && (
                <Button
                  variant='default'
                  size='sm'
                  onClick={handleSaveOrder}
                  disabled={isSavingOrder}
                  className='gap-2'
                >
                  <Save className='h-4 w-4' />
                  {isSavingOrder ? 'Saving...' : 'Save Order'}
                </Button>
              )}
              <div className='relative'>
                <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='Search menus...'
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className='pl-8 w-64'
                />
              </div>
              <div className='flex items-center border rounded-md'>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size='sm'
                  className='rounded-r-none'
                  onClick={() => setViewMode('grid')}
                >
                  <Grid3x3 className='h-4 w-4' />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size='sm'
                  className='rounded-l-none'
                  onClick={() => setViewMode('list')}
                >
                  <List className='h-4 w-4' />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <MenuListView
            menus={filteredMenus}
            isLoading={isLoading}
            viewMode={viewMode}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onCreateNew={() => setIsCreateDialogOpen(true)}
            emptyStateTitle={
              menusList.length === 0 ? 'No menus yet' : 'No menus found'
            }
            emptyStateDescription={
              menusList.length === 0
                ? 'Get started by creating your first menu'
                : 'Try adjusting your search terms'
            }
            onMoveUp={handleMoveMenuUp}
            onMoveDown={handleMoveMenuDown}
            hasOrderChanges={hasOrderChanges}
            onReorder={handleReorder}
            isFiltered={searchTerm.length > 0}
          />
          {filteredMenus.length > 0 && (
            <div className='flex items-center gap-2 mt-4 text-sm text-muted-foreground'>
              <Info className='h-4 w-4' />
              <span>
                This order determines how menus appear on the POS system
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
