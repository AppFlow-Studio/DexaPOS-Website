'use client'

import { useClerk, useSession } from '@clerk/nextjs'
import { redirect, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
} from '@/components/ui/sidebar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Store,
    LayoutDashboard,
    ShoppingCart,
    Package,
    Users,
    BarChart3,
    Settings,
    HelpCircle,
    Search,
    MoreHorizontal,
    CreditCard,
    TrendingUp,
    Bell,
    User,
    LogOut,
    Utensils,
    Coffee,
    Receipt,
    ClipboardList,
    ChefHat,
    Calendar,
    MapPin,
    Building2,
    ChevronDown,
    Plus,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler'
import { useUserInfo } from '../manage/hooks/useUserInfo.'
import { Skeleton } from '@/components/ui/skeleton'
import Image from 'next/image'
import { useLocations } from './hooks/useLocations'
import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRouter } from 'next/navigation'

const navMain = [
    {
        "title": "Operations",
        "items": [
            {
                title: 'Dashboard',
                url: '/dashboard',
                icon: LayoutDashboard,
            },
            {
                title: 'Locations',
                url: '/dashboard/locations',
                icon: MapPin,
            },
            {
                title: 'Orders',
                url: '/dashboard/orders',
                icon: ShoppingCart,
            },
            {
                title: 'Menu',
                url: '/dashboard/menu',
                icon: Utensils,
            },
            {
                title: 'Tables',
                url: '/dashboard/tables',
                icon: Coffee,
            },
        ]
    },
    {
        "title": "Management",
        "items": [
            {
                title: 'Staff',
                url: '/dashboard/staff',
                icon: Users,
            },
            {
                title: 'Schedules',
                url: '/dashboard/schedules',
                icon: Calendar,
            },
            {
                title: 'Customers',
                url: '/dashboard/customers',
                icon: User,
            },
            {
                title: 'Inventory',
                url: '/dashboard/inventory',
                icon: Package,
            },
            {
                title: 'Reports',
                url: '/dashboard/reports',
                icon: BarChart3,
            },
        ]
    },
    {
        "title": "Financial",
        "items": [
            {
                title: 'Transactions',
                url: '/dashboard/transactions',
                icon: Receipt,
            },
            {
                title: 'Payments',
                url: '/dashboard/payments',
                icon: CreditCard,
            },
        ]
    },
]

const navFooter = [
    {
        title: 'Settings',
        url: '/dashboard/settings',
        icon: Settings,
    },
    {
        title: 'Get Help',
        url: '#',
        icon: HelpCircle,
    },
]

function MerchantSidebar() {
    const { data: userInfo, isLoading, error } = useUserInfo()
    const pathname = usePathname()
    const { signOut } = useClerk()
    const router = useRouter()
    const [selectedLocationId, setSelectedLocationId] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('selectedLocationId') || 'all'
        }
        return 'all'
    })

    // Get clerk org ID from userInfo
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const { data: locations, isLoading: locationsLoading } = useLocations(clerkOrgId || '')

    const locationsList = Array.isArray(locations) ? locations : []

    const handleLocationChange = (value: string) => {
        if (value === 'manage') {
            router.push('/dashboard/locations')
        } else {
            setSelectedLocationId(value)
            // Store selected location in localStorage or context for use across the app
            if (typeof window !== 'undefined') {
                localStorage.setItem('selectedLocationId', value)
            }
        }
    }

    return (
        <Sidebar variant="inset">
            <SidebarHeader>
                <div className="flex items-center gap-2 px-4 py-2">
                    {
                        isLoading ? (
                            <Skeleton className="h-8 w-8" />
                        ) : (
                            <>
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary relative">
                                    {userInfo?.members?.[0]?.organizations?.imageURL ? (
                                        <Image src={userInfo?.members?.[0]?.organizations?.imageURL} alt={userInfo?.members?.[0]?.organizations?.name} fill objectFit='cover' className='rounded-lg' />
                                    ) : (
                                        <Store className="h-4 w-4 text-primary-foreground" />
                                    )}
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">{userInfo?.members?.[0]?.organizations?.name}</span>
                                    <span className="truncate text-xs text-muted-foreground">Merchant Dashboard</span>
                                </div>
                            </>
                        )
                    }
                </div>

                {/* Location Selector */}
                <div className="px-4 pb-2">
                    {isLoading || locationsLoading ? (
                        <Skeleton className="h-9 w-full" />
                    ) : (
                        <Select value={selectedLocationId} onValueChange={handleLocationChange}>
                            <SelectTrigger className="w-full">
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    <SelectValue placeholder="Select location">
                                        {selectedLocationId === 'all'
                                            ? 'All Locations'
                                            : locationsList.find(loc => loc.id === selectedLocationId)?.name || 'Select location'
                                        }
                                    </SelectValue>
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4" />
                                        <span>All Locations</span>
                                    </div>
                                </SelectItem>
                                {locationsList.map((location) => (
                                    <SelectItem key={location.id} value={location.id}>
                                        <div className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4" />
                                            <span>{location.name}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                                <SelectItem value="manage" className="text-primary font-medium">
                                    <div className="flex items-center gap-2">
                                        <Plus className="h-4 w-4" />
                                        <span>Manage Locations</span>
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {navMain.map((item, index) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarGroup>
                                        <SidebarGroupLabel>{item.title}</SidebarGroupLabel>
                                        <SidebarMenu>
                                            {item.items.map((item) => (
                                                <SidebarMenuItem key={item.title}>
                                                    <SidebarMenuButton
                                                        asChild
                                                        isActive={pathname === item.url || pathname.startsWith(item.url + '/')}
                                                    >
                                                        <Link href={item.url}>
                                                            <item.icon className="h-4 w-4" />
                                                            <span>{item.title}</span>
                                                        </Link>
                                                    </SidebarMenuButton>
                                                </SidebarMenuItem>
                                            ))}
                                        </SidebarMenu>
                                    </SidebarGroup>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <SidebarMenu>
                    {navFooter.map((item) => (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton asChild>
                                <Link href={item.url}>
                                    <item.icon className="h-4 w-4" />
                                    <span>{item.title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
                <div className="flex items-center gap-2 p-2">
                    {isLoading ? (
                        <Skeleton className="h-8 w-8" />
                    ) : (
                        <>
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={userInfo?.avatar_url} alt={userInfo?.first_name} />
                                <AvatarFallback>{userInfo?.first_name?.charAt(0)}{userInfo?.last_name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">{userInfo?.first_name} {userInfo?.last_name}</span>
                                <span className="truncate text-xs text-muted-foreground">{userInfo?.email}</span>
                            </div>
                        </>
                    )}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>My Account</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                                <User className="mr-2 h-4 w-4" />
                                Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <Settings className="mr-2 h-4 w-4" />
                                Settings
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                                <button onClick={() => signOut({ redirectUrl: '/' })}>
                                    <div className='flex items-center gap-2'>
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Log out
                                    </div>
                                </button>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </SidebarFooter>
        </Sidebar>
    )
}

export default function MerchantDashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { isLoaded, isSignedIn } = useSession()
    const { data: userInfo } = useUserInfo()
    const router = useRouter()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const { data: locations } = useLocations(clerkOrgId || '')
    const locationsList = Array.isArray(locations) ? locations : []

    useEffect(() => {
        if (isLoaded && !isSignedIn) {
            redirect('/')
        }
    }, [isLoaded, isSignedIn])

    if (!isLoaded) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (!isSignedIn) {
        return null
    }

    return (
        <SidebarProvider>
            <MerchantSidebar />
            <main className="flex-1 flex flex-col">
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1" />
                    <div className="flex items-center gap-2">
                        <h1 className="text-lg font-semibold">Merchant Dashboard</h1>
                    </div>
                    <div className="ml-auto flex flex-row items-center gap-2">
                        {/* Location Management Dropdown */}
                        {/* <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-2">
                                    <MapPin className="h-4 w-4" />
                                    <span className="hidden sm:inline">Locations</span>
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>Location Management</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => router.push('/dashboard/locations')}>
                                    <Building2 className="mr-2 h-4 w-4" />
                                    Manage Locations
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push('/dashboard/locations?action=create')}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Add New Location
                                </DropdownMenuItem>
                                {locationsList.length > 0 && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel>Quick Switch</DropdownMenuLabel>
                                        {locationsList.slice(0, 5).map((location) => (
                                            <DropdownMenuItem key={location.id}>
                                                <MapPin className="mr-2 h-4 w-4" />
                                                {location.name}
                                            </DropdownMenuItem>
                                        ))}
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu> */}
                        <AnimatedThemeToggler />
                        <Button variant="ghost" size="icon">
                            <Search className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                            <Bell className="h-4 w-4" />
                        </Button>
                    </div>
                </header>
                <div className="flex-1 overflow-auto p-6">
                    {children}
                </div>
            </main>
        </SidebarProvider>
    )
}