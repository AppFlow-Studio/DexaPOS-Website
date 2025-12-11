'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Utensils, Plus, Search, Grid3x3, List } from 'lucide-react'
import { useState } from 'react'
import { useMenus } from '../hooks/useMenus'
import { useUserInfo } from '../../manage/hooks/useUserInfo.'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { CreateMenu, ToggleMenuActive, DeleteMenu } from '../actions/menus'
import { MenuListView, MenuWithLocation } from '@/components/dashboard/menu/MenuListView'
import { useLocationStore } from '@/stores/location-store'

const menuSchema = z.object({
    name: z.string().min(2, "Menu name must be at least 2 characters").max(100, "Menu name must be less than 100 characters"),
    description: z.string().max(500, "Description must be less than 500 characters").optional(),
    is_active: z.boolean().default(true),
})

type MenuFormValues = z.infer<typeof menuSchema>

export default function MenuPage() {
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const queryClient = useQueryClient()

    // Get selected location from localStorage - null means get all menus
    // const [selectedLocationId] = useState<string | null>(() => {
    //     if (typeof window !== 'undefined') {
    //         const stored = localStorage.getItem('selectedLocationId')
    //         return stored === 'all' ? null : stored
    //     }
    //     return null
    // })
    const { selectedLocationId } = useLocationStore()

    const { data: menus, isLoading, refetch } = useMenus(clerkOrgId || '', selectedLocationId)
    const [searchTerm, setSearchTerm] = useState('')
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

    // Cast menus to include location info
    const menusList = (Array.isArray(menus) ? menus : []) as MenuWithLocation[]
    const filteredMenus = menusList.filter(menu =>
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
            is_active: true,
        },
    })

    const onSubmit = async (values: MenuFormValues) => {
        try {
            const result = await CreateMenu(clerkOrgId || '', {
                name: values.name,
                description: values.description,
                location_id: selectedLocationId,
                is_active: values.is_active,
                created_by: userInfo?.first_name + ' ' + userInfo?.last_name,
            })

            if (result.error) {
                toast.error('Creation Failed', {
                    description: result.error
                })
                return
            }

            toast.success('Menu Created', {
                description: `"${values.name}" has been created and is ready to use.`
            })
            setIsCreateDialogOpen(false)
            form.reset()
            queryClient.invalidateQueries({ queryKey: ['menus'] })
            refetch()
        } catch (error) {
            toast.error('Creation Failed', {
                description: 'Unable to create the menu. Please try again.'
            })
        }
    }

    const handleToggleActive = async (menuId: string) => {
        try {
            const result = await ToggleMenuActive(menuId)
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
        if (!confirm('Are you sure you want to delete this menu? This action cannot be undone.')) {
            return
        }
        try {
            const result = await DeleteMenu(menuId)
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
        form.reset()
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Menus</h2>
                    <p className="text-muted-foreground">
                        Manage your menus, categories, and items
                    </p>
                </div>
                <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
                    setIsCreateDialogOpen(open)
                    if (!open) {
                        form.reset()
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" />
                            Create Menu
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Create New Menu</DialogTitle>
                            <DialogDescription>
                                Add a new menu to organize your items and categories
                            </DialogDescription>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                                                <Input placeholder="Our delicious lunch offerings" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <DialogFooter>
                                    <Button type="button" variant="outline" onClick={handleDialogClose}>
                                        Cancel
                                    </Button>
                                    <Button type="submit">
                                        Create Menu
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Menus</CardTitle>
                        <Utensils className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{menusList.length}</div>
                        <p className="text-xs text-muted-foreground">
                            All menus
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active</CardTitle>
                        <Utensils className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{activeMenus}</div>
                        <p className="text-xs text-muted-foreground">
                            Currently active
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Global</CardTitle>
                        <Utensils className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600">{globalMenus}</div>
                        <p className="text-xs text-muted-foreground">
                            Merchant-wide menus
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Location-Specific</CardTitle>
                        <Utensils className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{locationMenus}</div>
                        <p className="text-xs text-muted-foreground">
                            Location menus
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Menus List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>All Menus</CardTitle>
                            <CardDescription>View and manage all your menus</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search menus..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 w-64"
                                />
                            </div>
                            <div className="flex items-center border rounded-md">
                                <Button
                                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="rounded-r-none"
                                    onClick={() => setViewMode('grid')}
                                >
                                    <Grid3x3 className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="rounded-l-none"
                                    onClick={() => setViewMode('list')}
                                >
                                    <List className="h-4 w-4" />
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
                        onCreateNew={() => setIsCreateDialogOpen(true)}
                        emptyStateTitle={menusList.length === 0 ? "No menus yet" : "No menus found"}
                        emptyStateDescription={
                            menusList.length === 0
                                ? "Get started by creating your first menu"
                                : "Try adjusting your search terms"
                        }
                    />
                </CardContent>
            </Card>
        </div>
    )
}
