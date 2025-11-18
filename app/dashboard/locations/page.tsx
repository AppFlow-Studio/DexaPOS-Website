'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MapPin, Plus, Building2, Edit, Trash2, Search } from 'lucide-react'
import { useState } from 'react'
import { useLocations } from '../hooks/useLocations'
import { useUserInfo } from '../../manage/hooks/useUserInfo.'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { toast } from 'sonner'
import { Empty } from '@/components/ui/empty'

const locationSchema = z.object({
    name: z.string().min(2, "Location name must be at least 2 characters").max(100, "Location name must be less than 100 characters"),
    address: z.string().min(5, "Address must be at least 5 characters").max(200, "Address must be less than 200 characters"),
})

type LocationFormValues = z.infer<typeof locationSchema>

export default function LocationsPage() {
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const { data: locations, isLoading, refetch } = useLocations(clerkOrgId || '')
    const [searchTerm, setSearchTerm] = useState('')
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [editingLocation, setEditingLocation] = useState<any>(null)

    const locationsList = Array.isArray(locations) ? locations : []
    const filteredLocations = locationsList.filter(location =>
        location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        location.address.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const form = useForm<LocationFormValues>({
        resolver: zodResolver(locationSchema),
        defaultValues: {
            name: '',
            address: '',
        },
    })

    const onSubmit = async (values: LocationFormValues) => {
        try {
            // TODO: Implement create/update location API call
            console.log('Location data:', values)
            toast.success(editingLocation ? 'Location updated successfully' : 'Location created successfully')
            setIsCreateDialogOpen(false)
            setEditingLocation(null)
            form.reset()
            refetch()
        } catch (error) {
            toast.error('Failed to save location. Please try again.')
        }
    }

    const handleEdit = (location: any) => {
        setEditingLocation(location)
        form.reset({
            name: location.name,
            address: location.address,
        })
        setIsCreateDialogOpen(true)
    }

    const handleDelete = async (locationId: string) => {
        if (!confirm('Are you sure you want to delete this location? This action cannot be undone.')) {
            return
        }
        try {
            // TODO: Implement delete location API call
            console.log('Delete location:', locationId)
            toast.success('Location deleted successfully')
            refetch()
        } catch (error) {
            toast.error('Failed to delete location. Please try again.')
        }
    }

    const handleDialogClose = () => {
        setIsCreateDialogOpen(false)
        setEditingLocation(null)
        form.reset()
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Locations</h2>
                    <p className="text-muted-foreground">
                        Manage all your business locations and franchises
                    </p>
                </div>
                <Dialog open={isCreateDialogOpen} onOpenChange={handleDialogClose}>
                    <DialogTrigger asChild>
                        <Button onClick={() => {
                            setEditingLocation(null)
                            form.reset()
                        }}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Location
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingLocation ? 'Edit Location' : 'Add New Location'}</DialogTitle>
                            <DialogDescription>
                                {editingLocation ? 'Update location information' : 'Add a new business location to your merchant account'}
                            </DialogDescription>
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Location Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Downtown Branch" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="address"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Address</FormLabel>
                                            <FormControl>
                                                <Input placeholder="123 Main St, City, State 12345" {...field} />
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
                                        {editingLocation ? 'Update Location' : 'Create Location'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{locationsList.length}</div>
                        <p className="text-xs text-muted-foreground">
                            Active locations
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">This Month</CardTitle>
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0</div>
                        <p className="text-xs text-muted-foreground">
                            New locations added
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active</CardTitle>
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{locationsList.length}</div>
                        <p className="text-xs text-muted-foreground">
                            Currently active
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Locations Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>All Locations</CardTitle>
                            <CardDescription>View and manage all your business locations</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search locations..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 w-64"
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : filteredLocations.length === 0 ? (
                        <Empty
                            icon={MapPin}
                            title={locationsList.length === 0 ? "No locations yet" : "No locations found"}
                            description={
                                locationsList.length === 0
                                    ? "Get started by adding your first business location"
                                    : "Try adjusting your search terms"
                            }
                            action={
                                locationsList.length === 0 ? (
                                    <Button onClick={() => setIsCreateDialogOpen(true)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Location
                                    </Button>
                                ) : null
                            }
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Location Name</TableHead>
                                    <TableHead>Address</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredLocations.map((location) => (
                                    <TableRow key={location.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                                    <MapPin className="h-5 w-5 text-primary" />
                                                </div>
                                                <div>
                                                    <div className="font-medium">{location.name}</div>
                                                    <Badge variant="outline" className="mt-1">Active</Badge>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm text-muted-foreground">{location.address}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm text-muted-foreground">
                                                {new Date(location.created_at).toLocaleDateString()}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleEdit(location)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(location.id)}
                                                >
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
