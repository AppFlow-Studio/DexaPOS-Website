'use client'

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Monitor,
    Smartphone,
    Printer,
    Edit,
    Calendar,
    MapPin,
    Building2,
    User,
    CheckCircle2,
    AlertCircle,
    Upload,
    FileText,
    ChevronDown,
    Download
} from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useState } from 'react'

// Mock device data - in real app, this would come from an API
const getDeviceData = (deviceId: string) => {
    // This would be fetched from an API based on deviceId
    return {
        id: deviceId,
        name: 'MacBook Pro M2 13inch - 34511',
        fullName: 'MacBook Pro M2 13inch 2022',
        category: 'Laptop & Computer Device',
        purchaseDate: 'Jan 13, 2022',
        status: 'Assigned',
        assignedTo: 'Cameron Williamson',
        manufacturer: 'Apple Inc.',
        location: 'New York City, USA',
        assetNumber: '34511',
        condition: 'Perfect',
        manufactureDate: 'January 01, 2018',
        expiryDate: 'Dec 01, 2023',
        tillExpire: '8 Months 03 days',
        supportStatus: 'Compliant',
        antivirus: {
            name: 'kaspersky internet security',
            status: 'Installed'
        },
        mdm: {
            name: 'AppTec360',
            status: 'Integrated'
        },
        saml: {
            name: 'AppTec360',
            status: 'Verified'
        },
        osVersion: {
            version: '2fr3wt78760r',
            status: 'Updated to latest version'
        },
        documents: [
            {
                id: '1',
                name: '#13vjds74Gytn799',
                fileType: 'PDF',
                fileSize: '12.8MB'
            },
            {
                id: '2',
                name: 'Address',
                fileType: 'Doc',
                fileSize: '17MB'
            },
            {
                id: '3',
                name: 'Document 3',
                fileType: 'PDF',
                fileSize: '231.5KB'
            }
        ],
        type: 'terminal' as const,
        image: null // Would be device image URL
    }
}

const getDeviceIcon = (type: string) => {
    switch (type) {
        case 'terminal':
            return Monitor
        case 'handheld':
            return Smartphone
        case 'printer':
            return Printer
        default:
            return Monitor
    }
}

export default function DeviceInfoPage() {
    const params = useParams()
    const router = useRouter()
    const deviceId = params.device_id as string
    const merchantId = params.merchantId as string
    const device = getDeviceData(deviceId)
    const [showAllDocuments, setShowAllDocuments] = useState(false)

    const DeviceIcon = getDeviceIcon(device.type)
    const displayedDocuments = showAllDocuments ? device.documents : device.documents.slice(0, 2)

    return (
        <div className="space-y-6">
            {/* Breadcrumbs */}
            <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Link href={`/manage/merchants/${merchantId}`} className="hover:underline">Merchants</Link>
                <span className="mx-2">/</span>
                <Link href={`/manage/merchants/${merchantId}`} className="hover:underline">Merchant Device Details</Link>
                <span className="mx-2">/</span>
                <div className="text-foreground">{device.assetNumber}</div>
            </div>

            {/* Device Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                                {device.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={device.image} alt={device.name} className="h-full w-full object-cover" />
                                ) : (
                                    <DeviceIcon className="h-8 w-8 text-muted-foreground" />
                                )}
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-semibold">{device.name}</CardTitle>
                                <CardDescription className="text-base mt-1">{device.category}</CardDescription>
                            </div>
                        </div>
                        <Button variant="outline">
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            {/* Device Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Device Details</CardTitle>
                    <CardDescription>Core information about this device</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">Name</div>
                            <div className="text-sm font-medium truncate" title={device.fullName}>
                                {device.fullName}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">Category</div>
                            <div className="text-sm">{device.category}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Purchase Date
                            </div>
                            <div className="text-sm">{device.purchaseDate}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">Status</div>
                            <Badge variant="outline" className="text-purple-600 border-purple-600">
                                {device.status}
                            </Badge>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                Assigned To
                            </div>
                            <Link href="#" className="text-sm text-blue-600 hover:underline">
                                {device.assignedTo}
                            </Link>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                Manufacturer
                            </div>
                            <div className="text-sm">{device.manufacturer}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                Location
                            </div>
                            <div className="text-sm">{device.location}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">Asset Number</div>
                            <div className="text-sm font-mono">{device.assetNumber}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">Condition</div>
                            <Badge variant="outline" className="text-green-600 border-green-600">
                                {device.condition}
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Manufacturer Support Lifecycle */}
            <Card>
                <CardHeader>
                    <CardTitle>Manufacturer Support Lifecycle</CardTitle>
                    <CardDescription>Device support and warranty information</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">Manufacture Date</div>
                            <div className="text-sm">{device.manufactureDate}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">Purchase Date</div>
                            <div className="text-sm">{device.purchaseDate}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">Expiry Date</div>
                            <div className="text-sm">{device.expiryDate}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">Till Expire</div>
                            <div className="text-sm font-medium">{device.tillExpire}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-muted-foreground">Status</div>
                            <Badge variant="outline" className="text-green-600 border-green-600">
                                {device.supportStatus}
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Security & OS Details */}
            <Card>
                <CardHeader>
                    <CardTitle>Security & OS Details</CardTitle>
                    <CardDescription>Security software and operating system information</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">Antivirus</div>
                            <div className="text-sm font-medium">{device.antivirus.name}</div>
                            <div className="flex items-center gap-1 text-sm text-green-600">
                                <CheckCircle2 className="h-3 w-3" />
                                {device.antivirus.status}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">MDM</div>
                            <div className="text-sm font-medium">{device.mdm.name}</div>
                            <div className="flex items-center gap-1 text-sm text-green-600">
                                <CheckCircle2 className="h-3 w-3" />
                                {device.mdm.status}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">SAML</div>
                            <div className="text-sm font-medium">{device.saml.name}</div>
                            <div className="flex items-center gap-1 text-sm text-green-600">
                                <CheckCircle2 className="h-3 w-3" />
                                {device.saml.status}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium text-muted-foreground">OS Version</div>
                            <div className="text-sm font-medium font-mono">{device.osVersion.version}</div>
                            <div className="text-sm text-muted-foreground">
                                {device.osVersion.status}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Documents Section */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Documents</CardTitle>
                            <CardDescription>Associated documents and files for this device</CardDescription>
                        </div>
                        <Button variant="outline" size="sm">
                            <Upload className="h-4 w-4 mr-2" />
                            Upload a document
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {device.documents.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p>No documents uploaded yet</p>
                        </div>
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>File Type</TableHead>
                                        <TableHead>File Size</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {displayedDocuments.map((doc) => (
                                        <TableRow key={doc.id}>
                                            <TableCell className="font-medium">{doc.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{doc.fileType}</Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{doc.fileSize}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <Download className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {device.documents.length > 2 && (
                                <div className="mt-4 flex justify-center">
                                    <Button
                                        variant="ghost"
                                        onClick={() => setShowAllDocuments(!showAllDocuments)}
                                        className="flex items-center gap-1"
                                    >
                                        {showAllDocuments ? 'Show less' : 'Show more'}
                                        <ChevronDown className={`h-4 w-4 transition-transform ${showAllDocuments ? 'rotate-180' : ''}`} />
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}