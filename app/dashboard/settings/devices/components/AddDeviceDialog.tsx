"use client";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import {
  useDevices,
  DeviceType,
  Device,
  ConnectionType,
  PrinterType,
  DetectedPrinter,
  PREP_STATIONS,
  getDeviceTypeLabel,
} from "../hooks/useDevices";
import {
  Loader2,
  Smartphone,
  Monitor,
  Printer,
  Bluetooth,
  Usb,
  Wifi,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface AddDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceToEdit?: Device | null;
}

// Simple confetti effect using CSS animations
function ConfettiEffect({ show }: { show: boolean }) {
  if (!show) return null;

  const colors = [
    "#6366f1",
    "#22c55e",
    "#eab308",
    "#ef4444",
    "#3b82f6",
    "#ec4899",
  ];
  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1 + Math.random() * 1,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 6 + Math.random() * 8,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute animate-confetti"
          style={{
            left: `${piece.left}%`,
            top: "-20px",
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti-fall linear forwards;
        }
      `}</style>
    </div>
  );
}

// Step indicator for the wizard
function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
          step >= 1
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        1
      </div>
      <div className={cn("h-0.5 w-8", step >= 2 ? "bg-primary" : "bg-muted")} />
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
          step >= 2
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        2
      </div>
    </div>
  );
}

// Enhanced device type selection card
function DeviceTypeCard({
  type,
  label,
  sublabel,
  icon: Icon,
  onClick,
}: {
  type: DeviceType;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 p-5 rounded-xl border-2 border-border transition-all hover:border-primary/50 hover:shadow-lg hover:scale-[1.02] text-left w-full"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary group-hover:from-primary group-hover:to-primary/80 group-hover:text-primary-foreground transition-all">
        <Icon className="h-7 w-7" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-base">{label}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{sublabel}</p>
      </div>
      <span className="text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
        Continue →
      </span>
    </button>
  );
}

// Instructional card component
function InstructionalCard({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6">
      <div className="flex items-start gap-4">
        <span className="text-3xl">{icon}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-lg mb-3">{title}</h3>
          {children}
        </div>
      </div>
    </div>
  );
}

// Detected printer row component
function DetectedPrinterRow({
  printer,
  onAssign,
}: {
  printer: DetectedPrinter;
  onAssign: () => void;
}) {
  const connectionIcon = {
    bluetooth: <Bluetooth className="h-4 w-4" />,
    network: <Wifi className="h-4 w-4" />,
    usb: <Usb className="h-4 w-4" />,
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between p-4 rounded-lg border transition-colors",
        printer.isAssigned
          ? "bg-muted/50 opacity-60"
          : "bg-card hover:bg-muted/30"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Printer className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">{printer.name}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{printer.model}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              {connectionIcon[printer.connectionType]}
              {printer.connectionType}
            </span>
          </div>
        </div>
      </div>
      <Button
        variant={printer.isAssigned ? "ghost" : "default"}
        size="sm"
        disabled={printer.isAssigned}
        onClick={onAssign}
      >
        {printer.isAssigned ? (
          <>
            <CheckCircle className="mr-1 h-4 w-4" />
            Assigned
          </>
        ) : (
          "Assign"
        )}
      </Button>
    </div>
  );
}

// Printer configuration form component
function PrinterConfigForm({
  printer,
  name,
  setName,
  printerType,
  setPrinterType,
  prepStation,
  setPrepStation,
  alwaysPrint,
  setAlwaysPrint,
  sendToExpediter,
  setSendToExpediter,
}: {
  printer: DetectedPrinter;
  name: string;
  setName: (v: string) => void;
  printerType: PrinterType;
  setPrinterType: (v: PrinterType) => void;
  prepStation: string;
  setPrepStation: (v: string) => void;
  alwaysPrint: boolean;
  setAlwaysPrint: (v: boolean) => void;
  sendToExpediter: boolean;
  setSendToExpediter: (v: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="p-4 rounded-lg bg-muted/50 border flex items-center gap-3">
        <Printer className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="font-medium">{printer.model}</p>
          <p className="text-sm text-muted-foreground">
            Serial: {printer.serialNumber}
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="printerName">Printer Name</Label>
          <Input
            id="printerName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Kitchen Printer"
          />
        </div>

        <div className="grid gap-2">
          <Label>Printer Type</Label>
          <Select
            value={printerType}
            onValueChange={(v) => setPrinterType(v as PrinterType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kitchen">Kitchen Printer</SelectItem>
              <SelectItem value="receipt">Receipt Printer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {printerType === "kitchen" && (
          <div className="grid gap-2">
            <Label>Prep Station</Label>
            <Select value={prepStation} onValueChange={setPrepStation}>
              <SelectTrigger>
                <SelectValue placeholder="Select prep station" />
              </SelectTrigger>
              <SelectContent>
                {PREP_STATIONS.map((station) => (
                  <SelectItem key={station.id} value={station.id}>
                    {station.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center justify-between py-2">
          <div>
            <Label htmlFor="alwaysPrint" className="cursor-pointer">
              Always Print
            </Label>
            <p className="text-sm text-muted-foreground">
              Auto-print all orders
            </p>
          </div>
          <Switch
            id="alwaysPrint"
            checked={alwaysPrint}
            onCheckedChange={setAlwaysPrint}
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <Label htmlFor="sendToExpediter" className="cursor-pointer">
              Send to Expediter
            </Label>
            <p className="text-sm text-muted-foreground">
              Copy orders to expo station
            </p>
          </div>
          <Switch
            id="sendToExpediter"
            checked={sendToExpediter}
            onCheckedChange={setSendToExpediter}
          />
        </div>
      </div>
    </div>
  );
}

export function AddDeviceDialog({
  open,
  onOpenChange,
  deviceToEdit,
}: AddDeviceDialogProps) {
  const {
    addDevice,
    updateDevice,
    detectedPrinters,
    assignPrinter,
    simulatePairing,
  } = useDevices();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [showConfetti, setShowConfetti] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState<DeviceType | null>(null);
  const [name, setName] = useState("");
  const [dejavooAuthKey, setDejavooAuthKey] = useState("");
  const [dejavooRegisterId, setDejavooRegisterId] = useState("");
  const [connectionType, setConnectionType] =
    useState<ConnectionType>("bluetooth");

  // Printer config state
  const [configuringPrinter, setConfiguringPrinter] =
    useState<DetectedPrinter | null>(null);
  const [printerName, setPrinterName] = useState("");
  const [printerType, setPrinterType] = useState<PrinterType>("kitchen");
  const [prepStation, setPrepStation] = useState("");
  const [alwaysPrint, setAlwaysPrint] = useState(true);
  const [sendToExpediter, setSendToExpediter] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (deviceToEdit) {
        setStep(2);
        setType(deviceToEdit.type);
        setName(deviceToEdit.name);
        setDejavooAuthKey(deviceToEdit.dejavooAuthKey || "");
        setDejavooRegisterId(deviceToEdit.dejavooRegisterId || "");
        setConnectionType(deviceToEdit.connectionType || "bluetooth");
      } else {
        resetForm();
      }
    }
  }, [open, deviceToEdit]);

  const resetForm = () => {
    setStep(1);
    setType(null);
    setName("");
    setDejavooAuthKey("");
    setDejavooRegisterId("");
    setConnectionType("bluetooth");
    setPairingError(null);
    setConfiguringPrinter(null);
    setPrinterName("");
    setPrinterType("kitchen");
    setPrepStation("");
    setAlwaysPrint(true);
    setSendToExpediter(false);
  };

  const handleTypeSelect = (selectedType: DeviceType) => {
    setType(selectedType);
    setStep(2);
    setPairingError(null);
  };

  const handleBack = () => {
    if (configuringPrinter) {
      setConfiguringPrinter(null);
      return;
    }
    if (step === 2 && !deviceToEdit) {
      setStep(1);
      setType(null);
      setPairingError(null);
    }
  };

  const handlePairTerminal = async () => {
    if (!name.trim() || !dejavooRegisterId.trim() || !dejavooAuthKey.trim())
      return;

    setIsLoading(true);
    setPairingError(null);

    const result = await simulatePairing(dejavooRegisterId);

    if (result.success) {
      // Add the device
      if (deviceToEdit) {
        updateDevice(deviceToEdit.id, {
          name,
          dejavooAuthKey,
          dejavooRegisterId,
          connectionType,
        });
      } else {
        addDevice({
          name,
          type: "external_terminal",
          dejavooAuthKey,
          dejavooRegisterId,
          connectionType,
          model: "Dejavoo P8",
        });
      }

      // Show confetti and success toast
      setShowConfetti(true);
      toast.success("P8 Terminal paired successfully!", {
        icon: <Sparkles className="h-4 w-4 text-yellow-500" />,
      });

      // Close dialog after animation
      setTimeout(() => {
        setShowConfetti(false);
        handleClose();
      }, 1500);
    } else {
      setPairingError(result.error || "Failed to pair device");
    }

    setIsLoading(false);
  };

  const handleAssignPrinter = (printer: DetectedPrinter) => {
    setConfiguringPrinter(printer);
    setPrinterName(printer.name);
  };

  const handleSavePrinter = () => {
    if (!configuringPrinter || !printerName.trim()) return;

    assignPrinter(configuringPrinter.id, {
      name: printerName,
      printerType,
      prepStation: printerType === "kitchen" ? prepStation : undefined,
      alwaysPrint,
      sendToExpediter,
    });

    toast.success("Printer added successfully!");
    handleClose();
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(resetForm, 200);
  };

  const renderStepContent = () => {
    // Step 1: Device type selection
    if (step === 1) {
      return (
        <div className="flex flex-col gap-3 py-4">
          <DeviceTypeCard
            type="external_terminal"
            label="External P8 Payment Terminal"
            sublabel="Connect a Dejavoo P8 via Bluetooth or USB"
            icon={Smartphone}
            onClick={() => handleTypeSelect("external_terminal")}
          />
          <DeviceTypeCard
            type="tablet"
            label="Dejavoo P18 POS Tablet"
            sublabel="Terminal built into the tablet app"
            icon={Monitor}
            onClick={() => handleTypeSelect("tablet")}
          />
          <DeviceTypeCard
            type="printer"
            label="Receipt or Kitchen Printer"
            sublabel="Automatically detected from POS app"
            icon={Printer}
            onClick={() => handleTypeSelect("printer")}
          />
        </div>
      );
    }

    // Step 2A: External P8 Terminal Setup
    if (type === "external_terminal") {
      return (
        <div className="space-y-5 py-4">
          {pairingError && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Connection Failed</p>
                <p className="text-sm opacity-90">{pairingError}</p>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="deviceName">Device Name *</Label>
            <Input
              id="deviceName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Front Counter Terminal"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="tpn">Register ID / TPN *</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Found on the back of your P8 device</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="tpn"
              value={dejavooRegisterId}
              onChange={(e) => setDejavooRegisterId(e.target.value)}
              placeholder="Enter TPN or Register ID"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="authKey">Auth Key *</Label>
            <Input
              id="authKey"
              value={dejavooAuthKey}
              onChange={(e) => setDejavooAuthKey(e.target.value)}
              placeholder="Enter Auth Key"
              type="password"
            />
          </div>

          <div className="grid gap-3">
            <Label>Connection Type</Label>
            <RadioGroup
              value={connectionType}
              onValueChange={(v) => setConnectionType(v as ConnectionType)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bluetooth" id="bluetooth" />
                <Label
                  htmlFor="bluetooth"
                  className="flex items-center gap-2 cursor-pointer font-normal"
                >
                  <Bluetooth className="h-4 w-4 text-blue-500" />
                  Bluetooth
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="usb" id="usb" />
                <Label
                  htmlFor="usb"
                  className="flex items-center gap-2 cursor-pointer font-normal"
                >
                  <Usb className="h-4 w-4 text-gray-500" />
                  USB / Wired
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      );
    }

    // Step 2B: Dejavoo P18 Tablet Setup
    if (type === "tablet") {
      return (
        <div className="py-4 space-y-4">
          <InstructionalCard icon="📱" title="To connect your P18 Tablet:">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold">
                  1
                </span>
                <span>
                  Open the <strong>Dexa POS app</strong> from the Dejavoo Store
                  on your tablet
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold">
                  2
                </span>
                <span>Log in with your credentials</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold">
                  3
                </span>
                <span>The device will automatically sync and appear here</span>
              </li>
            </ol>
            <div className="mt-4 flex items-center gap-2 text-primary font-medium">
              <Sparkles className="h-4 w-4" />
              No manual setup required!
            </div>
          </InstructionalCard>
        </div>
      );
    }

    // Step 2C: Printer Setup
    if (type === "printer") {
      // If configuring a specific printer
      if (configuringPrinter) {
        return (
          <div className="py-4">
            <PrinterConfigForm
              printer={configuringPrinter}
              name={printerName}
              setName={setPrinterName}
              printerType={printerType}
              setPrinterType={setPrinterType}
              prepStation={prepStation}
              setPrepStation={setPrepStation}
              alwaysPrint={alwaysPrint}
              setAlwaysPrint={setAlwaysPrint}
              sendToExpediter={sendToExpediter}
              setSendToExpediter={setSendToExpediter}
            />
          </div>
        );
      }

      const unassignedPrinters = detectedPrinters.filter((p) => !p.isAssigned);

      return (
        <div className="py-4 space-y-4">
          <InstructionalCard icon="🖨️" title="To add a printer:">
            <p className="text-sm text-muted-foreground mb-3">
              Printers are automatically detected when connected to your POS
              tablet.
            </p>
            <div className="text-sm space-y-1.5">
              <p className="font-medium">Supported connections:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Bluetooth className="h-4 w-4 text-blue-500" />
                  Bluetooth (Star Micronics, Epson)
                </li>
                <li className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-green-500" />
                  Network (Wi-Fi printers)
                </li>
                <li className="flex items-center gap-2">
                  <Usb className="h-4 w-4 text-gray-500" />
                  USB (Direct connection)
                </li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Once detected, assign it as a Kitchen or Receipt printer.
            </p>
          </InstructionalCard>

          {unassignedPrinters.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Detected Printers
              </h3>
              <div className="space-y-2">
                {unassignedPrinters.map((printer) => (
                  <DetectedPrinterRow
                    key={printer.id}
                    printer={printer}
                    onAssign={() => handleAssignPrinter(printer)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const getDialogTitle = () => {
    if (deviceToEdit) return "Edit Device";
    if (step === 1) return "Add a new device";
    if (configuringPrinter) return "Configure Printer";
    if (type === "external_terminal") return "Connect External P8 Terminal";
    if (type === "tablet") return "Set up P18 Tablet";
    if (type === "printer") return "Add Printer";
    return "Add Device";
  };

  const getDialogDescription = () => {
    if (deviceToEdit) return "Update the details for this device.";
    if (step === 1) return "Select the type of device you want to add.";
    if (configuringPrinter) return "Configure printer settings before adding.";
    if (type === "external_terminal")
      return "Enter the connection details for your terminal.";
    return "";
  };

  const canPairTerminal = () => {
    return name.trim() && dejavooRegisterId.trim() && dejavooAuthKey.trim();
  };

  return (
    <>
      <ConfettiEffect show={showConfetti} />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
            {getDialogDescription() && (
              <DialogDescription>{getDialogDescription()}</DialogDescription>
            )}
          </DialogHeader>

          {!deviceToEdit && step === 2 && !configuringPrinter && (
            <StepIndicator step={step} />
          )}

          {renderStepContent()}

          <DialogFooter className="gap-2">
            {/* Back button */}
            {(step === 2 && !deviceToEdit && type === "external_terminal") ||
            configuringPrinter ? (
              <Button type="button" variant="outline" onClick={handleBack}>
                Back
              </Button>
            ) : null}

            {/* Cancel/Done button */}
            {type === "tablet" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      "https://help.dexapos.com/setup-p18-tablet",
                      "_blank"
                    )
                  }
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Setup Guide
                </Button>
                <Button type="button" onClick={handleClose}>
                  Done
                </Button>
              </>
            ) : type === "printer" && !configuringPrinter ? (
              <Button type="button" onClick={handleClose}>
                Done
              </Button>
            ) : (
              <>
                <Button type="button" variant="ghost" onClick={handleClose}>
                  Cancel
                </Button>
                {/* Action buttons */}
                {type === "external_terminal" && (
                  <Button
                    type="button"
                    onClick={handlePairTerminal}
                    disabled={isLoading || !canPairTerminal()}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Pairing...
                      </>
                    ) : deviceToEdit ? (
                      "Update Device"
                    ) : (
                      "Pair Device"
                    )}
                  </Button>
                )}
                {configuringPrinter && (
                  <Button
                    type="button"
                    onClick={handleSavePrinter}
                    disabled={!printerName.trim()}
                  >
                    Save Printer
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
