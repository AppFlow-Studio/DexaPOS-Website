'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
    Building2,
    MapPin,
    FileText,
    CreditCard,
    Briefcase,
    Hash,
    Calendar,
    Store,
    Edit
} from 'lucide-react'
import { MerchantDetails } from '@/types/merchant'
import { useQuery } from '@tanstack/react-query'
import { GetLocations } from '../../../../dashboard/actions/get-locations'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'

interface BusinessInfoTabProps {
    merchantInfo: MerchantDetails
}

// Business type options
const businessTypes = {
    'LLC': 'Limited Liability Company',
    'Corporation': 'Corporation',
    'Sole Proprietor': 'Sole Proprietor',
    'Partnership': 'Partnership'
}

export function BusinessInfoTab({ merchantInfo }: BusinessInfoTabProps) {
    // Use locations from merchantInfo directly (since we use MerchantDetails)
    const locationsList = merchantInfo.locations || []

    const locationsLoading = false

    // Get business info from public_metadata or use defaults
    const businessInfo = (merchantInfo?.public_metadata as any) || {}
    const legalBusinessName = businessInfo.legal_business_name || 'Not provided'
    const dbaName = businessInfo.dba_name || 'Not provided'
    const einTaxId = businessInfo.ein_tax_id || 'Not provided'
    const businessType = businessInfo.business_type || 'Not specified'
    const businessLicenseNumber = businessInfo.business_license_number || 'Not provided'

    const formatAddress = (loc: any) => {
        return [loc.address_line1, loc.city, loc.state].filter(Boolean).join(', ')
    }

    return (
        <Tabs defaultValue="legal" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="legal">Legal Information</TabsTrigger>
                <TabsTrigger value="locations">Locations</TabsTrigger>
            </TabsList>

            {/* Legal Information Tab */}
            <TabsContent value="legal" className="mt-6">
                <div className="space-y-6">
                    {/* Business Details Card */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Business Details</CardTitle>
                                    <CardDescription>Legal business information and registration details</CardDescription>
                                </div>
                                <Button variant="outline" size="sm">
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <Building2 className="h-4 w-4" />
                                        Legal Business Name
                                    </div>
                                    <div className="text-base font-medium">
                                        {legalBusinessName}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <Briefcase className="h-4 w-4" />
                                        DBA Name (Doing Business As)
                                    </div>
                                    <div className="text-base font-medium">
                                        {dbaName}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <Hash className="h-4 w-4" />
                                        EIN / Tax ID
                                    </div>
                                    <div className="text-base font-medium font-mono">
                                        {einTaxId}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <FileText className="h-4 w-4" />
                                        Business Type
                                    </div>
                                    <div>
                                        <Badge variant="outline" className="text-base px-3 py-1">
                                            {businessType}
                                        </Badge>
                                        {businessType !== 'Not specified' && businessTypes[businessType as keyof typeof businessTypes] && (
                                            <div className="text-sm text-muted-foreground mt-1">
                                                {businessTypes[businessType as keyof typeof businessTypes]}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <CreditCard className="h-4 w-4" />
                                        Business License Number
                                    </div>
                                    <div className="text-base font-medium font-mono">
                                        {businessLicenseNumber}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <Calendar className="h-4 w-4" />
                                        Registration Date
                                    </div>
                                    <div className="text-base font-medium">
                                        {merchantInfo?.created_at
                                            ? new Date(merchantInfo.created_at).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric'
                                            })
                                            : 'Not available'
                                        }
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Additional Information Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Additional Information</CardTitle>
                            <CardDescription>Additional business details and metadata</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                {/* <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground">Merchant ID</div>
                                    <div className="text-sm font-mono">{merchantInfo?.id || 'N/A'}</div>
                                </div> */}
                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground">Clerk Organization ID</div>
                                    <div className="text-sm font-mono">{merchantInfo?.clerk_org_id || 'N/A'}</div>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground">Status</div>
                                    <Badge variant={businessInfo.status === 'active' ? 'default' : 'secondary'}>
                                        {businessInfo.status || 'Unknown'}
                                    </Badge>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-muted-foreground">Business Type (Category)</div>
                                    <Badge variant="outline">
                                        {businessInfo.merchant_type || 'Not specified'}
                                    </Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            {/* Locations Tab */}
            <TabsContent value="locations" className="mt-6">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Business Locations</CardTitle>
                                <CardDescription>All locations associated with this merchant</CardDescription>
                            </div>
                            <Button variant="outline" size="sm">
                                <MapPin className="h-4 w-4 mr-2" />
                                Add Location
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {locationsLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <Skeleton key={i} className="h-16 w-full" />
                                ))}
                            </div>
                        ) : locationsList.length === 0 ? (
                            <Empty>
                                <EmptyHeader>
                                    <EmptyMedia variant="icon">
                                        <MapPin className="h-6 w-6" />
                                    </EmptyMedia>
                                    <EmptyTitle>No locations found</EmptyTitle>
                                    <EmptyDescription>
                                        This merchant doesn't have any locations yet. Add a location to get started.
                                    </EmptyDescription>
                                </EmptyHeader>
                                <EmptyContent>
                                    <Button>
                                        <MapPin className="h-4 w-4 mr-2" />
                                        Add Location
                                    </Button>
                                </EmptyContent>
                            </Empty>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Location Name</TableHead>
                                        <TableHead>Address</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {locationsList.map((location) => (
                                        <TableRow key={location.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                                        <Store className="h-5 w-5 text-primary" />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium">{location.name}</div>
                                                        <Badge variant={location.is_active ? "outline" : "secondary"} className="mt-1">
                                                            {location.is_active ? 'Active' : 'Inactive'}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <MapPin className="h-4 w-4" />
                                                    {formatAddress(location)}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {location.is_accepting_orders ? (
                                                     <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">Online</Badge>
                                                ) : (
                                                     <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">Offline</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm">
                                                    View Details
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {/* Location Statistics */}
                {locationsList.length > 0 && (
                    <div className="grid gap-4 md:grid-cols-3 mt-6">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Locations</CardTitle>
                                <Store className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{locationsList.length}</div>
                                <p className="text-xs text-muted-foreground">
                                    Registered locations
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Primary Location</CardTitle>
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm font-medium">{locationsList[0]?.name || 'N/A'}</div>
                                <p className="text-xs text-muted-foreground">
                                    {formatAddress(locationsList[0]) || 'No address'}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Active Locations</CardTitle>
                                <Store className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {locationsList.filter((l: any) => l.is_active).length}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Accepting orders
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </TabsContent>
        </Tabs>
    )
}
