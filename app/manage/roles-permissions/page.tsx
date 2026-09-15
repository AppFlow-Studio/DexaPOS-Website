'use client'

import { useState } from 'react'
import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
    Search,
    MoreHorizontal,
    Plus,
    Shield,
    ShieldCheck,
    Users,
    Edit,
    Trash2,
    Copy,
    Eye,
    Settings,
    Database,
    FileText,
    BarChart3,
    Building2,
    CreditCard,
    Package,
    Bell,
    Mail,
    ChevronDown,
    ChevronUp,
    X,
    Grid3X3,
    UserCheck,
} from 'lucide-react'
import { useRolesWithPermissionsHQ } from '../hooks/useRolesWithPermissionsHQ'


export default function RolesPermissionsPage() {
    const { data: rolesWithPermissions, isLoading } = useRolesWithPermissionsHQ()
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedRole, setSelectedRole] = useState<any>(null)
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

    // Use real data if available, otherwise fall back to mock data
    const roles = rolesWithPermissions

    const filteredRoles = roles?.filter((role: any) =>
        role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        role.description.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        })
    }

    const getScopeIcon = (organizationType: string) => {
        switch (organizationType) {
            case 'organization':
                return Building2
            case 'carrier':
                return CreditCard
            case 'merchant':
                return Users
            default:
                return Shield
        }
    }

    const getScopeLabel = (organizationType: string) => {
        switch (organizationType) {
            case 'organization':
                return 'HQ'
            case 'carrier':
                return 'Carrier'
            case 'merchant':
                return 'Merchant'
            default:
                return 'System'
        }
    }

    const toggleSection = (sectionKey: string) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionKey]: !prev[sectionKey]
        }))
    }

    const getPermissionCategory = (permission: any) => {
        // Group permissions by category and scope
        const categoryMap: Record<string, string> = {
            'hq': 'HQ Management',
            'carrier': 'Carrier Management',
            'merchant': 'Merchant Management',
            'people': 'People & Contracts',
            'payroll': 'Payroll & Payments',
            'analytics': 'Analytics & Reports',
            'organization': 'Organization Management',
            'system': 'System Management',
        }

        return categoryMap[permission.category] || permission.category || 'Other'
    }

    const groupPermissionsByCategory = (permissions: any[]) => {
        const grouped: Record<string, any[]> = {}
        permissions.forEach(permission => {
            const category = getPermissionCategory(permission)
            if (!grouped[category]) {
                grouped[category] = []
            }
            grouped[category].push(permission)
        })
        return grouped
    }

    const groupRolesByOrganizationType = (roles: any[]) => {
        const grouped: Record<string, any[]> = {
            'HQ': [],
            'Carrier': [],
            'Merchant': []
        }

        roles.forEach(role => {
            const type = getScopeLabel(role.organization_type)
            if (grouped[type]) {
                grouped[type].push(role)
            } else {
                // Handle any roles that don't match the expected types
                grouped['HQ'].push(role)
            }
        })

        return grouped
    }

    // Set first role as selected by default
    // if (selectedRole && filteredRoles && filteredRoles?.length > 0) {
    //     setSelectedRole(filteredRoles[0])
    // }

    if (isLoading)
        return (
            <DataPageSkeleton
                variant="table"
                shell="plain"
                label="Loading roles and permissions"
            />
        )

    return (
        <div className="h-screen flex flex-col">
            {/* Header */}
            {/* <div className="flex items-center justify-between p-6 border-b">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Roles & Permissions</h1>
                    <p className="text-muted-foreground">
                        Manage user roles and their associated permissions across the system.
                    </p>
                </div>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Role
                </Button>
            </div> */}

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel - Roles List */}
                <div className="w-1/3 border-r bg-gray-50/50 flex flex-col">
                    <div className="p-4 border-b flex-shrink-0">
                        <h2 className="text-lg font-semibold">Roles</h2>
                        <p className="text-sm text-muted-foreground">Select a role to view its permissions</p>
                    </div>

                    <div className="p-4 flex-shrink-0">
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search roles..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-4">
                        <div className="space-y-4">
                            {filteredRoles && (() => {
                                const groupedRoles = groupRolesByOrganizationType(filteredRoles)

                                // Define the order to display role types
                                const displayOrder = ['HQ', 'Carrier', 'Merchant']

                                return displayOrder.map((type) => {
                                    const roles = groupedRoles[type]
                                    if (!roles || roles.length === 0) return null

                                    return (
                                        <div key={type} className="space-y-2">
                                            <div className="flex items-center space-x-2 px-2">
                                                <div className={`h-4 w-4 rounded-full ${type === 'HQ' ? 'bg-blue-500' :
                                                    type === 'Carrier' ? 'bg-green-500' :
                                                        'bg-purple-500'
                                                    }`}></div>
                                                <h3 className="text-sm font-semibold text-gray-700">{type} Roles</h3>
                                                <span className="text-xs text-gray-500">({roles.length})</span>
                                            </div>
                                            <div className="space-y-1 ml-6">
                                                {roles.map((role: any) => {
                                                    const ScopeIcon = getScopeIcon(role.organization_type)
                                                    const isSelected = selectedRole?.id === role.id

                                                    return (
                                                        <div
                                                            key={role.id}
                                                            onClick={() => setSelectedRole(role)}
                                                            className={`p-3 rounded-lg cursor-pointer transition-colors ${isSelected
                                                                ? 'bg-blue-50 border border-blue-200'
                                                                : 'hover:bg-gray-100 border border-transparent'
                                                                }`}
                                                        >
                                                            <div className="flex items-start space-x-3">
                                                                <div className="flex-shrink-0">
                                                                    <ScopeIcon className="h-4 w-4 text-muted-foreground" />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-medium text-sm">{role.name}</div>
                                                                    <div className="text-xs text-muted-foreground mt-1">
                                                                        {role.permissions?.length || 0} Permissions
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )
                                })
                            })()}
                        </div>
                    </div>
                </div>

                {/* Right Panel - Role Details */}
                <div className="flex-1 flex flex-col">
                    {selectedRole ? (
                        <>
                            {/* Role Details Header */}
                            <div className="p-6 border-b">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <Badge variant="outline" className="text-xs">
                                            ROLE DETAILS
                                        </Badge>
                                    </div>
                                    <Button variant="ghost" size="icon">
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="mt-4">
                                    <h2 className="text-2xl font-bold">{selectedRole.name}</h2>
                                    <div className='flex flex-row items-center justify-between space-x-2'>
                                        <div className="flex items-center space-x-2 ">
                                            <span className="text-sm text-muted-foreground">
                                                Scope: {getScopeLabel(selectedRole.organization_type)}
                                            </span>
                                            <span className="text-muted-foreground">·</span>
                                            <span className="text-sm text-muted-foreground">
                                                {selectedRole.is_system_role ? 'System role' : 'Custom role'}
                                            </span>
                                        </div>
                                        {/* Header Actions */}
                                        <div className="">
                                            <div className="flex items-center justify-between">
                                                <div className="flex space-x-2">
                                                    <Button variant="outline" size="sm">
                                                        <Edit className="mr-2 h-4 w-4" />
                                                        Edit Role
                                                    </Button>
                                                    <Button variant="outline" size="sm">
                                                        <Copy className="mr-2 h-4 w-4" />
                                                        Duplicate
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-2">
                                        {selectedRole.description}
                                    </p>
                                    <div className="text-xs text-muted-foreground">
                                        Created {formatDate(selectedRole.created_at)}
                                    </div>
                                </div>
                            </div>

                            {/* Permissions Section */}
                            <div className="flex-1 overflow-y-auto p-6">
                                <div className="space-y-4">
                                    {selectedRole.permissions && selectedRole.permissions.length > 0 ? (
                                        (() => {
                                            const groupedPermissions = groupPermissionsByCategory(selectedRole.permissions)

                                            // Sort categories to show HQ, Carrier, Merchant first, then others
                                            const categoryOrder = ['HQ Management', 'Carrier Management', 'Merchant Management', 'People & Contracts', 'Payroll & Payments', 'Analytics & Reports', 'Organization Management', 'System Management']
                                            const sortedCategories = Object.keys(groupedPermissions).sort((a, b) => {
                                                const aIndex = categoryOrder.indexOf(a)
                                                const bIndex = categoryOrder.indexOf(b)
                                                if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
                                                if (aIndex === -1) return 1
                                                if (bIndex === -1) return -1
                                                return aIndex - bIndex
                                            })

                                            return sortedCategories.map((category) => {
                                                const permissions = groupedPermissions[category]
                                                const sectionKey = `${selectedRole.id}-${category}`
                                                const isExpanded = expandedSections[sectionKey] ?? true

                                                return (
                                                    <Collapsible
                                                        key={category}
                                                        open={isExpanded}
                                                        onOpenChange={() => toggleSection(sectionKey)}
                                                        className="border border-gray-200 rounded-lg"
                                                    >
                                                        <CollapsibleTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                className="w-full justify-between p-4 h-auto hover:bg-gray-50"
                                                            >
                                                                <div className="flex items-center space-x-2">
                                                                    <span className="font-medium">{category}</span>
                                                                    <Badge variant="outline" className="text-xs">
                                                                        {permissions.length}
                                                                    </Badge>
                                                                </div>
                                                                {isExpanded ? (
                                                                    <ChevronUp className="h-4 w-4" />
                                                                ) : (
                                                                    <ChevronDown className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        </CollapsibleTrigger>
                                                        <CollapsibleContent className="space-y-2 p-4 pt-0">
                                                            {permissions.map((permission: any) => (
                                                                <div
                                                                    key={permission.id}
                                                                    className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg"
                                                                >
                                                                    <div className="flex-shrink-0 mt-0.5">
                                                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <div className="font-medium text-sm">{permission.name}</div>
                                                                        <div className="text-xs text-muted-foreground mt-1">
                                                                            {permission.description}
                                                                        </div>
                                                                        <div className="flex items-center space-x-2 mt-2">
                                                                            <Badge variant="outline" className="text-xs">
                                                                                {permission.scope || 'Global'}
                                                                            </Badge>
                                                                            <Badge variant="secondary" className="text-xs">
                                                                                {permission.category}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </CollapsibleContent>
                                                    </Collapsible>
                                                )
                                            })
                                        })()
                                    ) : (
                                        <div className="text-center py-8">
                                            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                            <p className="text-muted-foreground">No permissions assigned to this role</p>
                                        </div>
                                    )}
                                </div>
                            </div>


                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <p className="text-muted-foreground">Select a role to view its details</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
