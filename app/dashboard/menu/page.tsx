'use client'

import {
  PageShell,
  PageHeader,
  Panel,
  PanelSection,
  StatRow,
  StatTile,
  LocationIndicator
} from '@/components/dashboard/shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { useMenus } from "../hooks/useMenus";
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
  FormMessage
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
import { AddCategoryToMenu } from '../actions/categories'
import {
  MenuListView,
  MenuWithLocation
} from '@/components/dashboard/menu/MenuListView'
import { useLocationStore, useSelectedLocation, useIsSingleLocation, useGatedLocationId } from '@/stores/location-store'
import { useLocationOnlineMenu, useSetPrimaryOnlineMenu } from '@/app/dashboard/online-ordering/hooks/useOrderOutStatus'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useLocations } from '../hooks/useLocations'
import { useMerchantCdnImageUpload } from '@/lib/cdn/use-merchant-cdn-image-upload'
import { useState } from 'react'
import { SetLocationMenuChannelVisibility } from '../actions/location-menus'
import type { MenuChannelVisibility } from '@/lib/menu/menu-channel-visibility'
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
  const selectedLocationId = selectedLocation?.id || null
  const isAllLocations = selectedLocationId === 'all' || !selectedLocationId
  const isSingleLocation = useIsSingleLocation()
  const gatedLocationId = useGatedLocationId()
  const menuLocationId = gatedLocationId ?? selectedLocationId
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
  } = useMenus(clerkOrgId || '', menuLocationId)

  // OrderOut canonical online-ordering menu for the resolved location (single-loc
  // resolves to its one store; multi-loc on "All" -> null, so no badge shown).
  const { data: onlineMenu } = useLocationOnlineMenu(clerkOrgId || '', gatedLocationId)
  const setOnlineMenuMutation = useSetPrimaryOnlineMenu(clerkOrgId || '')
  const handleSetOnlineMenu = (menuId: string) => {
    if (!gatedLocationId) return
    setOnlineMenuMutation.mutate({ locationId: gatedLocationId, menuId })
  }

  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [reorderedMenus, setReorderedMenus] = useState<MenuWithLocation[]>([])
  const [hasOrderChanges, setHasOrderChanges] = useState(false)
  const [isSavingOrder, setIsSavingOrder] = useState(false)
  const [savingVisibilityMenuId, setSavingVisibilityMenuId] = useState<string | null>(null)

  const handleChannelVisibilityChange = async (
    menuId: string,
    visibility: MenuChannelVisibility
  ) => {
    if (!gatedLocationId) {
      toast.error('Select a location', {
        description: 'Platform visibility is configured separately for each location.'
      })
      return
    }

    setSavingVisibilityMenuId(menuId)
    try {
      const result = await SetLocationMenuChannelVisibility(
        gatedLocationId,
        menuId,
        visibility
      )
      if (result.error) {
        toast.error('Visibility update failed', { description: result.error })
        return
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['menus'] }),
        queryClient.invalidateQueries({ queryKey: ['location-online-menu'] }),
        queryClient.invalidateQueries({ queryKey: ['orderout'] }),
        queryClient.invalidateQueries({ queryKey: ['online-ordering'] })
      ])
      toast.success('Platform visibility updated')
    } finally {
      setSavingVisibilityMenuId(null)
    }
  }

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
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
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
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
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
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
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
    // Get Menu Info with all the categories
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
      return
    }

    // Copy all categories (and their items) to the new menu
    if (result.data && menu.categories?.length) {
      const newMenuId = result.data.id
      await Promise.all(
        menu.categories.map(cat =>
          AddCategoryToMenu(
            newMenuId,
            cat.category_id,
            merchantId,
            cat.display_order,
            undefined,
            targetLocationId
          )
        )
      )
    }

    toast.success('Menu Duplicated', {
      description: `"${menu.name}" has been duplicated successfully.`
    })
    queryClient.invalidateQueries({ queryKey: ['menus'] })
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
      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      await queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <Button className='h-9 gap-2 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm'>
              <Plus className='h-4 w-4' />
              Create Menu
            </Button>
          </DialogTrigger>
          <DialogContent
            overlayClassName='bg-slate-950/40 backdrop-blur-md'
            className='w-full max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-[28px] border bg-background p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-xl'
          >
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='flex max-h-[min(92vh,860px)] flex-col'
              >
                <DialogHeader className='bg-background px-6 py-5 pr-14 text-left sm:text-left'>
                  <DialogTitle className='text-[1.625rem] font-semibold tracking-tight'>
                    Create New Menu
                  </DialogTitle>
                  <DialogDescription className='max-w-[60ch] text-sm leading-6'>
                    Add a new menu to organize your items and categories
                  </DialogDescription>
                </DialogHeader>

                <div className='min-h-0 flex flex-1 flex-col overflow-hidden'>
                  <div className='min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4'>
                    {/* Menu Type Selection - Only show when viewing all locations.
                        Single-location accounts have one menu plane, so there is
                        nothing to choose; hide the Global/Location selector. */}
                    {isAllLocations && !isSingleLocation && (
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
                        'flex items-center gap-3 px-4 py-3 rounded-2xl border-0 text-sm',
                        isAllLocations && menuType === 'global'
                          ? 'bg-emerald-50 dark:bg-emerald-950/30'
                          : 'bg-blue-50 dark:bg-blue-950/30'
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
                        {isSingleLocation
                          ? 'This will be one of your menus.'
                          : isAllLocations && menuType === 'global'
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
                  </div>

                </div>

                <DialogFooter className='shrink-0 bg-background px-6 py-4 sm:justify-end'>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={handleDialogClose}
                  >
                    Cancel
                  </Button>
                  <Button type='submit' className='gap-2'>
                    {isSingleLocation ? (
                      <Plus className='h-4 w-4' />
                    ) : isAllLocations && menuType === 'global' ? (
                      <Globe className='h-4 w-4' />
                    ) : (
                      <MapPin className='h-4 w-4' />
                    )}
                    {isSingleLocation
                      ? 'Create Menu'
                      : `Create ${
                          isAllLocations && menuType === 'global'
                            ? 'Global'
                            : 'Location'
                        } Menu`}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Overview */}
      <Panel padded>
        <StatRow columns={isSingleLocation ? 2 : 4}>
          <StatTile
            label='Total Menus'
            value={menusList.length}
            meta='All menus'
            icon={<Utensils />}
            isLoading={isLoading}
          />
          <StatTile
            label='Active'
            value={activeMenus}
            meta='Currently active'
            icon={<Utensils />}
            isLoading={isLoading}
          />
          {/* Global vs Location-Specific split is meaningless for single-location
              accounts (all menus are simply "your menus") — hide both tiles. */}
          {!isSingleLocation && (
            <>
              <StatTile
                label='Global'
                value={globalMenus}
                meta='Merchant-wide menus'
                icon={<Utensils />}
                isLoading={isLoading}
              />
              <StatTile
                label='Location-Specific'
                value={locationMenus}
                meta='Location menus'
                icon={<Utensils />}
                isLoading={isLoading}
              />
            </>
          )}
        </StatRow>
      </Panel>

      {/* Menus List */}
      <Panel>
        <PanelSection
          label='All Menus'
          caption='View and manage all your menus'
          action={
            <div className='flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:justify-end'>
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
              {/* Filled borderless search (D-09). Classes literal, not
                  {FILLED_INPUT} — Tailwind does not scan tokens.ts (C7). */}
              <div className='relative min-w-0 flex-1 basis-32'>
                <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50' />
                <Input
                  placeholder='Search menus...'
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className='h-9 w-full pl-9 text-[0.8125rem] md:w-64'
                />
              </div>
              {/* View toggle: one pill rail, matching the tab rail. */}
              <div className='flex shrink-0 items-center gap-0.5 rounded-full bg-muted/70 p-1'>
                <Button
                  variant='ghost'
                  size='sm'
                  className={cn(
                    'h-7 rounded-full px-3 text-muted-foreground shadow-none hover:text-foreground',
                    viewMode === 'grid' &&
                      'bg-background text-foreground shadow-sm ring-1 ring-border'
                  )}
                  onClick={() => setViewMode('grid')}
                >
                  <Grid3x3 className='h-4 w-4' />
                </Button>
                <Button
                  variant='ghost'
                  size='sm'
                  className={cn(
                    'h-7 rounded-full px-3 text-muted-foreground shadow-none hover:text-foreground',
                    viewMode === 'list' &&
                      'bg-background text-foreground shadow-sm ring-1 ring-border'
                  )}
                  onClick={() => setViewMode('list')}
                >
                  <List className='h-4 w-4' />
                </Button>
              </div>
            </div>
          }
        >
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
            hasOrderChanges={hasOrderChanges}
            onReorder={handleReorder}
            isFiltered={searchTerm.length > 0}
            onlineMenuId={onlineMenu?.primaryMenuId ?? null}
            linkedMenuIds={onlineMenu?.linkedMenuIds ?? []}
            onSetOnlineMenu={handleSetOnlineMenu}
            onChannelVisibilityChange={handleChannelVisibilityChange}
            channelVisibilityDisabled={!gatedLocationId}
            savingVisibilityMenuId={savingVisibilityMenuId}
            showLocations={isAllLocations && !isSingleLocation}
          />
          {filteredMenus.length > 0 && (
            <div className='flex items-center gap-2 mt-4 text-sm text-muted-foreground'>
              <Info className='h-4 w-4' />
              <span>
                This order determines how menus appear on the POS system
              </span>
            </div>
          )}
        </PanelSection>
      </Panel>
    </div>
  )
}
