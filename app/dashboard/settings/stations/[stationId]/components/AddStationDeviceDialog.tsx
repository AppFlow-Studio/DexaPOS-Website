"use client";

import { useState, type ReactNode } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  Printer,
  CookingPot,
  Wallet,
  Plug,
  Bluetooth,
  Network,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCreateStationDevice,
  StationDeviceType,
  ConnectionType,
} from "../../hooks/useStationDevices";

interface AddStationDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationId: string;
}

const DEVICE_TYPES: {
  type: StationDeviceType;
  label: string;
  icon: ReactNode;
  description: string;
}[] = [
  {
    type: "receipt_printer",
    label: "Receipt Printer",
    icon: <Printer className="h-8 w-8" />,
    description: "Print customer receipts",
  },
  {
    type: "kitchen_printer",
    label: "Kitchen Printer",
    icon: <CookingPot className="h-8 w-8" />,
    description: "Print kitchen tickets",
  },
  {
    type: "cash_drawer",
    label: "Cash Drawer",
    icon: <Wallet className="h-8 w-8" />,
    description: "Manage cash transactions",
  },
];

const CONNECTION_TYPES: { type: ConnectionType; label: string; icon: ReactNode }[] = [
  { type: "usb", label: "USB", icon: <Plug className="h-5 w-5" /> },
  { type: "bluetooth", label: "Bluetooth", icon: <Bluetooth className="h-5 w-5" /> },
  { type: "network", label: "Network", icon: <Network className="h-5 w-5" /> },
  { type: "integrated", label: "Integrated", icon: <Boxes className="h-5 w-5" /> },
];

const PRINTER_WIDTHS = [
  { value: 32, label: "32 chars (58mm)" },
  { value: 42, label: "42 chars (80mm)" },
  { value: 48, label: "48 chars (80mm)" },
];

const PRINTER_DPI = [
  { value: 180, label: "180 DPI" },
  { value: 203, label: "203 DPI" },
  { value: 300, label: "300 DPI" },
];

type WizardStep = "type" | "connection" | "settings" | "confirm";

export function AddStationDeviceDialog({
  open,
  onOpenChange,
  stationId,
}: AddStationDeviceDialogProps) {
  const createMutation = useCreateStationDevice();

  const [step, setStep] = useState<WizardStep>("type");
  const [deviceType, setDeviceType] = useState<StationDeviceType | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [deviceModel, setDeviceModel] = useState("");
  const [connectionType, setConnectionType] = useState<ConnectionType>("usb");
  const [connectionAddress, setConnectionAddress] = useState("");
  const [connectionPort, setConnectionPort] = useState<number | undefined>(undefined);
  const [printerWidth, setPrinterWidth] = useState<number>(42);
  const [printerDpi, setPrinterDpi] = useState<number>(203);
  const [autoCut, setAutoCut] = useState(true);
  const [openCashDrawer, setOpenCashDrawer] = useState(false);

  const resetForm = () => {
    setStep("type");
    setDeviceType(null);
    setDeviceName("");
    setDeviceModel("");
    setConnectionType("usb");
    setConnectionAddress("");
    setConnectionPort(undefined);
    setPrinterWidth(42);
    setPrinterDpi(203);
    setAutoCut(true);
    setOpenCashDrawer(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetForm, 200);
  };

  const handleNext = () => {
    if (step === "type" && deviceType) {
      setStep("connection");
    } else if (step === "connection") {
      if (deviceType === "cash_drawer") {
        setStep("confirm");
      } else {
        setStep("settings");
      }
    } else if (step === "settings") {
      setStep("confirm");
    }
  };

  const handleBack = () => {
    if (step === "connection") {
      setStep("type");
    } else if (step === "settings") {
      setStep("connection");
    } else if (step === "confirm") {
      if (deviceType === "cash_drawer") {
        setStep("connection");
      } else {
        setStep("settings");
      }
    }
  };

  const handleCreate = async () => {
    if (!deviceType) return;

    const isPrinter = deviceType.includes("printer");

    try {
      await createMutation.mutateAsync({
        station_id: stationId,
        device_type: deviceType,
        device_name: deviceName || getDefaultDeviceName(deviceType),
        device_model: deviceModel || undefined,
        connection_type: connectionType,
        connection_address: connectionAddress || undefined,
        connection_port: connectionPort,
        printer_width: isPrinter ? printerWidth : undefined,
        printer_dpi: isPrinter ? printerDpi : undefined,
        auto_cut: isPrinter ? autoCut : undefined,
        open_cash_drawer: deviceType === "receipt_printer" ? openCashDrawer : undefined,
      });
      handleClose();
    } catch {
      // Error handled by mutation
    }
  };

  const getDefaultDeviceName = (type: StationDeviceType) => {
    switch (type) {
      case "receipt_printer":
        return "Receipt Printer";
      case "kitchen_printer":
        return "Kitchen Printer";
      case "cash_drawer":
        return "Cash Drawer";
      default:
        return "Device";
    }
  };

  const canProceed = () => {
    if (step === "type") return !!deviceType;
    if (step === "connection") return !!connectionType;
    return true;
  };

  const getStepNumber = () => {
    switch (step) {
      case "type":
        return 1;
      case "connection":
        return 2;
      case "settings":
        return 3;
      case "confirm":
        return deviceType === "cash_drawer" ? 3 : 4;
    }
  };

  const getTotalSteps = () => (deviceType === "cash_drawer" ? 3 : 4);
  const isPrinter = deviceType?.includes("printer");
  const selectedDevice = DEVICE_TYPES.find((dt) => dt.type === deviceType);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent className="w-[calc(100%-1rem)] sm:max-w-[620px] max-h-[92vh] overflow-hidden gap-0 p-0">
        <DialogHeader className="border-b bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-700">
              {selectedDevice?.icon || <Printer className="h-6 w-6" />}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl">Add Device</DialogTitle>
              <DialogDescription className="mt-1">
                Step {getStepNumber()} of {getTotalSteps()}: {" "}
                {step === "type" && "select the device class"}
                {step === "connection" && "configure how the device connects"}
                {step === "settings" && "set printer-specific behavior"}
                {step === "confirm" && "review before saving"}
              </DialogDescription>
            </div>
          </div>

          <div className={cn(
            "mt-4 grid gap-2",
            deviceType === "cash_drawer" ? "grid-cols-3" : "grid-cols-4"
          )}>
            {[
              { label: "Type", step: 1 },
              { label: "Connection", step: 2 },
              ...(deviceType === "cash_drawer" ? [] : [{ label: "Settings", step: 3 }]),
              { label: "Confirm", step: getTotalSteps() },
            ].map((item) => (
              <div
                key={`${item.label}-${item.step}`}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm",
                  getStepNumber() === item.step
                    ? "border-primary bg-primary/10 text-primary"
                    : getStepNumber() > item.step
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                )}
              >
                <div className="text-[11px] uppercase tracking-wide opacity-70">
                  Step {item.step}
                </div>
                <div className="font-medium">{item.label}</div>
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-5 max-h-[calc(92vh-220px)]">
          {step === "type" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {DEVICE_TYPES.map((dt) => (
                <button
                  key={dt.type}
                  type="button"
                  onClick={() => {
                    setDeviceType(dt.type);
                    setDeviceName(dt.label);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all text-center",
                    deviceType === dt.type
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <span className="text-indigo-700">{dt.icon}</span>
                  <div>
                    <p className="font-medium">{dt.label}</p>
                    <p className="text-xs text-muted-foreground">{dt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === "connection" && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="deviceName">Device Name</Label>
                <Input
                  id="deviceName"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g., Front Counter Printer"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="deviceModel">Model (optional)</Label>
                <Input
                  id="deviceModel"
                  value={deviceModel}
                  onChange={(e) => setDeviceModel(e.target.value)}
                  placeholder="e.g., Epson TM-T88VI"
                />
              </div>

              <div className="grid gap-2">
                <Label>Connection Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CONNECTION_TYPES.map((ct) => (
                    <button
                      key={ct.type}
                      type="button"
                      onClick={() => setConnectionType(ct.type)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border-2 transition-all",
                        connectionType === ct.type
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <span className="text-indigo-700">{ct.icon}</span>
                      <span className="font-medium">{ct.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {connectionType === "network" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="connectionAddress">IP Address</Label>
                    <Input
                      id="connectionAddress"
                      value={connectionAddress}
                      onChange={(e) => setConnectionAddress(e.target.value)}
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="connectionPort">Port</Label>
                    <Input
                      id="connectionPort"
                      type="number"
                      value={connectionPort || ""}
                      onChange={(e) =>
                        setConnectionPort(e.target.value ? parseInt(e.target.value) : undefined)
                      }
                      placeholder="9100"
                    />
                  </div>
                </div>
              )}

              {connectionType === "bluetooth" && (
                <div className="grid gap-2">
                  <Label htmlFor="connectionAddress">Bluetooth Address</Label>
                  <Input
                    id="connectionAddress"
                    value={connectionAddress}
                    onChange={(e) => setConnectionAddress(e.target.value)}
                    placeholder="00:11:22:33:44:55"
                  />
                </div>
              )}
            </div>
          )}

          {step === "settings" && isPrinter && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="printerWidth">Paper Width</Label>
                  <Select
                    value={printerWidth.toString()}
                    onValueChange={(v) => setPrinterWidth(parseInt(v))}
                  >
                    <SelectTrigger id="printerWidth">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRINTER_WIDTHS.map((w) => (
                        <SelectItem key={w.value} value={w.value.toString()}>
                          {w.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="printerDpi">Print Resolution</Label>
                  <Select
                    value={printerDpi.toString()}
                    onValueChange={(v) => setPrinterDpi(parseInt(v))}
                  >
                    <SelectTrigger id="printerDpi">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRINTER_DPI.map((d) => (
                        <SelectItem key={d.value} value={d.value.toString()}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border bg-slate-50/80 p-4">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <Label htmlFor="autoCut" className="cursor-pointer">
                      Auto-Cut Paper
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically cut paper after printing.
                    </p>
                  </div>
                  <Switch
                    id="autoCut"
                    checked={autoCut}
                    onCheckedChange={setAutoCut}
                  />
                </div>

                {deviceType === "receipt_printer" && (
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <Label htmlFor="openCashDrawer" className="cursor-pointer">
                        Open Cash Drawer
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Open the drawer automatically when printing receipts.
                      </p>
                    </div>
                    <Switch
                      id="openCashDrawer"
                      checked={openCashDrawer}
                      onCheckedChange={setOpenCashDrawer}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border bg-slate-50/80 p-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-background text-indigo-700">
                  {selectedDevice?.icon}
                </div>
                <div>
                  <p className="font-semibold text-lg">{deviceName}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedDevice?.label}
                    {deviceModel && ` - ${deviceModel}`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Connection</p>
                  <p className="font-medium">
                    {CONNECTION_TYPES.find((ct) => ct.type === connectionType)?.label}
                  </p>
                </div>
                {connectionAddress && (
                  <div>
                    <p className="text-muted-foreground">Address</p>
                    <p className="font-mono">{connectionAddress}</p>
                  </div>
                )}
                {isPrinter && (
                  <>
                    <div>
                      <p className="text-muted-foreground">Paper Width</p>
                      <p className="font-medium">
                        {PRINTER_WIDTHS.find((w) => w.value === printerWidth)?.label}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Auto-Cut</p>
                      <p className="font-medium">{autoCut ? "Enabled" : "Disabled"}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t bg-slate-50/80 px-6 py-4">
          {step !== "type" && (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={createMutation.isPending}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          <div className="flex-1" />
          {step !== "confirm" ? (
            <Button type="button" onClick={handleNext} disabled={!canProceed()}>
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Add Device
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
