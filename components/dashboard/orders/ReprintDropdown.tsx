"use client";

import * as React from "react";
import { Printer, ChevronDown, Loader2, Utensils, Receipt, Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getPrintersForLocation,
  reprintReceipt,
  type PrinterDevice,
  type ReprintReceiptType,
} from "@/app/actions/orders/reprint-receipt";

/** Map receipt type to preferred device_type for default printer selection */
const RECEIPT_TYPE_TO_DEVICE_TYPE: Record<ReprintReceiptType, string> = {
  customer: "receipt_printer",
  kitchen: "kitchen_printer",
  bar: "label_printer",
};

function getDefaultPrinterForType(
  printers: PrinterDevice[],
  receiptType: ReprintReceiptType
): PrinterDevice | null {
  const preferred = RECEIPT_TYPE_TO_DEVICE_TYPE[receiptType];
  return printers.find((p) => p.device_type === preferred) ?? printers[0] ?? null;
}
import { toast } from "sonner";

const RECEIPT_TYPE_LABELS: Record<ReprintReceiptType, string> = {
  customer: "Customer Receipt",
  kitchen: "Kitchen Ticket",
  bar: "Bar Ticket",
};

const RECEIPT_TYPE_ICONS: Record<ReprintReceiptType, React.ReactNode> = {
  customer: <Receipt className="h-4 w-4" />,
  kitchen: <Utensils className="h-4 w-4" />,
  bar: <Wine className="h-4 w-4" />,
};

interface ReprintDropdownProps {
  orderId: string;
  locationId: string | null;
  /** Use "high" elevation when inside BottomSheet so dialog appears above it */
  dialogElevation?: "default" | "high";
  size?: "default" | "sm";
  variant?: "default" | "outline" | "ghost";
}

export function ReprintDropdown({
  orderId,
  locationId,
  dialogElevation = "default",
  size = "sm",
  variant = "outline",
}: ReprintDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [printing, setPrinting] = React.useState(false);
  const [printers, setPrinters] = React.useState<PrinterDevice[]>([]);
  const [loadingPrinters, setLoadingPrinters] = React.useState(false);

  const fetchPrinters = React.useCallback(async () => {
    if (!locationId) return;
    setLoadingPrinters(true);
    try {
      const result = await getPrintersForLocation(locationId);
      if (result.success) {
        setPrinters(result.printers);
      }
    } finally {
      setLoadingPrinters(false);
    }
  }, [locationId]);

  React.useEffect(() => {
    if (open && locationId) {
      fetchPrinters();
    }
  }, [open, locationId, fetchPrinters]);

  const handleReprint = async (
    receiptType: ReprintReceiptType,
    deviceId?: string
  ) => {
    const targetDevice = deviceId
      ? printers.find((p) => p.id === deviceId)
      : getDefaultPrinterForType(printers, receiptType);
    if (!targetDevice) {
      toast.error(
        receiptType === "customer"
          ? "No receipt printer configured"
          : receiptType === "kitchen"
            ? "No kitchen printer configured"
            : "No bar printer configured"
      );
      return;
    }
    setPrinting(true);
    setOpen(false);
    setPickerOpen(false);
    try {
      const result = await reprintReceipt({
        orderId,
        receiptType,
        deviceId: targetDevice.id,
      });
      if (result.success) {
        toast.success(`${RECEIPT_TYPE_LABELS[receiptType]} queued for print`);
      } else {
        toast.error(result.message ?? "Print failed");
      }
    } catch {
      toast.error("Print failed");
    } finally {
      setPrinting(false);
    }
  };

  const handleSelectPrinter = () => {
    setOpen(false);
    setPickerOpen(true);
  };

  const hasPrinters = printers.length > 0;
  const defaultCustomer = getDefaultPrinterForType(printers, "customer");
  const defaultKitchen = getDefaultPrinterForType(printers, "kitchen");
  const defaultBar = getDefaultPrinterForType(printers, "bar");

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            disabled={loadingPrinters || !hasPrinters || printing}
          >
            {printing ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-1.5" />
            )}
            Reprint
            <ChevronDown className="h-3.5 w-3.5 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {loadingPrinters ? (
            <DropdownMenuItem disabled>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading printers…
            </DropdownMenuItem>
          ) : !hasPrinters ? (
            <DropdownMenuItem disabled>
              <Printer className="h-4 w-4 mr-2" />
              No printers configured
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                onClick={() => handleReprint("customer")}
                disabled={!defaultCustomer}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="flex items-center gap-2">
                  {RECEIPT_TYPE_ICONS.customer}
                  {RECEIPT_TYPE_LABELS.customer}
                </span>
                {defaultCustomer && (
                  <span className="text-muted-foreground text-xs pl-6">
                    → {defaultCustomer.device_name}
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleReprint("kitchen")}
                disabled={!defaultKitchen}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="flex items-center gap-2">
                  {RECEIPT_TYPE_ICONS.kitchen}
                  {RECEIPT_TYPE_LABELS.kitchen}
                </span>
                {defaultKitchen && (
                  <span className="text-muted-foreground text-xs pl-6">
                    → {defaultKitchen.device_name}
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleReprint("bar")}
                disabled={!defaultBar}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="flex items-center gap-2">
                  {RECEIPT_TYPE_ICONS.bar}
                  {RECEIPT_TYPE_LABELS.bar}
                </span>
                {defaultBar && (
                  <span className="text-muted-foreground text-xs pl-6">
                    → {defaultBar.device_name}
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSelectPrinter}>
                <Printer className="h-4 w-4 mr-2" />
                Select Printer…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent
          showCloseButton
          elevation={dialogElevation}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Select printer</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {printers.map((printer) => (
              <div
                key={printer.id}
                className="flex flex-col gap-1 rounded-lg border p-3 hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{printer.device_name}</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {printer.device_type.replace("_", " ")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReprint("customer", printer.id)}
                    disabled={printing}
                  >
                    {printing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      RECEIPT_TYPE_LABELS.customer
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReprint("kitchen", printer.id)}
                    disabled={printing}
                  >
                    {RECEIPT_TYPE_LABELS.kitchen}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReprint("bar", printer.id)}
                    disabled={printing}
                  >
                    {RECEIPT_TYPE_LABELS.bar}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
