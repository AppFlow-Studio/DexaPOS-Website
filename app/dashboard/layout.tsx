"use client";

import { SignOutButton, useClerk, useSession } from "@clerk/nextjs";
import { redirect, usePathname } from "next/navigation";
import { useEffect } from "react";
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ChevronRight,
  List,
  Layers,
  Tag,
  Banknote,
  FileText,
  Globe,
  GitCompare,
  Monitor,
  MonitorPlay,
  Flame,
  Mail,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useUserInfo } from "../manage/hooks/useUserInfo.";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";
import { useLocations } from "./hooks/useLocations";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useLocationStore,
  useSelectedLocation,
  useIsAllLocations,
} from "@/stores/location-store";
import { useSessionSync } from "./hooks/useSessionSync";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const navMain = [
  {
    title: "Operations",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Locations",
        url: "/dashboard/locations",
        icon: MapPin,
      },
      {
        title: "Orders",
        url: "/dashboard/orders",
        icon: ShoppingCart,
      },
      {
        title: "Tables",
        url: "/dashboard/tables",
        icon: Coffee,
      },
    ],
  },
  {
    title: "Menus & Products",
    items: [
      {
        title: "Menus",
        url: "/dashboard/menu",
        icon: Utensils,
      },
      {
        title: "Items",
        url: "/dashboard/menu/items",
        icon: List,
      },
      {
        title: "Categories",
        url: "/dashboard/menu/categories",
        icon: Tag,
      },
      {
        title: "Discounts",
        url: "/dashboard/discounts",
        icon: Banknote,
      },
      {
        title: "Modifiers",
        url: "/dashboard/menu/modifiers",
        icon: Layers,
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        title: "Staff",
        url: "/dashboard/staff",
        icon: Users,
      },
      {
        title: "Schedules",
        url: "/dashboard/schedules",
        icon: Calendar,
      },
      {
        title: "Online Ordering",
        url: "/dashboard/online-ordering",
        icon: Globe,
      },
      {
        title: "Customers",
        url: "/dashboard/customers",
        icon: User,
      },
      {
        title: "Inventory",
        url: "/dashboard/inventory",
        icon: Package,
      },
      {
        title: "Audit Logs",
        url: "/dashboard/audit-logs",
        icon: GitCompare,
      },
      {
        title: "Reports",
        url: "/dashboard/reports",
        icon: BarChart3,
        items: [
          {
            title: "Financial Information",
            url: "/dashboard/reports/financials",
          },
          {
            title: "Compare Locations",
            url: "/dashboard/reports/comparison",
          },
          {
            title: "Orders",
            url: "/dashboard/orders/reports",
          },
          {
            title: "Sales By Items",
            url: "/dashboard/reports/sales-by-items",
          },
          {
            title: "Cash Management",
            url: "/dashboard/reports/cash-management",
          },
          {
            title: "Voids & Refunds",
            url: "/dashboard/reports/voids",
          },
        ],
      },
    ],
  },
  {
    title: "Marketing",
    items: [
      {
        title: "Campaigns",
        url: "/dashboard/campaigns",
        icon: Mail,
      },
    ],
  },
  {
    title: "Financial",
    items: [
      {
        title: "Transactions",
        url: "/dashboard/transactions",
        icon: Receipt,
      },
      {
        title: "Payments",
        url: "/dashboard/payments",
        icon: CreditCard,
      },
    ],
  },
];

const navFooter = [
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: Settings,
  },
  {
    title: "Get Help",
    url: "#",
    icon: HelpCircle,
  },
];

function MerchantSidebar() {
  const { data: userInfo, isLoading } = useUserInfo();
  const pathname = usePathname();
  const { signOut } = useClerk();

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-4 py-2">
          {isLoading ? (
            <Skeleton className="h-8 w-8" />
          ) : (
            <>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary relative">
                {userInfo?.members?.[0]?.organizations?.imageURL ? (
                  <Image
                    src={userInfo?.members?.[0]?.organizations?.imageURL}
                    alt={userInfo?.members?.[0]?.organizations?.name}
                    fill
                    objectFit="cover"
                    className="rounded-lg"
                  />
                ) : (
                  <Store className="h-4 w-4 text-primary-foreground" />
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {userInfo?.members?.[0]?.organizations?.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  Merchant Dashboard
                </span>
              </div>
            </>
          )}
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
                      {item.items.map((menuItem) => {
                        // Check if this is the Orders item that needs sub-menu
                        if (menuItem.title === "Orders") {
                          const isOrdersActive =
                            pathname === "/dashboard/orders" ||
                            pathname.startsWith("/dashboard/orders/");
                          const isOrdersOpen =
                            pathname.startsWith("/dashboard/orders");

                          return (
                            <SidebarMenuItem key={menuItem.title}>
                              <Collapsible defaultOpen={isOrdersOpen}>
                                <CollapsibleTrigger asChild>
                                  <SidebarMenuButton
                                    isActive={isOrdersActive}
                                    className="w-full"
                                  >
                                    <menuItem.icon className="h-4 w-4" />
                                    <span>{menuItem.title}</span>
                                    <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                  </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <SidebarMenuSub>
                                    <SidebarMenuSubItem>
                                      <SidebarMenuSubButton
                                        asChild
                                        isActive={
                                          pathname === "/dashboard/orders" &&
                                          !pathname.startsWith(
                                            "/dashboard/orders/analytics"
                                          ) &&
                                          !pathname.startsWith(
                                            "/dashboard/orders/reports"
                                          )
                                        }
                                      >
                                        <Link href="/dashboard/orders">
                                          <span>Orders</span>
                                        </Link>
                                      </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                    <SidebarMenuSubItem>
                                      <SidebarMenuSubButton
                                        asChild
                                        isActive={pathname.startsWith(
                                          "/dashboard/orders/analytics"
                                        )}
                                      >
                                        <Link href="/dashboard/orders/analytics">
                                          <BarChart3 className="h-3 w-3" />
                                          <span>Analytics</span>
                                        </Link>
                                      </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                    <SidebarMenuSubItem>
                                      <SidebarMenuSubButton
                                        asChild
                                        isActive={pathname.startsWith(
                                          "/dashboard/orders/reports"
                                        )}
                                      >
                                        <Link href="/dashboard/orders/reports">
                                          <FileText className="h-3 w-3" />
                                          <span>Reports</span>
                                        </Link>
                                      </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                  </SidebarMenuSub>
                                </CollapsibleContent>
                              </Collapsible>
                            </SidebarMenuItem>
                          );
                        }

                        // Check if this is the Reports item that needs sub-menu
                        if (menuItem.title === "Reports") {
                          const isReportsActive =
                            pathname === "/dashboard/reports" ||
                            pathname.startsWith("/dashboard/reports/");
                          const isReportsOpen =
                            pathname.startsWith("/dashboard/reports");

                          return (
                            <SidebarMenuItem key={menuItem.title}>
                              <Collapsible defaultOpen={isReportsOpen}>
                                <CollapsibleTrigger asChild>
                                  <SidebarMenuButton
                                    isActive={isReportsActive}
                                    className="w-full"
                                  >
                                    <menuItem.icon className="h-4 w-4" />
                                    <span>{menuItem.title}</span>
                                    <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                  </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <SidebarMenuSub>
                                    {/* @ts-ignore */}
                                    {menuItem.items &&
                                      menuItem.items.map((subItem) => (
                                        <SidebarMenuSubItem key={subItem.title}>
                                          <SidebarMenuSubButton
                                            asChild
                                            isActive={pathname === subItem.url}
                                          >
                                            <Link href={subItem.url}>
                                              <span>{subItem.title}</span>
                                            </Link>
                                          </SidebarMenuSubButton>
                                        </SidebarMenuSubItem>
                                      ))}
                                  </SidebarMenuSub>
                                </CollapsibleContent>
                              </Collapsible>
                            </SidebarMenuItem>
                          );
                        }

                        // Regular menu item
                        return (
                          <SidebarMenuItem key={menuItem.title}>
                            <SidebarMenuButton
                              asChild
                              isActive={
                                pathname === menuItem.url ||
                                pathname.startsWith(menuItem.url + "/")
                              }
                            >
                              <Link href={menuItem.url}>
                                <menuItem.icon className="h-4 w-4" />
                                <span>{menuItem.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
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
          {/* Settings submenu */}
          <SidebarMenuItem>
            <Collapsible
              defaultOpen={pathname.startsWith("/dashboard/settings")}
            >
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/dashboard/settings")}
                  className="w-full"
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                  <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      isActive={
                        pathname === "/dashboard/settings" &&
                        !pathname.includes("/stations")
                      }
                    >
                      <Link href="/dashboard/settings">
                        <span>General</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      isActive={pathname.startsWith(
                        "/dashboard/settings/stations"
                      )}
                    >
                      <Link href="/dashboard/settings/stations">
                        <Monitor className="h-3 w-3" />
                        <span>Stations</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      isActive={pathname.startsWith(
                        "/dashboard/settings/prep-stations"
                      )}
                    >
                      <Link href="/dashboard/settings/prep-stations">
                        <Flame className="h-3 w-3" />
                        <span>Prep Stations</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      isActive={pathname.startsWith(
                        "/dashboard/settings/customer-display"
                      )}
                    >
                      <Link href="/dashboard/settings/customer-display">
                        <MonitorPlay className="h-3 w-3" />
                        <span>Customer Display</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      isActive={pathname.startsWith(
                        "/dashboard/settings/receipt-templates"
                      )}
                    >
                      <Link href="/dashboard/settings/receipt-templates">
                        <Receipt className="h-3 w-3" />
                        <span>Receipt Templates</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenuItem>
          {/* Get Help */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="#">
                <HelpCircle className="h-4 w-4" />
                <span>Get Help</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-2 p-2">
          {isLoading ? (
            <Skeleton className="h-8 w-8" />
          ) : (
            <>
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={userInfo?.avatar_url}
                  alt={userInfo?.first_name}
                />
                <AvatarFallback>
                  {userInfo?.first_name?.charAt(0)}
                  {userInfo?.last_name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {userInfo?.first_name} {userInfo?.last_name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {userInfo?.email}
                </span>
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
                <SignOutButton>
                  <Button variant="ghost">
                    <div className="flex items-center gap-2">
                      <LogOut className="mr-2 h-4 w-4" />
                      Log out
                    </div>
                  </Button>
                </SignOutButton>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

// Location indicator component for the header - now using Zustand store
function LocationIndicator({ userRole }: { userRole?: string }) {
  const { selectedLocationId, locations, setSelectedLocation, isLoading } =
    useLocationStore();
  const selectedLocation = useSelectedLocation();
  const isAllLocations = useIsAllLocations();

  // Check if user is merchant.owner
  const isMerchantOwner = userRole === "merchant.owner";

  const handleLocationChange = (locationId: string) => {
    setSelectedLocation(locationId);
    const locationName =
      locationId === "all"
        ? "All Locations"
        : locations.find((l) => l.id === locationId)?.name || "Unknown";
    toast.success("Location Changed", {
      description: `Now viewing ${locationName}`,
      icon: <MapPin className="h-4 w-4" />,
    });
  };

  // Show loading state instead of returning null
  if (isLoading || locations.length === 0) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-muted/50">
        <Skeleton className="h-3.5 w-3.5 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all duration-200",
            isAllLocations
              ? "bg-muted/50 hover:bg-muted"
              : "bg-primary/10 border border-primary/20 hover:bg-primary/20"
          )}
        >
          {isAllLocations ? (
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <MapPin className="h-3.5 w-3.5 text-primary animate-in zoom-in duration-200" />
          )}
          <span
            className={cn(
              "max-w-37.5 truncate transition-colors duration-200",
              isAllLocations ? "text-muted-foreground" : "font-medium"
            )}
          >
            {isAllLocations
              ? "All Locations"
              : selectedLocation?.name ||
                locations.find((l) => l.id === selectedLocationId)?.name ||
                "Select Location"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 animate-in fade-in-0 zoom-in-95 duration-200"
      >
        <DropdownMenuLabel className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Select Location
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Only show "All Locations" option for merchant.owner */}
        {isMerchantOwner && (
          <>
            <DropdownMenuItem
              onClick={() => handleLocationChange("all")}
              className={cn(
                "cursor-pointer transition-colors",
                selectedLocationId === "all" && "bg-accent"
              )}
            >
              <Building2 className="mr-2 h-4 w-4" />
              All Locations
              {selectedLocationId === "all" && (
                <Badge
                  variant="secondary"
                  className="ml-auto text-[10px] px-1.5 animate-in fade-in duration-200"
                >
                  Active
                </Badge>
              )}
            </DropdownMenuItem>
            {locations.length > 0 && <DropdownMenuSeparator />}
          </>
        )}
        {locations.length > 0 && (
          <>
            {isMerchantOwner && (
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Switch to
              </DropdownMenuLabel>
            )}
            {locations.map((location, index) => {
              const isPrimary = (location as any).is_primary_location === true;
              return (
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
                  <div className="ml-auto flex items-center gap-1">
                    {isPrimary && (
                      <Badge
                        variant="default"
                        className="text-[10px] px-1.5 bg-primary text-primary-foreground"
                      >
                        Primary
                      </Badge>
                    )}
                    {!location.is_active && (
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        Inactive
                      </Badge>
                    )}
                    {selectedLocationId === location.id && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 animate-in fade-in duration-200"
                      >
                        Active
                      </Badge>
                    )}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function MerchantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoaded, isSignedIn } = useSession();
  const { data: userInfo } = useUserInfo();
  const router = useRouter();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;
  const userRole = userInfo?.members?.[0]?.role;
  const { data: locations, isLoading: locationsLoading } = useLocations(
    clerkOrgId || "",
    userInfo?.id || ""
  );

  // Zustand store
  const {
    selectedLocationId,
    setSelectedLocation,
    setLocations,
    setLoading,
    initialize,
    isInitialized,
  } = useLocationStore();

  // Check if user is merchant.owner
  const isMerchantOwner = userRole === "merchant.owner";

  // Monitor session state to prevent unnecessary query invalidation
  useSessionSync();

  // Consolidated location sync and initialization
  useEffect(() => {
    // Defensive check: ensure we have required data before proceeding
    if (!clerkOrgId || !userInfo?.id) {
      return;
    }

    // Handle loading state
    if (locationsLoading) {
      setLoading(true);
      return;
    }

    setLoading(false);

    // Only proceed if we have valid locations data
    if (!locations || !Array.isArray(locations)) {
      return;
    }

    // Track if this is the first initialization
    const wasInitialized = isInitialized;

    // Initialize store if not already initialized
    if (!wasInitialized) {
      initialize();
    }

    // Update locations (store will validate selected location automatically)
    // Only update if we have locations or current locations are empty
    // This prevents clearing locations during refetches
    if (locations.length > 0) {
      setLocations(locations);
    }

    // Set primary location as default only on first load
    // This happens when selectedLocationId is 'all' and we just initialized
    if (
      !wasInitialized &&
      locations.length > 0 &&
      selectedLocationId === "all"
    ) {
      const primaryLocation = locations.find(
        (loc: any) => loc.is_primary_location === true
      );

      if (primaryLocation) {
        // Set primary location as default
        setSelectedLocation(primaryLocation.id);
      } else if (!isMerchantOwner) {
        // For non-owners without primary, select first location
        setSelectedLocation(locations[0].id);
      }
    }
  }, [
    clerkOrgId,
    userInfo?.id,
    locations,
    locationsLoading,
    setLocations,
    setLoading,
    setSelectedLocation,
    initialize,
    isInitialized,
    selectedLocationId,
    isMerchantOwner,
  ]);

  // Handle non-owner case: ensure they can't stay on "all"
  useEffect(() => {
    if (
      !isMerchantOwner &&
      locations &&
      locations.length > 0 &&
      selectedLocationId === "all"
    ) {
      // Find primary location first, otherwise use first available
      const primaryLocation = locations.find(
        (loc: any) => loc.is_primary_location === true
      );
      setSelectedLocation(primaryLocation?.id || locations[0].id);
    }
  }, [isMerchantOwner, locations, selectedLocationId, setSelectedLocation]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      redirect("/");
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  return (
    <SidebarProvider>
      <MerchantSidebar />
      <main className="flex-1 flex flex-col ">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Merchant Dashboard</h1>
            <LocationIndicator userRole={userRole} />
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
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}
