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
    Bell,
    User,
    LogOut,
    Utensils,
    Coffee,
    Receipt,
    Calendar,
    MapPin,
    Building2,
    ChevronDown,
    List,
    Layers,
    Tag,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler'
import { useUserInfo } from '../manage/hooks/useUserInfo.'
import { Skeleton } from '@/components/ui/skeleton'
import Image from 'next/image'
import { useLocations } from './hooks/useLocations'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useLocationStore, useSelectedLocation, useIsAllLocations } from '@/stores/location-store'

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
                title: 'Tables',
                url: '/dashboard/tables',
                icon: Coffee,
            },
        ]
    },
    {
        title: 'Menus & Products',
        "items": [
            {
                title: 'Menus',
                url: '/dashboard/menu',
                icon: Utensils,
            },
            {
                title: 'Items',
                url: '/dashboard/menu/items',
                icon: List,
            },
            {
                title: 'Categories',
                url: '/dashboard/menu/categories',
                icon: Tag,
            },
            {
                title: 'Modifiers',
                url: '/dashboard/menu/modifiers',
                icon: Layers,
            },
            {
                title: 'Schedules',
                url: '/dashboard/menu/schedules',
                icon: Calendar,
            }
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
    const { data: userInfo, isLoading } = useUserInfo()
    const pathname = usePathname()
    const { signOut } = useClerk()

    return (
        <Sidebar variant="inset" >
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
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {navMain.map((item) => (
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
        </Sidebar >
    )
}

// Location indicator component for the header - now using Zustand store
function LocationIndicator() {
    const { selectedLocationId, locations, setSelectedLocation } = useLocationStore()
    const selectedLocation = useSelectedLocation()
    const isAllLocations = useIsAllLocations()

    const handleLocationChange = (locationId: string) => {
        setSelectedLocation(locationId)
        const locationName = locationId === 'all'
            ? 'All Locations'
            : locations.find(l => l.id === locationId)?.name || 'Unknown'
        toast.success('Location Changed', {
            description: `Now viewing ${locationName}`,
            icon: <MapPin className="h-4 w-4" />,
        })
    }

    if (locations.length === 0) return null

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className={cn(
                    "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all duration-200",
                    isAllLocations
                        ? "bg-muted/50 hover:bg-muted"
                        : "bg-primary/10 border border-primary/20 hover:bg-primary/20"
                )}>
                    {isAllLocations ? (
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                        <MapPin className="h-3.5 w-3.5 text-primary animate-in zoom-in duration-200" />
                    )}
                    <span className={cn(
                        "max-w-[150px] truncate transition-colors duration-200",
                        isAllLocations ? "text-muted-foreground" : "font-medium"
                    )}>
                        {isAllLocations ? 'All Locations' : selectedLocation?.name}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 animate-in fade-in-0 zoom-in-95 duration-200">
                <DropdownMenuLabel className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Select Location
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => handleLocationChange('all')}
                    className={cn(
                        "cursor-pointer transition-colors",
                        selectedLocationId === 'all' && "bg-accent"
                    )}
                >
                    <Building2 className="mr-2 h-4 w-4" />
                    All Locations
                    {selectedLocationId === 'all' && (
                        <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 animate-in fade-in duration-200">
                            Active
                        </Badge>
                    )}
                </DropdownMenuItem>
                {locations.length > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Switch to</DropdownMenuLabel>
                        {locations.map((location, index) => (
                            <DropdownMenuItem
                                key={location.id}
                                onClick={() => handleLocationChange(location.id)}
                                className={cn(
                                    "cursor-pointer transition-colors animate-in fade-in slide-in-from-left-1 duration-200",
                                    selectedLocationId === location.id && "bg-accent"
                                )}
                                style={{ animationDelay: `${index * 30}ms` }}
                            >
                                <MapPin className="mr-2 h-4 w-4" />
                                <span className="truncate">{location.name}</span>
                                {!location.is_active && (
                                    <Badge variant="outline" className="ml-auto text-[10px] px-1.5">
                                        Inactive
                                    </Badge>
                                )}
                                {selectedLocationId === location.id && (
                                    <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 animate-in fade-in duration-200">
                                        Active
                                    </Badge>
                                )}
                            </DropdownMenuItem>
                        ))}
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
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
    const { data: locations, isLoading: locationsLoading } = useLocations(clerkOrgId || '')

    // Zustand store
    const { setLocations, setLoading, initialize, isInitialized } = useLocationStore()

    // Sync locations from API to Zustand store
    useEffect(() => {
        if (locationsLoading) {
            setLoading(true)
        } else {
            setLoading(false)
            if (locations && Array.isArray(locations)) {
                setLocations(locations)
            }
            if (!isInitialized) {
                initialize()
            }
        }
    }, [locations, locationsLoading, setLocations, setLoading, initialize, isInitialized])

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
        <SidebarProvider >
            <MerchantSidebar />
            <main className="flex-1 flex flex-col ">
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1" />
                    <div className="flex items-center gap-3">
                        <h1 className="text-lg font-semibold">Merchant Dashboard</h1>
                        <LocationIndicator />
                    </div>
                    <div className="ml-auto flex flex-row items-center gap-2">
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
