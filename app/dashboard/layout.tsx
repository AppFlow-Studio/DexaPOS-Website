"use client";

import { useClerk, useSession } from "@clerk/nextjs";
import { redirect, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Store,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  Settings,
  HelpCircle,
  MessageCircle,
  Search,
  MoreHorizontal,
  CreditCard,
  User,
  LogOut,
  Utensils,
  CircleSlash,
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
  Settings2,
  Mail,
  Gift,
  DollarSign,
  CalendarClock,
  ShieldAlert,
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
  useIsSingleLocation,
  useSingleLocationName,
} from "@/stores/location-store";
import { useSessionSync } from "./hooks/useSessionSync";
import { useQueryClient } from "@tanstack/react-query";
import { resetClientSession } from "@/lib/auth/session-reset";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ImpersonationBanner } from "@/components/dashboard/ImpersonationBanner";
import { ImpersonationHydrator } from "@/components/dashboard/ImpersonationHydrator";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { GetUnreadTicketCounts } from "./actions/support";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import type { BottomNavTab, MoreNavItem } from "@/components/dashboard/MobileBottomNav";
import { GlobalSearch } from "./components/global-search/GlobalSearch";

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
        items: [
          { title: "Tables", url: "/dashboard/tables" },
          { title: "Service Charge", url: "/dashboard/tables/service-charge" },
        ],
      },
      {
        title: "Reservations",
        url: "/dashboard/reservations",
        icon: CalendarClock,
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
        title: "86'd Items",
        url: "/dashboard/menu/out-of-stock",
        icon: CircleSlash,
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
        title: "Kiosk",
        url: "/dashboard/kiosk",
        icon: MonitorPlay,
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
        title: "Subscriptions",
        url: "/dashboard/subscriptions",
        icon: FileText,
      },
      {
        title: "Devices",
        url: "/dashboard/devices",
        icon: Monitor,
      },
      {
        title: "Cash Drawers",
        url: "/dashboard/cash-drawers",
        icon: Banknote,
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
          {
            title: "Online Ordering",
            url: "/dashboard/reports/online-ordering",
          },
          {
            title: "Cash Drawers",
            url: "/dashboard/reports/cash-drawers",
          },
          {
            title: "Tax Report",
            url: "/dashboard/reports/tax",
          },
          {
            title: "Kitchen Performance",
            url: "/dashboard/reports/kitchen-performance",
          },
          {
            title: "Discrepancy",
            url: "/dashboard/reports/discrepancy",
          },
        ],
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
        title: "Invoices",
        url: "/dashboard/invoices",
        icon: FileText,
      },
      {
        title: "Payments",
        url: "/dashboard/payments",
        icon: CreditCard,
      },
      {
        title: "Tips",
        url: "/dashboard/tips",
        icon: DollarSign,
        items: [
          { title: "Tip Distribution", url: "/dashboard/tips" },
          { title: "My Tips", url: "/dashboard/tips/my-tips" },
        ],
      },
      {
        title: "TSYS Disputes",
        url: "/dashboard/payments/disputes",
        icon: ShieldAlert,
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
    url: "/dashboard/support",
    icon: MessageCircle,
  },
];

function MerchantSidebar() {
  const { data: userInfo, isLoading } = useUserInfo();
  const pathname = usePathname();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();

  // Single-location accounts see a singular "Location" nav item; the locations
  // page renders that one store's detail instead of the list-with-add view.
  const isSingleLocation = useIsSingleLocation();

  const handleSignOut = async () => {
    await resetClientSession(queryClient);
    await signOut();
    window.location.href = "/sign-in";
  };

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
                              <Collapsible defaultOpen={isOrdersOpen} className="group">
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
                              <Collapsible defaultOpen={isReportsOpen} className="group">
                                <div className="flex items-center">
                                  <SidebarMenuButton
                                    asChild
                                    isActive={isReportsActive}
                                    className="flex-1"
                                  >
                                    <Link href={menuItem.url}>
                                      <menuItem.icon className="h-4 w-4" />
                                      <span>{menuItem.title}</span>
                                    </Link>
                                  </SidebarMenuButton>
                                  <CollapsibleTrigger asChild>
                                    <button className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors shrink-0">
                                      <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                    </button>
                                  </CollapsibleTrigger>
                                </div>
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

                        // Check if this is the Tables item that needs sub-menu
                        if (menuItem.title === "Tables") {
                          const isTablesActive =
                            pathname === "/dashboard/tables" ||
                            pathname.startsWith("/dashboard/tables/");
                          const isTablesOpen =
                            pathname.startsWith("/dashboard/tables");

                          return (
                            <SidebarMenuItem key={menuItem.title}>
                              <Collapsible defaultOpen={isTablesOpen} className="group">
                                <CollapsibleTrigger asChild>
                                  <SidebarMenuButton
                                    isActive={isTablesActive}
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

                        // Check if this is the Tips item that needs sub-menu
                        if (menuItem.title === "Tips") {
                          const isTipsActive =
                            pathname === "/dashboard/tips" ||
                            pathname.startsWith("/dashboard/tips/");
                          const isTipsOpen = pathname.startsWith("/dashboard/tips");

                          return (
                            <SidebarMenuItem key={menuItem.title}>
                              <Collapsible defaultOpen={isTipsOpen} className="group">
                                <CollapsibleTrigger asChild>
                                  <SidebarMenuButton isActive={isTipsActive} className="w-full">
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

                        // Regular menu item — the Locations item reads singular
                        // "Location" for single-location accounts; the locations
                        // page itself renders that one store's detail (no list).
                        const isSingleLocationNav =
                          menuItem.title === "Locations" && isSingleLocation;
                        const navTitle = isSingleLocationNav
                          ? "Location"
                          : menuItem.title;
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
                                <span>{navTitle}</span>
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
              className="group"
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
                        "/dashboard/settings/pos"
                      )}
                    >
                      <Link href="/dashboard/settings/pos">
                        <Settings2 className="h-3 w-3" />
                        <span>POS Settings</span>
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
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      isActive={pathname.startsWith("/dashboard/settings/tips")}
                    >
                      <Link href="/dashboard/settings/tips">
                        <DollarSign className="h-3 w-3" />
                        <span>Tip Configuration</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      isActive={pathname.startsWith("/dashboard/settings/loyalty")}
                    >
                      <Link href="/dashboard/settings/loyalty">
                        <Gift className="h-3 w-3" />
                        <span>Loyalty</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          </SidebarMenuItem>
          {/* Get Help */}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/dashboard/support")}
            >
              <Link href="/dashboard/support">
                <MessageCircle className="h-4 w-4" />
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
              <Link href="/dashboard/profile" className="flex items-center gap-2 flex-1 min-w-0">
                <Avatar className="h-8 w-8 shrink-0">
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
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
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
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const {
    selectedLocationId,
    locations,
    setSelectedLocation,
    isLoading,
    isInitialized,
  } = useLocationStore();
  const selectedLocation = useSelectedLocation();
  const isAllLocations = useIsAllLocations();
  const isSingleLocation = useIsSingleLocation();
  const singleLocationName = useSingleLocationName();

  // Check if user is merchant.owner or merchant.admin — both can view All Locations
  const isMerchantOwner = userRole === "merchant.owner" || userRole === "merchant.admin";

  // Multi-location pickers never list inactive locations: an inactive store
  // cannot be a switch target and must not appear in the picker.
  const pickableLocations = locations.filter((l) => l.is_active);

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

  // Show skeleton only while genuinely loading or before the store has hydrated
  if (!isInitialized || isLoading) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-muted/50">
        <Skeleton className="h-3.5 w-3.5 rounded-full" />
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  // Initialized, not loading, but no locations: first-time merchant.
  // Show an actionable CTA instead of a forever-spinning skeleton.
  if (locations.length === 0) {
    return (
      <Link
        href="/dashboard/locations/new"
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors"
      >
        <MapPin className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-primary">Add your first location</span>
      </Link>
    );
  }

  // Single-location accounts manage one menu (the core). There is nothing to
  // pick, so show the store name as static text — no picker, no "All Locations".
  if (isSingleLocation) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-muted/50">
        <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="max-w-40 truncate font-medium">
          {singleLocationName ?? "Your store"}
        </span>
      </div>
    );
  }

  const displayName = isAllLocations
    ? "All Locations"
    : selectedLocation?.name ||
      locations.find((l) => l.id === selectedLocationId)?.name ||
      "Location";

  // Shared location list content used in both dropdown and mobile sheet
  const locationListContent = (onSelect?: () => void, variant: 'dropdown' | 'sheet' = 'dropdown') => {
    if (variant === 'sheet') {
      return (
        <>
          {isMerchantOwner && (
            <>
              <button
                onClick={() => { handleLocationChange("all"); onSelect?.(); }}
                className={cn(
                  "flex items-center w-full text-left px-3 py-3 rounded-lg text-sm transition-colors",
                  selectedLocationId === "all"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Building2 className="mr-2 h-4 w-4 shrink-0" />
                <span className="flex-1">All Locations</span>
                {selectedLocationId === "all" && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">Active</Badge>
                )}
              </button>
              {pickableLocations.length > 0 && <div className="my-1 border-t" />}
            </>
          )}
          {pickableLocations.length > 0 && (
            <>
              {isMerchantOwner && (
                <p className="px-3 py-1 text-xs text-muted-foreground">Switch to</p>
              )}
              {pickableLocations.map((location) => {
                const isPrimary = (location as any).is_primary_location === true;
                return (
                  <button
                    key={location.id}
                    onClick={() => { handleLocationChange(location.id); onSelect?.(); }}
                    className={cn(
                      "flex items-center w-full text-left px-3 py-3 rounded-lg text-sm transition-colors",
                      selectedLocationId === location.id
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <MapPin className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate flex-1">{location.name}</span>
                    <div className="ml-auto flex items-center gap-1">
                      {isPrimary && (
                        <Badge variant="default" className="text-[10px] px-1.5 bg-primary text-primary-foreground">Primary</Badge>
                      )}
                      {!location.is_active && (
                        <Badge variant="outline" className="text-[10px] px-1.5">Inactive</Badge>
                      )}
                      {selectedLocationId === location.id && (
                        <Badge variant="secondary" className="text-[10px] px-1.5">Active</Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </>
      );
    }

    return (
      <>
        {isMerchantOwner && (
          <>
            <DropdownMenuItem
              onClick={() => { handleLocationChange("all"); onSelect?.(); }}
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
            {pickableLocations.length > 0 && <DropdownMenuSeparator />}
          </>
        )}
        {pickableLocations.length > 0 && (
          <>
            {isMerchantOwner && (
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Switch to
              </DropdownMenuLabel>
            )}
            {pickableLocations.map((location, index) => {
              const isPrimary = (location as any).is_primary_location === true;
              return (
                <DropdownMenuItem
                  key={location.id}
                  onClick={() => { handleLocationChange(location.id); onSelect?.(); }}
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
      </>
    );
  };

  return (
    <>
      {/* Mobile compact pill — visible below md, opens a bottom sheet */}
      <button
        onClick={() => setMobileSheetOpen(true)}
        className={cn(
          "md:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm transition-all duration-200 max-w-[140px]",
          isAllLocations
            ? "bg-muted/50 hover:bg-muted"
            : "bg-primary/10 border border-primary/20 hover:bg-primary/20"
        )}
      >
        {isAllLocations ? (
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
        )}
        <span className={cn("truncate text-xs", isAllLocations ? "text-muted-foreground" : "font-medium")}>
          {displayName}
        </span>
      </button>

      {/* Mobile location sheet */}
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetContent side="bottom" className="h-[60vh] overflow-y-auto">
          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Select Location
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col">
            {locationListContent(() => setMobileSheetOpen(false), 'sheet')}
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop dropdown — hidden below md */}
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
                "max-w-[100px] truncate transition-colors duration-200",
                isAllLocations ? "text-muted-foreground" : "font-medium"
              )}
            >
              {displayName}
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
          {locationListContent()}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export default function MerchantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global ⌘K / Ctrl+K opens the command palette from anywhere in the dashboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  const { isLoaded, isSignedIn } = useSession();
  const { data: userInfo } = useUserInfo();
  const router = useRouter();
  const pathname = usePathname();
  const isOnboardingRoute = pathname?.startsWith("/dashboard/onboarding") ?? false;
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;
  const userRole = userInfo?.members?.[0]?.role;
  const {
    data: locations,
    isLoading: locationsLoading,
    isFetching: locationsFetching,
  } = useLocations(clerkOrgId || "", userInfo?.id || "");

  // First-location gate (bidirectional):
  //  • A merchant with zero locations is forced into the onboarding wizard.
  //  • A merchant that already has a location is kept OUT of the wizard — so
  //    landing on (or manually re-visiting) the onboarding route after
  //    completing it redirects to the dashboard instead of resetting to Step 1.
  useEffect(() => {
    if (
      !clerkOrgId ||
      locationsLoading ||
      // Never act on an in-flight refetch: right after a merchant completes the
      // onboarding wizard the locations query is being refetched, and the cache
      // still holds the stale empty list. Acting on that stale read bounces the
      // user back to Step 1 (the onboarding loop). Wait for fresh data.
      locationsFetching ||
      !Array.isArray(locations)
    ) {
      return;
    }
    if (!isOnboardingRoute && locations.length === 0) {
      router.replace("/dashboard/onboarding/first-location");
    } else if (isOnboardingRoute && locations.length > 0) {
      router.replace("/dashboard");
    }
  }, [
    clerkOrgId,
    locations,
    locationsLoading,
    locationsFetching,
    isOnboardingRoute,
    router,
  ]);

  // Zustand store
  const {
    selectedLocationId,
    setSelectedLocation,
    setLocations,
    setLoading,
    initialize,
    isInitialized,
  } = useLocationStore();

  // Check if user is merchant.owner or merchant.admin
  const isMerchantOwner = userRole === "merchant.owner" || userRole === "merchant.admin";

  // Effective reach for this identity: count ACTIVE locations only, so an
  // inactive store never inflates the count. Drives the single-location lock.
  const activeLocationCount = Array.isArray(locations)
    ? locations.filter((l) => l.is_active).length
    : 0;

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

    // Update locations (store will validate selected location automatically).
    // Call unconditionally — setLocations() internally guards against clearing
    // during transient refetches, and we NEED to call it on empty arrays so
    // validateSelectedLocation can repair stale persisted selectedLocationIds
    // (the "Viewing Unknown Location" bug for first-time merchants).
    setLocations(locations);

    // Single-location accounts manage one menu — the global core. Keep their
    // scope on 'all' (which omits location_id and writes the core) so we never
    // create per-location overlay rows. Multi-location accounts are untouched.
    if (
      activeLocationCount === 1 &&
      selectedLocationId !== "all"
    ) {
      setSelectedLocation("all");
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
    activeLocationCount,
  ]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      redirect("/");
    }
  }, [isLoaded, isSignedIn]);

  if (isMounted && !isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  if (isOnboardingRoute) {
    return (
      <>
        <ImpersonationHydrator />
        <ImpersonationBanner />
        <main aria-label="Onboarding" className="min-h-screen">
          {children}
        </main>
      </>
    );
  }

  const dashboardBottomTabs: BottomNavTab[] = [
    { id: "home", label: "Home", icon: LayoutDashboard, url: "/dashboard" },
    { id: "orders", label: "Orders", icon: ShoppingCart, url: "/dashboard/orders" },
    { id: "menu", label: "Menu", icon: Utensils, url: "/dashboard/menu" },
    { id: "staff", label: "Staff", icon: Users, url: "/dashboard/staff" },
  ];

  // Mirror the sidebar's singular-"Location" label for the mobile menu; the
  // locations page renders the single-store detail itself.
  const dashboardMoreItems: MoreNavItem[] = [
    {
      title: activeLocationCount === 1 ? "Location" : "Locations",
      url: "/dashboard/locations",
      icon: MapPin,
    },
    { title: "Tables", url: "/dashboard/tables", icon: Coffee },
    { title: "Reservations", url: "/dashboard/reservations", icon: CalendarClock },
    { title: "Schedules", url: "/dashboard/schedules", icon: Calendar },
    { title: "Items", url: "/dashboard/menu/items", icon: List },
    { title: "Categories", url: "/dashboard/menu/categories", icon: Tag },
    { title: "Discounts", url: "/dashboard/discounts", icon: Banknote },
    { title: "Modifiers", url: "/dashboard/menu/modifiers", icon: Layers },
    { title: "Online Ordering", url: "/dashboard/online-ordering", icon: Globe },
    { title: "Customers", url: "/dashboard/customers", icon: User },
    { title: "Inventory", url: "/dashboard/inventory", icon: Package },
    { title: "Subscriptions", url: "/dashboard/subscriptions", icon: FileText },
    { title: "Devices", url: "/dashboard/devices", icon: Monitor },
    { title: "Cash Drawers", url: "/dashboard/cash-drawers", icon: Banknote },
    { title: "Audit Logs", url: "/dashboard/audit-logs", icon: GitCompare },
    { title: "Reports", url: "/dashboard/reports", icon: BarChart3 },
    { title: "Transactions", url: "/dashboard/transactions", icon: Receipt },
    { title: "Invoices", url: "/dashboard/invoices", icon: FileText },
    { title: "Payments", url: "/dashboard/payments", icon: CreditCard },
    { title: "Tips", url: "/dashboard/tips", icon: DollarSign },
    { title: "TSYS Disputes", url: "/dashboard/payments/disputes", icon: ShieldAlert },
    { title: "Settings", url: "/dashboard/settings", icon: Settings },
    { title: "Get Help", url: "/dashboard/support", icon: MessageCircle },
  ];

  // h-svh + overflow-hidden caps the shell at the viewport. The provider's own
  // `min-h-svh` is only a floor, so the wrapper could grow past the viewport
  // (the impersonation banner sits inside <main> alongside its h-svh column)
  // and the window scrolled as well — two scrollbars, with dead space under
  // the content. #main-content below is the single intended scroll container.
  return (
    <SidebarProvider className="dashboard-sidebar-theme h-svh overflow-hidden">
      <ImpersonationHydrator />
      <MerchantSidebar />
      {/* h-svh + min-h-0 constrain this column to the viewport so #main-content
          below can actually scroll. Without the floor, `flex-1` lets the scroll
          container grow to fit its content — it never scrolls, the window
          scrolls instead, and any `position: sticky` inside it never triggers. */}
      <main aria-label="Dashboard content" className="h-svh min-h-0 flex-1 flex flex-col min-w-0 bg-background">
        <ImpersonationBanner />
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
          <SidebarTrigger className="-ml-1 hidden sm:flex" />
          <h1 className="text-base md:text-sm lg:text-base font-semibold truncate flex-1 min-w-0">Merchant Dashboard</h1>
          <LocationIndicator userRole={userRole} />
          <div className="ml-auto flex flex-row items-center gap-1 sm:gap-2">
            <AnimatedThemeToggler />
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:flex"
              onClick={() => setSearchOpen(true)}
              aria-label="Search (⌘K)"
              title="Search (⌘K)"
            >
              <Search className="h-4 w-4" />
            </Button>
            <NotificationBell
              fetchCounts={GetUnreadTicketCounts}
              href="/dashboard/support"
              queryKey="merchant-unread-ticket-counts"
            />
          </div>
        </header>
        <div id="main-content" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 pb-20 sm:pb-6">{children}</div>
      </main>
      <MobileBottomNav tabs={dashboardBottomTabs} moreItems={dashboardMoreItems} />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarProvider>
  );
}
