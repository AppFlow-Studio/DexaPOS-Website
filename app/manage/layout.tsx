'use client'

import { useSession } from '@clerk/nextjs'
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
    Shield,
    LayoutDashboard,
    Users,
    BarChart3,
    FileText,
    Settings,
    HelpCircle,
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
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler'
import { useUserInfo } from './hooks/useUserInfo.'
import { Skeleton } from '@/components/ui/skeleton'
import Image from 'next/image'

const navMain = [
    {
        "title": "Operations",
        "items": [
            {
                title: 'Dashboard',
                url: '/manage',
                icon: LayoutDashboard,
                group: 'Dashboard',
            },
            {
                title: 'Merchants',
                url: '/manage/merchants',
                icon: Building2,
            },
            {
                title: 'Organizations',
                url: '/manage/organizations',
                icon: Layers,
            }
        ]
    },

    {
        "title": "Internal Management",
        "items": [
            {
                title: 'Users',
                url: '/manage/users',
                icon: UserCheck
            },
            {
                title: 'Roles & Permissions',
                url: '/manage/roles-permissions',
                icon: ShieldCheck,
            },
            {
                title: 'Audit Logs',
                url: '/manage/audit-logs',
                icon: History,
            }]
    }
]

const navFooter = [
    {
        title: 'Settings',
        url: '#',
        icon: Settings,
    },
    {
        title: 'Get Help',
        url: '#',
        icon: HelpCircle,
    },
]

function AppSidebar() {
    const { data: userInfo, isLoading, error } = useUserInfo()
    const pathname = usePathname()
    console.log(userInfo)
    return (
        <Sidebar variant="inset">
            <SidebarHeader>
                <div className="flex items-center gap-2 px-4 py-2">
                    {
                        isLoading ? (
                            <Skeleton className="h-8 w-8" />
                        ) : (
                            <>
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                                    {userInfo?.members?.[0]?.organizations?.imageURL ? (
                                        <Image src={userInfo?.members?.[0]?.organizations?.imageURL} alt={userInfo?.members?.[0]?.organizations?.name} width={32} height={32} className='rounded-lg' />
                                    ) : (
                                        <Shield className="h-4 w-4 text-primary-foreground" />
                                    )}
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">{userInfo?.members?.[0]?.organizations?.name}</span>
                                    <span className="truncate text-xs text-muted-foreground">Admin Dashboard</span>
                                </div>
                            </>
                        )
                    }


                </div>
                <Link href="/manage/create-merchant" className="px-4 pb-2">
                    <Button className="w-full justify-start gap-2" size="sm">
                        <Plus className="h-4 w-4" />
                        Create Merchant
                    </Button>
                </Link>
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
                                                    <SidebarMenuButton asChild isActive={pathname.includes(item.url.split('/')[2]) || pathname === item.url}
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
                {/* <SidebarGroup>
                    <SidebarGroupLabel>Documents</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {data.navSecondary.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild>
                                        <Link href={item.url} className="text-primary">
                                            <item.icon className="h-4 w-4" />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup> */}
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
                                Log out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </SidebarFooter>
        </Sidebar>
    )
}

export default function ManageLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { isLoaded, isSignedIn } = useSession()

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
            <AppSidebar />
            <main className="flex-1 flex flex-col">
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
                <div className="flex-1 overflow-auto p-6">
                    {children}
                </div>
            </main>
        </SidebarProvider>
    )
}
