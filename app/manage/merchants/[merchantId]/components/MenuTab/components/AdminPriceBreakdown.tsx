
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DollarSign, Globe, Building2, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { AdminMenuItem } from "@/lib/queries/use-admin-merchant"

interface AdminPriceBreakdownProps {
  item: AdminMenuItem;
  isAllLocations: boolean;
  currentLocationName: string;
}

export function AdminPriceBreakdown({
  item,
  isAllLocations,
  currentLocationName,
}: AdminPriceBreakdownProps) {
  const basePrice = item.base_price;
  const baseCashPrice = item.base_cash_price;

  // Check for location overrides from menu_item data
  // Note: AdminMenuItem from queries might have location_override mapped differently
  // but looking at ItemFormSheet, it accesses item.location_override?.custom_price
  
  const locationOverride = item.location_override;
  const hasLocationOverride = item.has_location_override;

  // Effective price calculation
  const effectivePrice = item.effective_price ?? basePrice;
  const effectiveCashPrice = item.effective_cash_price ?? baseCashPrice;

  return (
    <Card>
      <CardHeader className="pb-3 border-b bg-muted/20">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-500" />
          Price Hierarchy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {/* Level 1 - Global Base */}
        <div
          className={cn(
            "flex items-center justify-between p-3 rounded-lg border",
            isAllLocations ? "bg-emerald-50 border-emerald-200" : "bg-muted/30"
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                isAllLocations ? "bg-emerald-500 text-white" : "bg-muted"
              )}
            >
              1
            </div>
            <Globe className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium">Global Base</span>
            {isAllLocations && (
              <Badge variant="secondary" className="text-xs bg-emerald-100/50 text-emerald-700 border-emerald-200">
                Active Edit
              </Badge>
            )}
          </div>
          <div className="text-right">
            <div
              className={cn(
                "font-semibold",
                isAllLocations && "text-emerald-600"
              )}
            >
              ${basePrice?.toFixed(2)}
            </div>
            {baseCashPrice && (
              <div className="text-xs text-muted-foreground">
                Cash: ${baseCashPrice.toFixed(2)}
              </div>
            )}
          </div>
        </div>

        {/* Level 2 - Location Override */}
        {!isAllLocations && (
          <div
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border",
              hasLocationOverride
                ? "bg-blue-50 border-blue-200"
                : "bg-muted/30 border-dashed"
            )}
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                  hasLocationOverride ? "bg-blue-500 text-white" : "bg-muted"
                )}
              >
                2
              </div>
              <Building2 className="h-4 w-4 text-blue-600" />
              <div>
                <span className="text-sm font-medium">Location Override</span>
                <p className="text-xs text-muted-foreground max-w-[150px] truncate">
                  {currentLocationName}
                </p>
              </div>
              {hasLocationOverride ? (
                 <Badge
                  variant="outline"
                  className="text-xs bg-blue-50 text-blue-600 border-blue-200"
                >
                  Active Edit
                </Badge>
              ) : (
                 <Badge variant="outline" className="text-xs font-normal text-muted-foreground border-dashed">
                    Not Set
                 </Badge>
              )}
            </div>
            <div className="text-right">
              {hasLocationOverride ? (
                <>
                  <div className="font-semibold text-blue-600">
                    ${locationOverride?.custom_price?.toFixed(2)}
                  </div>
                  {locationOverride?.custom_cash_price && (
                    <div className="text-xs text-muted-foreground">
                      Cash: ${locationOverride?.custom_cash_price.toFixed(2)}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  Inherits Global
                </span>
              )}
            </div>
          </div>
        )}

        {/* Effective Price */}
        <div className="pt-3 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Effective Price</span>
            <div className="text-right">
              <span className="text-xl font-bold text-green-600">
                ${effectivePrice?.toFixed(2)}
              </span>
              {effectiveCashPrice && (
                <div className="text-xs text-muted-foreground">
                  Cash: ${effectiveCashPrice.toFixed(2)}
                </div>
              )}
            </div>
          </div>
          {!isAllLocations &&
            hasLocationOverride &&
            basePrice !== effectivePrice && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 p-2 rounded-md">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {effectivePrice < basePrice ? "Discounted" : "Increased"} by $
                  {Math.abs(effectivePrice - basePrice).toFixed(2)} for this location
                </span>
              </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
