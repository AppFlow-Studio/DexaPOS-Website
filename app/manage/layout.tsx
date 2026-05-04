'use client'

import { useClerk, useSession } from '@clerk/nextjs'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo } from 'react'
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
    Shield,
    LayoutDashboard,
    Users,
    BarChart3,
    Settings,
    HelpCircle,
    MessageSquare,
    Search,
    Plus,
    MoreHorizontal,
    Building2,
    CreditCard,
    TrendingUp,
    Package,
    Bell,
    User,
    SquareStack,
    Layers,
    UserCheck,
    ShieldCheck,
    History,
    LogOut,
    Monitor,
    Plug,
    AlertOctagon,
    Receipt,
    LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler'
import { useUserInfo } from './hooks/useUserInfo.'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import Image from 'next/image'
import type { PermissionCode } from '@/lib/admin/permission-codes'
import { toast } from 'sonner'
import { DeviceRegistryCommandPaletteProvider } from '@/app/manage/devices/components/DeviceRegistryCommandPalette'

// Navigation item type with optional permission requirement
interface NavItem {
    title: string
    url: string
    icon: LucideIcon
    requiredPermission?: PermissionCode | PermissionCode[]
    minRoleLevel?: number
    group?: string
}

interface NavGroup {
    title: string
    items: NavItem[]
}

// Navigation configuration with permission requirements
const navMain: NavGroup[] = [
    {
        title: "Operations",
        items: [
            {
                title: 'Dashboard',
                url: '/manage',
                icon: LayoutDashboard,
                // Dashboard is visible to all HQ users
            },
            {
                title: 'Merchants',
                url: '/manage/merchants',
                icon: Building2,
                requiredPermission: 'merchants.view',
            },
            // {
            //     title: 'Organizations',
            //     url: '/manage/organizations',
            //     icon: Layers,
            //     permission: 'hq.org.view',
            // },
            {
                title: 'Transactions',
                url: '/manage/transactions',
                icon: CreditCard,
                requiredPermission: 'transactions.view',
            },
            {
                title: 'Analytics',
                url: '/manage/analytics',
                icon: BarChart3,
                requiredPermission: 'analytics.view',
            },
            {
                title: 'Platform Fees',
                url: '/manage/platform-fees',
                icon: Receipt,
                requiredPermission: 'hq.merchant.transactions' as PermissionCode,
            },
        ]
    },
    {
        title: "Internal Management",
        items: [
            {
                title: 'Users',
                url: '/manage/users',
                icon: UserCheck,
                requiredPermission: 'users.manage',
            },
            {
                title: 'Roles & Permissions',
                url: '/manage/roles-permissions',
                icon: ShieldCheck,
                requiredPermission: 'roles.manage',
                minRoleLevel: 10,
            },
            {
                title: 'Audit Logs',
                url: '/manage/audit-logs',
                icon: History,
                requiredPermission: 'audit.view',
            },
            {
                title: 'Dead Letter Queue',
                url: '/manage/dlq',
                icon: AlertOctagon,
                requiredPermission: 'hq.merchant.update' as PermissionCode,
            },
            {
                title: 'Support',
                url: '/manage/support',
                icon: MessageSquare,
                requiredPermission: 'audit.view',
            }
        ]
    },
    {
        title: "Config",
        items: [
            {
                title: 'Device Registry',
                url: '/manage/devices',
                icon: Package,
                requiredPermission: 'system.config.manage' as PermissionCode,
            },
            {
                title: 'Device Catalog',
                url: '/manage/device-catalog',
                icon: Monitor,
                requiredPermission: 'system.config.manage' as PermissionCode,
            },
            {
                title: 'Integrations',
                url: '/manage/settings/integrations',
                icon: Plug,
                requiredPermission: 'hq.merchant.update' as PermissionCode,
            },
        ]
    }
]

const navFooter = [
    {
        title: 'Settings',
        url: '/manage/settings',
        icon: Settings,
        requiredPermission: 'system.config.manage' as PermissionCode,
    },
    {
        title: 'Get Help',
        url: '#',
        icon: HelpCircle,
    },
]

function AppSidebar() {
    const { data: userInfo, isLoading: userInfoLoading } = useUserInfo()
    const { role, hasPermission, hasAnyPermission, isAtLeast, isLoading: authLoading } = useAdminPermissions()
    const pathname = usePathname()
    
    const { signOut } = useClerk()
    const canCreateMerchants = hasPermission('merchants.create')

    const isLoading = userInfoLoading || authLoading
    // Filter navigation items based on user permissions
    const filteredNavMain = useMemo(() => {
        return navMain.map(group => ({
            ...group,
            items: group.items.filter(item => {
                const hasPermissionAccess = !item.requiredPermission
                    ? true
                    : hasAnyPermission(
                        Array.isArray(item.requiredPermission)
                            ? item.requiredPermission
                            : [item.requiredPermission]
                    )

                const hasRoleAccess = !item.minRoleLevel
                    ? true
                    : isAtLeast(item.minRoleLevel)

                return hasPermissionAccess && hasRoleAccess
            })
        })).filter(group => group.items.length > 0) // Remove empty groups
    }, [hasAnyPermission, isAtLeast])

    // Filter footer navigation based on permissions
    const filteredNavFooter = useMemo(() => {
        return navFooter.filter(item => {
            if (!item.requiredPermission) return true
            return hasAnyPermission(
                Array.isArray(item.requiredPermission)
                    ? item.requiredPermission
                    : [item.requiredPermission]
            )
        })
    }, [hasAnyPermission])
    return (
        <Sidebar variant="inset">
            <SidebarHeader>
                <div className="flex items-center gap-2 px-4 py-2">
                    {isLoading ? (
                        <Skeleton className="h-8 w-8" />
                    ) : (
                        <>
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                                {userInfo?.members?.[0]?.organizations?.imageURL ? (
                                    <Image src={userInfo?.members?.[0]?.organizations?.imageURL} alt={userInfo?.members?.[0]?.organizations?.name || 'Organization'} width={32} height={32} className='rounded-lg' />
                                ) : (
                                    <Shield className="h-4 w-4 text-primary-foreground" />
                                )}
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">{userInfo?.members?.[0]?.organizations?.name || 'DexaPOS HQ'}</span>
                                <span className="truncate text-xs text-muted-foreground">Admin Dashboard</span>
                            </div>
                        </>
                    )}
                </div>
                {/* Only show Create Merchant button if user has permission */}
                {canCreateMerchants && (
                    <Link href="/manage/merchants/new" className="px-4 pb-2">
                        <Button className="w-full justify-start gap-2" size="sm">
                            <Plus className="h-4 w-4" />
                            Create Merchant
                        </Button>
                    </Link>
                )}
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {filteredNavMain.map((group) => (
                                <SidebarMenuItem key={group.title}>
                                    <SidebarGroup>
                                        <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
                                        <SidebarMenu>
                                            {group.items.map((item) => (
                                                <SidebarMenuItem key={item.title}>
                                                    <SidebarMenuButton
                                                        asChild
                                                        isActive={
                                                            pathname === item.url ||
                                                            (item.url !== '/manage' && pathname.startsWith(item.url))
                                                        }
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
                    {filteredNavFooter.map((item) => (
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
                            <Link href="/manage/profile" className="flex items-center gap-2 flex-1 min-w-0">
                                <Avatar className="h-8 w-8 shrink-0">
                                    <AvatarImage src={userInfo?.avatar_url} alt={userInfo?.first_name || ''} />
                                    <AvatarFallback>{userInfo?.first_name?.charAt(0)}{userInfo?.last_name?.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">{userInfo?.first_name} {userInfo?.last_name}</span>
                                    <span className="truncate text-xs text-muted-foreground">
                                        {role?.role_name || userInfo?.email}
                                    </span>
                                </div>
                            </Link>
                        </>
                    )}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>
                                <div className="flex flex-col gap-1">
                                    <span>My Account</span>
                                    {role && (
                                        <Badge variant="secondary" className="w-fit text-xs">
                                            {role.role_name}
                                        </Badge>
                                    )}
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <Link href="/manage/profile">
                                    <User className="mr-2 h-4 w-4" />
                                    Profile
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href="/manage/settings">
                                    <Settings className="mr-2 h-4 w-4" />
                                    Settings
                                </Link>
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

function DeniedParamHandler() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    useEffect(() => {
        if (searchParams.get('denied') !== '1') {
            return
        }

        const required = searchParams.get('required') ?? ''
        const deniedMessageByRequirement: Record<string, string> = {
            'users.manage': "You don't have access to Users.",
            'roles.manage': "You don't have access to Roles & Permissions.",
            'audit.view': "You don't have access to Audit Logs.",
            'merchants.create': "You don't have access to Create Merchant.",
        }

        toast.error(
            deniedMessageByRequirement[required] ||
            "You don't have permission to access that page."
        )

        const nextParams = new URLSearchParams(searchParams.toString())
        nextParams.delete('denied')
        nextParams.delete('required')
        const cleanedQuery = nextParams.toString()

        router.replace(cleanedQuery ? `${pathname}?${cleanedQuery}` : pathname, {
            scroll: false,
        })
    }, [pathname, router, searchParams])

    return null
}

export default function ManageLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { isLoaded, isSignedIn } = useSession()
    const router = useRouter()

    useEffect(() => {
        if (isLoaded && !isSignedIn) {
            router.replace('/')
        }
    }, [isLoaded, isSignedIn, router])

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
            <DeviceRegistryCommandPaletteProvider>
                <Suspense>
                    <DeniedParamHandler />
                </Suspense>
                <AppSidebar />
                <main className="flex-1 flex flex-col min-w-0">
                    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                        <SidebarTrigger className="-ml-1" />
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-semibold">Dashboard</h1>
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
                    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 min-w-0">
                    {children}
                    </div>
                </main>
            </DeviceRegistryCommandPaletteProvider>
        </SidebarProvider>
    )
}
