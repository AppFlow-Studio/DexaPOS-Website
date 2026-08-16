"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Printer as PrinterIcon } from "lucide-react";
import {
  useCreatePrinter,
  useUpdatePrinter,
  Printer as PrinterRecord,
} from "../../hooks/usePrinters";

interface AddPrinterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationId: string;
  printerToEdit?: PrinterRecord;
}

const PRINTER_TYPES = [
  { value: "thermal", label: "Thermal" },
  { value: "impact", label: "Impact" },
  { value: "inkjet", label: "Inkjet" },
  { value: "laser", label: "Laser" },
];

const PRINTER_ROLES = [
  { value: "receipt", label: "Receipt" },
  { value: "kitchen", label: "Kitchen" },
  { value: "label", label: "Label" },
  { value: "report", label: "Report" },
];

const CONNECTION_TYPES = [
  { value: "network", label: "Network" },
  { value: "usb", label: "USB" },
  { value: "bluetooth", label: "Bluetooth" },
];

const PAPER_WIDTHS = [
  { value: "58", label: "58mm" },
  { value: "80", label: "80mm" },
];

export function AddPrinterDialog({
  open,
  onOpenChange,
  stationId,
  printerToEdit,
}: AddPrinterDialogProps) {
  const createMutation = useCreatePrinter();
  const updateMutation = useUpdatePrinter();
  const isEditing = !!printerToEdit;

  // Identity
  const [printerName, setPrinterName] = useState("");
  const [printerType, setPrinterType] = useState("thermal");
  const [printerModel, setPrinterModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [printerRole, setPrinterRole] = useState("receipt");

  // Connection
  const [connectionType, setConnectionType] = useState("network");
  const [networkAddress, setNetworkAddress] = useState("");
  const [networkPort, setNetworkPort] = useState<number | undefined>(undefined);
  const [bluetoothAddress, setBluetoothAddress] = useState("");
  const [usbDevicePath, setUsbDevicePath] = useState("");

  // Role flags
  const [isDefaultReceipt, setIsDefaultReceipt] = useState(false);
  const [isDefaultKitchen, setIsDefaultKitchen] = useState(false);
  const [printOrderTickets, setPrintOrderTickets] = useState(false);

  // Config
  const [paperWidth, setPaperWidth] = useState(80);
  const [maxCharsPerLine, setMaxCharsPerLine] = useState<number | undefined>(
    undefined,
  );
  const [printDensity, setPrintDensity] = useState<number | undefined>(
    undefined,
  );
  const [supportsAutoCut, setSupportsAutoCut] = useState(true);
  const [supportsBarcode, setSupportsBarcode] = useState(false);
  const [supportsQrCode, setSupportsQrCode] = useState(false);
  const [supportsLogo, setSupportsLogo] = useState(false);
  const [supportsCashDrawerKick, setSupportsCashDrawerKick] = useState(false);

  // Receipt
  const [receiptHeader, setReceiptHeader] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(true);
  const [printLogo, setPrintLogo] = useState(false);
  const [copies, setCopies] = useState<number>(1);

  useEffect(() => {
    if (printerToEdit) {
      setPrinterName(printerToEdit.printer_name);
      setPrinterType(printerToEdit.printer_type);
      setPrinterModel(printerToEdit.printer_model || "");
      setSerialNumber(printerToEdit.serial_number || "");
      setPrinterRole(printerToEdit.printer_role);
      setConnectionType(printerToEdit.connection_type);
      setNetworkAddress(
        printerToEdit.network_address
          ? String(printerToEdit.network_address)
          : "",
      );
      setNetworkPort(printerToEdit.network_port ?? undefined);
      setBluetoothAddress(printerToEdit.bluetooth_address || "");
      setUsbDevicePath(printerToEdit.usb_device_path || "");
      setIsDefaultReceipt(printerToEdit.is_default_receipt ?? false);
      setIsDefaultKitchen(printerToEdit.is_default_kitchen ?? false);
      setPrintOrderTickets(printerToEdit.print_order_tickets ?? false);
      setPaperWidth(printerToEdit.paper_width);
      setMaxCharsPerLine(printerToEdit.max_chars_per_line ?? undefined);
      setPrintDensity(printerToEdit.print_density ?? undefined);
      setSupportsAutoCut(printerToEdit.supports_auto_cut ?? true);
      setSupportsBarcode(printerToEdit.supports_barcode ?? false);
      setSupportsQrCode(printerToEdit.supports_qr_code ?? false);
      setSupportsLogo(printerToEdit.supports_logo ?? false);
      setSupportsCashDrawerKick(
        printerToEdit.supports_cash_drawer_kick ?? false,
      );
      setReceiptHeader(printerToEdit.receipt_header || "");
      setReceiptFooter(printerToEdit.receipt_footer || "");
      setAutoPrintReceipt(printerToEdit.auto_print_receipt ?? true);
      setPrintLogo(printerToEdit.print_logo ?? false);
      setCopies(printerToEdit.copies ?? 1);
    }
  }, [printerToEdit]);

  const resetForm = () => {
    setPrinterName("");
    setPrinterType("thermal");
    setPrinterModel("");
    setSerialNumber("");
    setPrinterRole("receipt");
    setConnectionType("network");
    setNetworkAddress("");
    setNetworkPort(undefined);
    setBluetoothAddress("");
    setUsbDevicePath("");
    setIsDefaultReceipt(false);
    setIsDefaultKitchen(false);
    setPrintOrderTickets(false);
    setPaperWidth(80);
    setMaxCharsPerLine(undefined);
    setPrintDensity(undefined);
    setSupportsAutoCut(true);
    setSupportsBarcode(false);
    setSupportsQrCode(false);
    setSupportsLogo(false);
    setSupportsCashDrawerKick(false);
    setReceiptHeader("");
    setReceiptFooter("");
    setAutoPrintReceipt(true);
    setPrintLogo(false);
    setCopies(1);
  };

  const handleClose = () => {
    onOpenChange(false);
    if (!isEditing) {
      setTimeout(resetForm, 200);
    }
  };

  const handleSubmit = async () => {
    if (!printerName.trim()) return;

    const payload = {
      printer_name: printerName.trim(),
      printer_type: printerType,
      printer_role: printerRole,
      printer_model: printerModel.trim() || null,
      serial_number: serialNumber.trim() || null,
      connection_type: connectionType,
      network_address:
        connectionType === "network" ? networkAddress.trim() || null : null,
      network_port: connectionType === "network" ? networkPort ?? null : null,
      bluetooth_address:
        connectionType === "bluetooth"
          ? bluetoothAddress.trim() || null
          : null,
      usb_device_path:
        connectionType === "usb" ? usbDevicePath.trim() || null : null,
      is_default_receipt: isDefaultReceipt,
      is_default_kitchen: isDefaultKitchen,
      print_order_tickets: printOrderTickets,
      paper_width: paperWidth,
      max_chars_per_line: maxCharsPerLine ?? null,
      print_density: printDensity ?? null,
      supports_auto_cut: supportsAutoCut,
      supports_barcode: supportsBarcode,
      supports_qr_code: supportsQrCode,
      supports_logo: supportsLogo,
      supports_cash_drawer_kick: supportsCashDrawerKick,
      receipt_header: receiptHeader.trim() || null,
      receipt_footer: receiptFooter.trim() || null,
      auto_print_receipt: autoPrintReceipt,
      print_logo: printLogo,
      copies,
    };

    try {
      if (isEditing && printerToEdit) {
        await updateMutation.mutateAsync({
          printerId: printerToEdit.id,
          input: payload,
        });
      } else {
        await createMutation.mutateAsync({
          station_id: stationId,
          ...payload,
        });
      }
      handleClose();
    } catch {
      // Error handled by mutation
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[90vh] sm:w-[calc(100%-1rem)] sm:max-w-[720px] sm:rounded-3xl">
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-0 bg-muted/60 text-foreground">
              <PrinterIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl">
                {isEditing ? "Edit Printer" : "Add Printer"}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {isEditing
                  ? "Update the printer identity, connection path, and print behavior."
                  : "Configure a new printer for this station with connection and receipt settings."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="thin-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="min-w-0 space-y-6 px-6 py-5">
          {/* Identity */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              Printer Identity
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="printerName">Name *</Label>
                <Input
                  id="printerName"
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                  placeholder="e.g., Front Receipt Printer"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="printerType">Type</Label>
                <Select value={printerType} onValueChange={setPrinterType}>
                  <SelectTrigger id="printerType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRINTER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="printerModel">Model</Label>
                <Input
                  id="printerModel"
                  value={printerModel}
                  onChange={(e) => setPrinterModel(e.target.value)}
                  placeholder="e.g., Epson TM-T88VI"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="serialNumber">Serial Number</Label>
                <Input
                  id="serialNumber"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          {/* Connection */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              Connection
            </h4>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="connectionType">Connection Type</Label>
                <Select
                  value={connectionType}
                  onValueChange={setConnectionType}
                >
                  <SelectTrigger id="connectionType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONNECTION_TYPES.map((ct) => (
                      <SelectItem key={ct.value} value={ct.value}>
                        {ct.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {connectionType === "network" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="networkAddress">IP Address</Label>
                    <Input
                      id="networkAddress"
                      value={networkAddress}
                      onChange={(e) => setNetworkAddress(e.target.value)}
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="networkPort">Port</Label>
                    <Input
                      id="networkPort"
                      type="number"
                      value={networkPort ?? ""}
                      onChange={(e) =>
                        setNetworkPort(
                          e.target.value ? parseInt(e.target.value) : undefined,
                        )
                      }
                      placeholder="9100"
                    />
                  </div>
                </div>
              )}

              {connectionType === "bluetooth" && (
                <div className="grid gap-2">
                  <Label htmlFor="bluetoothAddress">Bluetooth Address</Label>
                  <Input
                    id="bluetoothAddress"
                    value={bluetoothAddress}
                    onChange={(e) => setBluetoothAddress(e.target.value)}
                    placeholder="00:11:22:33:44:55"
                  />
                </div>
              )}

              {connectionType === "usb" && (
                <div className="grid gap-2">
                  <Label htmlFor="usbDevicePath">USB Device Path</Label>
                  <Input
                    id="usbDevicePath"
                    value={usbDevicePath}
                    onChange={(e) => setUsbDevicePath(e.target.value)}
                    placeholder="/dev/usb/lp0"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Role */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Role</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="printerRole">Printer Role</Label>
                <Select value={printerRole} onValueChange={setPrinterRole}>
                  <SelectTrigger id="printerRole">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRINTER_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="isDefaultReceipt" className="cursor-pointer">
                    Default Receipt Printer
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Use as default for printing receipts
                  </p>
                </div>
                <Switch
                  id="isDefaultReceipt"
                  checked={isDefaultReceipt}
                  onCheckedChange={setIsDefaultReceipt}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="isDefaultKitchen" className="cursor-pointer">
                    Default Kitchen Printer
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Use as default for kitchen orders
                  </p>
                </div>
                <Switch
                  id="isDefaultKitchen"
                  checked={isDefaultKitchen}
                  onCheckedChange={setIsDefaultKitchen}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label
                    htmlFor="printOrderTickets"
                    className="cursor-pointer"
                  >
                    Print Order Tickets
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Print tickets for each order
                  </p>
                </div>
                <Switch
                  id="printOrderTickets"
                  checked={printOrderTickets}
                  onCheckedChange={setPrintOrderTickets}
                />
              </div>
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              Configuration
            </h4>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="paperWidth">Paper Width</Label>
                <Select
                  value={paperWidth.toString()}
                  onValueChange={(v) => setPaperWidth(parseInt(v))}
                >
                  <SelectTrigger id="paperWidth">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPER_WIDTHS.map((w) => (
                      <SelectItem key={w.value} value={w.value}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxCharsPerLine">Max Chars/Line</Label>
                <Input
                  id="maxCharsPerLine"
                  type="number"
                  value={maxCharsPerLine ?? ""}
                  onChange={(e) =>
                    setMaxCharsPerLine(
                      e.target.value ? parseInt(e.target.value) : undefined,
                    )
                  }
                  placeholder="42"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="printDensity">Print Density</Label>
                <Input
                  id="printDensity"
                  type="number"
                  value={printDensity ?? ""}
                  onChange={(e) =>
                    setPrintDensity(
                      e.target.value ? parseInt(e.target.value) : undefined,
                    )
                  }
                  placeholder="1-8"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="supportsAutoCut" className="cursor-pointer">
                  Auto-Cut
                </Label>
                <Switch
                  id="supportsAutoCut"
                  checked={supportsAutoCut}
                  onCheckedChange={setSupportsAutoCut}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="supportsBarcode" className="cursor-pointer">
                  Barcode
                </Label>
                <Switch
                  id="supportsBarcode"
                  checked={supportsBarcode}
                  onCheckedChange={setSupportsBarcode}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="supportsQrCode" className="cursor-pointer">
                  QR Code
                </Label>
                <Switch
                  id="supportsQrCode"
                  checked={supportsQrCode}
                  onCheckedChange={setSupportsQrCode}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="supportsLogo" className="cursor-pointer">
                  Logo
                </Label>
                <Switch
                  id="supportsLogo"
                  checked={supportsLogo}
                  onCheckedChange={setSupportsLogo}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="supportsCashDrawerKick"
                  className="cursor-pointer"
                >
                  Cash Drawer Kick
                </Label>
                <Switch
                  id="supportsCashDrawerKick"
                  checked={supportsCashDrawerKick}
                  onCheckedChange={setSupportsCashDrawerKick}
                />
              </div>
            </div>
          </div>

          {/* Receipt Settings */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              Receipt Settings
            </h4>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="receiptHeader">Receipt Header</Label>
                <Textarea
                  id="receiptHeader"
                  value={receiptHeader}
                  onChange={(e) => setReceiptHeader(e.target.value)}
                  placeholder="Text printed at the top of receipts"
                  rows={2}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="receiptFooter">Receipt Footer</Label>
                <Textarea
                  id="receiptFooter"
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  placeholder="Text printed at the bottom of receipts"
                  rows={2}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label
                      htmlFor="autoPrintReceipt"
                      className="cursor-pointer"
                    >
                      Auto-Print Receipt
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Print receipts automatically
                    </p>
                  </div>
                  <Switch
                    id="autoPrintReceipt"
                    checked={autoPrintReceipt}
                    onCheckedChange={setAutoPrintReceipt}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="printLogo" className="cursor-pointer">
                      Print Logo
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Include logo on receipts
                    </p>
                  </div>
                  <Switch
                    id="printLogo"
                    checked={printLogo}
                    onCheckedChange={setPrintLogo}
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:w-1/3">
                <Label htmlFor="copies">Copies</Label>
                <Input
                  id="copies"
                  type="number"
                  min={1}
                  max={10}
                  value={copies}
                  onChange={(e) =>
                    setCopies(
                      e.target.value ? parseInt(e.target.value) : 1,
                    )
                  }
                />
              </div>
            </div>
          </div>
        </div>
        </div>

        <DialogFooter className="shrink-0 px-6 py-4">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !printerName.trim()}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isEditing ? "Saving..." : "Adding..."}
              </>
            ) : isEditing ? (
              "Save Changes"
            ) : (
              "Add Printer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
