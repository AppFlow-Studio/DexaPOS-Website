"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Truck,
  Package,
  MapPin,
  Plus,
  Trash2,
  Star,
  Phone,
  Mail,
  Building2,
  DollarSign,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/phone";
import { toast } from "sonner";
import { VendorWithStats } from "../hooks/useInventoryManagement";
import { useIsSingleLocation } from "@/stores/location-store";
import {
  VendorItemWithDetails,
  LocationVendorWithDetails,
} from "@/types/inventory";
import {
  GetVendorItems,
  GetVendorDetails,
  RemoveVendorItem,
} from "@/app/dashboard/actions/vendor-items";
import {
  GetLocationsForVendor,
  RemoveLocationLink,
} from "@/app/dashboard/actions/location-vendors";
import { LinkLocationDialog } from "./LinkLocationDialog";
import { LocationPricingSheet } from "./LocationPricingSheet";
import { AddVendorItemDialog } from "./AddVendorItemDialog";

interface VendorDetailSheetProps {
  vendor: VendorWithStats | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerkOrgId: string;
}

export function VendorDetailSheet({
  vendor,
  open,
  onOpenChange,
  clerkOrgId,
}: VendorDetailSheetProps) {
  const queryClient = useQueryClient();
  const isSingleLocation = useIsSingleLocation();
  const [activeTab, setActiveTab] = useState("catalog");
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isLinkLocationOpen, setIsLinkLocationOpen] = useState(false);

  // Pricing Sheet State
  const [pricingItem, setPricingItem] = useState<VendorItemWithDetails | null>(
    null
  );
  const [isPricingSheetOpen, setIsPricingSheetOpen] = useState(false);

  // Fetch vendor details with stats
  const { data: vendorDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["vendor-details", vendor?.id],
    queryFn: () => GetVendorDetails(vendor!.id),
    enabled: !!vendor?.id && open,
  });

  // Fetch vendor items
  const { data: vendorItemsData, isLoading: isLoadingItems } = useQuery({
    queryKey: ["vendor-items", vendor?.id],
    queryFn: () => GetVendorItems(vendor!.id),
    enabled: !!vendor?.id && open && activeTab === "catalog",
  });

  // Fetch linked locations
  const { data: locationsData, isLoading: isLoadingLocations } = useQuery({
    queryKey: ["vendor-locations", vendor?.id],
    queryFn: () => GetLocationsForVendor(vendor!.id),
    enabled: !!vendor?.id && open && activeTab === "locations",
  });

  const vendorItems = vendorItemsData?.data || [];
  const linkedLocations = locationsData?.data || [];

  // Remove item mutation
  const removeItemMutation = useMutation({
    mutationFn: (id: string) => RemoveVendorItem(id),
    onSuccess: (result) => {
      if (result.error) toast.error(result.error);
      else {
        toast.success("Item removed from catalog");
        queryClient.invalidateQueries({
          queryKey: ["vendor-items", vendor?.id],
        });
        queryClient.invalidateQueries({
          queryKey: ["vendor-details", vendor?.id],
        });
      }
    },
    onError: () => toast.error("Failed to remove item"),
  });

  // Remove location link mutation
  const removeLocationMutation = useMutation({
    mutationFn: (id: string) => RemoveLocationLink(id),
    onSuccess: (result) => {
      if (result.error) toast.error(result.error);
      else {
        toast.success("Location unlinked");
        queryClient.invalidateQueries({
          queryKey: ["vendor-locations", vendor?.id],
        });
        queryClient.invalidateQueries({
          queryKey: ["vendor-details", vendor?.id],
        });
      }
    },
    onError: () => toast.error("Failed to unlink location"),
  });

  if (!vendor) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden border-0 bg-background p-0 max-sm:top-auto max-sm:translate-y-0 rounded-none sm:h-[640px] sm:max-h-[85vh] sm:w-[calc(100%-1rem)] sm:max-w-[600px] sm:rounded-3xl"
          overlayClassName="bg-black/35 backdrop-blur-md"
        >
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="shrink-0 p-2.5 rounded-2xl border-0 bg-muted/60">
                <Truck className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl">{vendor.name}</DialogTitle>
                <DialogDescription className="mt-1">
                  {vendor.contact_name || "No contact info"}
                </DialogDescription>
                {!isSingleLocation && (
                  <div className="flex items-center gap-2 mt-2">
                    {vendor.location_id ? (
                      <Badge
                        variant="outline"
                        className="gap-1 rounded-full border-0 bg-muted/60 text-muted-foreground"
                      >
                        <MapPin className="h-3 w-3" />
                        Local Vendor
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 rounded-full border-0 bg-muted/60 text-muted-foreground"
                      >
                        <Building2 className="h-3 w-3" />
                        Global Vendor
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full h-full flex flex-col"
            >
              <div className="px-6 pt-1">
                <TabsList className="w-full grid grid-cols-3 mb-4 rounded-2xl border-0 bg-muted/60 p-1 [&>button]:rounded-xl [&>button]:border-0">
                  <TabsTrigger value="catalog">Catalog</TabsTrigger>
                  <TabsTrigger value="locations">Locations</TabsTrigger>
                  <TabsTrigger value="info">Info</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 px-6 pb-6">
                {/* CATALOG TAB */}
                <TabsContent value="catalog" className="mt-0 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Items Catalog
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Items supplied by this vendor
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setIsAddItemOpen(true)}
                      className="h-8 rounded-full"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Item
                    </Button>
                  </div>

                  {isLoadingItems ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                      ))}
                    </div>
                  ) : vendorItems.length === 0 ? (
                    <div className="text-center py-12 border rounded-2xl border-dashed">
                      <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        No items in catalog
                      </p>
                      <Button
                        variant="link"
                        onClick={() => setIsAddItemOpen(true)}
                        className="text-primary"
                      >
                        Add first item
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {vendorItems.map((item) => (
                        <VendorItemRow
                          key={item.id}
                          item={item}
                          onRemove={() => removeItemMutation.mutate(item.id)}
                          isRemoving={removeItemMutation.isPending}
                          onPricingClick={() => {
                            setPricingItem(item);
                            setIsPricingSheetOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* LOCATIONS TAB */}
                <TabsContent value="locations" className="mt-0 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Served Locations
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Locations this vendor delivers to
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsLinkLocationOpen(true)}
                      className="h-8 rounded-full"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Link Location
                    </Button>
                  </div>

                  {isLoadingLocations ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-2xl" />
                      ))}
                    </div>
                  ) : linkedLocations.length === 0 ? (
                    <div className="text-center py-12 border rounded-2xl border-dashed">
                      <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        Not linked to any locations
                      </p>
                      <Button
                        variant="link"
                        onClick={() => setIsLinkLocationOpen(true)}
                        className="text-primary"
                      >
                        Link a location
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {linkedLocations.map((link) => (
                        <LocationLinkRow
                          key={link.id}
                          link={link}
                          onRemove={() =>
                            removeLocationMutation.mutate(link.id)
                          }
                          isRemoving={removeLocationMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* INFO TAB (Existing Contact Card) */}
                <TabsContent value="info" className="mt-0 space-y-6">
                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        Contact Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 text-sm">
                        <div className="flex items-center gap-3">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{vendor.phone ? formatPhoneForDisplay(vendor.phone) : "N/A"}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span>{vendor.email || "N/A"}</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p>{vendor.address_line1 || "No address"}</p>
                            {vendor.city && (
                              <p className="text-muted-foreground text-xs">
                                {vendor.city}, {vendor.state} {vendor.zip_code}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-2 gap-4">
                    <Card className="rounded-2xl">
                      <CardContent className="p-4 flex flex-col items-center justify-center">
                        <p className="text-2xl font-bold">
                          {vendorDetails?.data?.items_count || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Items</p>
                      </CardContent>
                    </Card>
                    <Card className="rounded-2xl">
                      <CardContent className="p-4 flex flex-col items-center justify-center">
                        <p className="text-2xl font-bold">
                          {vendorDetails?.data?.locations_count || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Locations
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <AddVendorItemDialog
        vendorId={vendor.id}
        vendorName={vendor.name}
        clerkOrgId={clerkOrgId}
        open={isAddItemOpen}
        onOpenChange={setIsAddItemOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({
            queryKey: ["vendor-items", vendor.id],
          });
          queryClient.invalidateQueries({
            queryKey: ["vendor-details", vendor.id],
          });
        }}
      />

      <LinkLocationDialog
        vendorId={vendor.id}
        vendorName={vendor.name}
        clerkOrgId={clerkOrgId}
        open={isLinkLocationOpen}
        onOpenChange={setIsLinkLocationOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({
            queryKey: ["vendor-locations", vendor.id],
          });
          queryClient.invalidateQueries({
            queryKey: ["vendor-details", vendor.id],
          });
        }}
      />

      {/* Pricing Sheet */}
      <LocationPricingSheet
        vendorId={vendor.id}
        item={pricingItem}
        open={isPricingSheetOpen}
        onOpenChange={setIsPricingSheetOpen}
      />
    </>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function VendorItemRow({
  item,
  onRemove,
  isRemoving,
  onPricingClick,
}: {
  item: VendorItemWithDetails;
  onRemove: () => void;
  isRemoving: boolean;
  onPricingClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-2xl border-0 bg-muted/45 group hover:bg-muted/65 transition-colors">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl border-0 bg-background">
          <Package className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {item.inventory_item?.name || "Unknown Item"}
            </span>
            {item.is_preferred && (
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {item.vendor_sku && <span>SKU: {item.vendor_sku}</span>}
            {item.pack_size && <span>• {item.pack_size}</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div
            className="font-semibold text-sm text-foreground flex items-center gap-1 cursor-pointer hover:underline"
            onClick={onPricingClick}
            title="Set pricing per location"
          >
            <DollarSign className="h-3.5 w-3.5" />
            {item.default_cost.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">
            per {item.inventory_item?.unit_type || "unit"}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
          onClick={onRemove}
          disabled={isRemoving}
        >
          {isRemoving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

function LocationLinkRow({
  link,
  onRemove,
  isRemoving,
}: {
  link: LocationVendorWithDetails;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-2xl border-0 bg-muted/45 group hover:bg-muted/65 transition-colors">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl border-0 bg-background">
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {link.location?.name || "Unknown Location"}
            </span>
            {link.is_preferred && (
              <Badge
                variant="secondary"
                className="text-[10px] h-4 px-1.5 gap-0.5 rounded-full"
              >
                <Star className="h-2.5 w-2.5 fill-current" />
                Preferred
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {link.account_number ? (
              <span>Acct: {link.account_number}</span>
            ) : (
              <span className="italic">No account number</span>
            )}
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-full text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
        onClick={onRemove}
        disabled={isRemoving}
        title="Unlink Location"
      >
        {isRemoving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
