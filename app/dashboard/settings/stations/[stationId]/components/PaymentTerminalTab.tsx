"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  StationPanel,
  StationPanelContent,
  StationPanelDescription,
  StationPanelHeader,
  StationPanelTitle,
} from "./StationPanel";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Station } from "@/app/dashboard/actions/stations";
import {
  useStationTerminals,
  useAvailableTerminals,
  useLinkTerminalToStation,
  useUnlinkTerminalFromStation,
  useSetActiveTerminal,
  useCreatePaymentTerminal,
  useTestTerminalConnection,
  getTerminalTypeLabel,
  getApiEnvironmentLabel,
  PaymentTerminal,
  TerminalType,
  ApiEnvironment,
} from "../../hooks/usePaymentTerminals";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import {
  CreditCard,
  Plus,
  Link as LinkIcon,
  Unlink,
  RefreshCw,
  Circle,
  Loader2,
  CheckCircle,
  XCircle,
  Shield,
  AlertTriangle,
  Settings,
  Info,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface PaymentTerminalTabProps {
  station: Station;
}

function CapabilityBadge({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        enabled
          ? ""
          : "",
      )}
    >
      {enabled ? (
        <CheckCircle className="mr-1 h-3 w-3" />
      ) : (
        <XCircle className="mr-1 h-3 w-3" />
      )}
      {label}
    </Badge>
  );
}

export function PaymentTerminalTab({ station }: PaymentTerminalTabProps) {
  // Impersonation-aware org id (NOT useAuth().orgId, which stays HQ during impersonation).
  const orgId = useClerkOrgId();
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isUnlinkDialogOpen, setIsUnlinkDialogOpen] = useState(false);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Create terminal form state
  const [terminalName, setTerminalName] = useState("");
  const [createType, setCreateType] = useState<TerminalType>("castles");
  const [authKey, setAuthKey] = useState("");
  const [apiEnvironment, setApiEnvironment] =
    useState<ApiEnvironment>("sandbox");
  const [signatureThreshold, setSignatureThreshold] = useState("25.00");
  const [registerId, setRegisterId] = useState("");
  // Castles-specific fields
  const [localIpAddress, setLocalIpAddress] = useState("");
  const [localPort, setLocalPort] = useState("8080");
  const [terminalModel, setTerminalModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [firmwareVersion, setFirmwareVersion] = useState("");

  // Fetch ALL terminals for this station
  const { data: terminals = [], isLoading: isLoadingTerminals } =
    useStationTerminals(station.id);
  const { data: availableTerminals } = useAvailableTerminals(
    station.location_id,
  );

  // Derive active terminal from the array
  const activeTerminal = useMemo(
    () => terminals.find((t) => t.is_active) ?? terminals[0] ?? null,
    [terminals],
  );

  // Check which providers are already registered on this station. Castles is
  // the only provider that can currently be added — Valor is not a
  // `terminal_type` value yet, so it renders as a disabled placeholder.
  const hasCastles = terminals.some((t) => t.terminal_type === "castles");

  const linkMutation = useLinkTerminalToStation();
  const unlinkMutation = useUnlinkTerminalFromStation();
  const setActiveMutation = useSetActiveTerminal();
  const createMutation = useCreatePaymentTerminal();
  const testConnectionMutation = useTestTerminalConnection();

  const resetCreateForm = () => {
    setTerminalName("");
    setAuthKey("");
    setApiEnvironment("sandbox");
    setSignatureThreshold("25.00");
    setRegisterId("");
    setLocalIpAddress("");
    setLocalPort("8080");
    setTerminalModel("");
    setSerialNumber("");
    setFirmwareVersion("");
  };

  const isCastlesCreate = createType === "castles";
  const isActiveTerminalCastles = activeTerminal?.terminal_type === "castles";

  const openCreateDialog = (type: TerminalType) => {
    resetCreateForm();
    setCreateType(type);
    setIsCreateDialogOpen(true);
  };

  const handleLinkTerminal = async () => {
    if (!selectedTerminalId) return;
    try {
      await linkMutation.mutateAsync({
        terminalId: selectedTerminalId,
        stationId: station.id,
      });
      setIsLinkDialogOpen(false);
      setSelectedTerminalId("");
    } catch {
      // Error handled by mutation
    }
  };

  const handleUnlinkTerminal = async () => {
    if (!activeTerminal) return;
    try {
      await unlinkMutation.mutateAsync(activeTerminal.id);
      setIsUnlinkDialogOpen(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleSwitchActiveTerminal = async (terminalId: string) => {
    if (terminalId === activeTerminal?.id) return;
    try {
      await setActiveMutation.mutateAsync({
        terminalId,
        stationId: station.id,
      });
    } catch {
      // Error handled by mutation
    }
  };

  const handleCreateTerminal = async () => {
    if (!orgId) return;
    if (isCastlesCreate) {
      if (!localIpAddress) return;
    } else {
      if (!registerId || !authKey) return;
    }
    try {
      await createMutation.mutateAsync({
        clerkOrgId: orgId,
        input: {
          location_id: station.location_id,
          station_id: station.id,
          terminal_name: terminalName || (isCastlesCreate ? "Castles Terminal" : "Payment Terminal"),
          terminal_type: createType,
          register_id: isCastlesCreate ? "CASTLES" : registerId,
          auth_key: isCastlesCreate ? "CASTLES" : authKey,
          api_environment: isCastlesCreate ? "production" : apiEnvironment,
          signature_threshold: parseFloat(signatureThreshold) || 25.0,
          connection_type: isCastlesCreate ? "local" : "cloud",
          local_ip_address: isCastlesCreate ? localIpAddress : null,
          local_port: isCastlesCreate ? parseInt(localPort) || 8080 : null,
          terminal_model: isCastlesCreate ? terminalModel || null : null,
          serial_number: isCastlesCreate ? serialNumber.trim() || null : null,
          firmware_version: isCastlesCreate ? firmwareVersion.trim() || null : null,
        },
      });
      setIsCreateDialogOpen(false);
      resetCreateForm();
    } catch {
      // Error handled by mutation
    }
  };

  const handleTestConnection = async () => {
    if (!activeTerminal) return;
    setIsTestingConnection(true);
    try {
      await testConnectionMutation.mutateAsync({
        terminalId: activeTerminal.id,
        silent: false,
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Automatic connection test every 3 minutes on the active terminal (skip for Castles)
  useEffect(() => {
    if (!activeTerminal?.id) return;
    if (activeTerminal.terminal_type === "castles") return;

    if (
      activeTerminal.last_connection_test_at &&
      Date.now() - new Date(activeTerminal.last_connection_test_at).getTime() >
        3 * 60 * 1000
    ) {
      testConnectionMutation.mutate({ terminalId: activeTerminal.id, silent: true });
    }

    const interval = setInterval(
      () => {
        testConnectionMutation.mutate({
          terminalId: activeTerminal.id,
          silent: true,
        });
      },
      3 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [activeTerminal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoadingTerminals) {
    return (
      <StationPanel>
        <StationPanelContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </StationPanelContent>
      </StationPanel>
    );
  }

  const hasTerminals = terminals.length > 0;
  const hasMultipleTerminals = terminals.length > 1;
  const hasAvailableTerminals =
    availableTerminals && availableTerminals.length > 0;

  return (
    <>
      <div className="space-y-6">
        <StationPanel>
          <StationPanelHeader>
            <div className="flex items-center justify-between">
              <div>
                <StationPanelTitle className="text-lg">Payment Terminal</StationPanelTitle>
                <StationPanelDescription>
                  {hasTerminals
                    ? `${terminals.length} provider${terminals.length > 1 ? "s" : ""} registered on this station`
                    : "Select a payment terminal provider for this station"}
                </StationPanelDescription>
              </div>
              {hasTerminals && (
                <div className="flex gap-2">
                  {!isActiveTerminalCastles && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={isTestingConnection}
                    >
                      {isTestingConnection ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Test Connection
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsUnlinkDialogOpen(true)}
                  >
                    <Unlink className="mr-2 h-4 w-4" />
                    Unlink
                  </Button>
                </div>
              )}
            </div>
          </StationPanelHeader>
          <StationPanelContent>
            {!hasTerminals ? (
              /* ── Empty state: Provider selection ── */
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                  <CreditCard className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">No terminal assigned</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-2 mb-6">
                  Choose a payment terminal provider to register on this station.
                </p>
                <div className="grid w-full max-w-md gap-4 sm:grid-cols-2">
                  <button
                    onClick={() => openCreateDialog("castles")}
                    className="flex min-w-0 cursor-pointer flex-col items-center gap-3 rounded-2xl border-0 bg-muted/45 p-6 shadow-none transition-colors hover:bg-muted"
                  >
                    <Image src="/castles.jpg" alt="Castles" width={40} height={40} className="rounded" />
                    <div>
                      <p className="font-medium">Castles</p>
                      <p className="text-xs text-muted-foreground">Local TCP</p>
                    </div>
                  </button>
                  {/* Valor is not selectable yet: `terminal_type` has no `valor`
                      value, so there is nothing to create. Rendered disabled
                      rather than omitted so the roadmap is visible. */}
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="flex min-w-0 cursor-not-allowed flex-col items-center gap-3 rounded-2xl border-0 bg-muted/45 p-6 opacity-50 shadow-none"
                  >
                    <Image
                      src="/valorlogo.jpg"
                      alt="Valor"
                      width={40}
                      height={40}
                      className="rounded grayscale"
                    />
                    <div>
                      <p className="font-medium text-muted-foreground">Valor</p>
                      <p className="text-xs text-muted-foreground">Coming soon</p>
                    </div>
                  </button>
                </div>
                {hasAvailableTerminals && (
                  <Button
                    variant="link"
                    className="mt-4"
                    onClick={() => setIsLinkDialogOpen(true)}
                  >
                    <LinkIcon className="mr-2 h-4 w-4" />
                    Or link an existing terminal
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Terminal Switcher - only show if multiple terminals */}
                {hasMultipleTerminals && (
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-medium whitespace-nowrap">
                      Active Provider
                    </Label>
                    <Select
                      value={activeTerminal?.id ?? ""}
                      onValueChange={handleSwitchActiveTerminal}
                      disabled={setActiveMutation.isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select active terminal..." />
                      </SelectTrigger>
                      <SelectContent>
                        {terminals.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex items-center gap-2">
                              {t.is_active && (
                                <Circle className="h-2 w-2 fill-current" />
                              )}
                              <span>{t.terminal_name}</span>
                              <Badge variant="outline" className="ml-1 text-xs">
                                {getTerminalTypeLabel(t.terminal_type)}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {setActiveMutation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}

                {/* Active Terminal Info */}
                {activeTerminal && (
                  <>
                    <div className="flex min-w-0 items-center gap-4 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
                      {/* Any terminal_type without its own logo — including
                          legacy Dejavoo rows — falls through to the generic
                          card icon rather than rendering a retired brand. */}
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl">
                        {activeTerminal.terminal_type === "castles" ? (
                          <Image src="/castles.jpg" alt="Castles" width={32} height={32} className="rounded" />
                        ) : (
                          <CreditCard className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-lg">
                            {activeTerminal.terminal_name}
                          </p>
                          {activeTerminal.is_active && hasMultipleTerminals && (
                            <Badge
                              variant="outline"
                              className="w-fit rounded-full border-0 bg-muted/60 px-2.5 text-xs font-medium text-foreground"
                            >
                              Active
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              activeTerminal.is_connected
                                ? ""
                                : "",
                            )}
                          >
                            <Circle
                              className={cn(
                                "mr-1 h-2 w-2",
                                activeTerminal.is_connected
                                  ? "fill-current"
                                  : "fill-transparent",
                              )}
                            />
                            {activeTerminal.is_connected ? "Online" : "Offline"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getTerminalTypeLabel(activeTerminal.terminal_type)}
                          {activeTerminal.terminal_model &&
                            ` - ${activeTerminal.terminal_model}`}
                        </p>
                      </div>
                      <Badge
                        variant={
                          activeTerminal.api_environment === "production"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {getApiEnvironmentLabel(activeTerminal.api_environment)}
                      </Badge>
                    </div>

                    {/* Credentials & Settings */}
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div className="space-y-4">
                        <h4 className="font-medium flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          {isActiveTerminalCastles ? "Terminal Info" : "Credentials"}
                        </h4>
                        {isActiveTerminalCastles ? (
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Model</p>
                              <p className="font-medium">{activeTerminal.terminal_model || "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Serial Number</p>
                              <p className="font-mono">{activeTerminal.serial_number || "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">IP Address</p>
                              <p className="font-mono">
                                {activeTerminal.local_ip_address
                                  ? `${activeTerminal.local_ip_address}:${activeTerminal.local_port || 8080}`
                                  : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Firmware</p>
                              <p className="font-mono">
                                {(activeTerminal.metadata as any)?.firmware_version ||
                                  (activeTerminal as any).firmware_version ||
                                  "—"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Register ID</p>
                              <p className="font-mono">{activeTerminal.register_id}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Auth Key</p>
                              <p className="font-mono">{activeTerminal.auth_key}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-medium flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          Settings
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">
                              Signature Threshold
                            </p>
                            <p className="font-medium">
                              ${activeTerminal.signature_threshold.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Timeout</p>
                            <p className="font-medium">
                              {activeTerminal.spin_proxy_timeout}s
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              Merchant Receipt
                            </p>
                            <p className="font-medium">
                              {activeTerminal.print_merchant_receipt ? "Print" : "Skip"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              Customer Receipt
                            </p>
                            <p className="font-medium">
                              {activeTerminal.print_customer_receipt ? "Print" : "Skip"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Capabilities */}
                    <div className="space-y-3">
                      <h4 className="font-medium">Capabilities</h4>
                      <div className="flex flex-wrap gap-2">
                        <CapabilityBadge
                          label="Contactless"
                          enabled={activeTerminal.supports_contactless}
                        />
                        <CapabilityBadge
                          label="EMV Chip"
                          enabled={activeTerminal.supports_emv}
                        />
                        <CapabilityBadge
                          label="Manual Entry"
                          enabled={activeTerminal.supports_manual_entry}
                        />
                        <CapabilityBadge
                          label="Debit"
                          enabled={activeTerminal.supports_debit}
                        />
                        <CapabilityBadge
                          label="EBT"
                          enabled={activeTerminal.supports_ebt}
                        />
                        <CapabilityBadge
                          label="Tip Adjust"
                          enabled={activeTerminal.supports_tip_adjust}
                        />
                      </div>
                    </div>

                    {/* Connection Status */}
                    {isActiveTerminalCastles ? (
                      <div className="min-w-0 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
                        <div className="flex items-start gap-3">
                          <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                              Connection testing is done from the POS app
                            </p>
                            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                              Castles terminals connect via local TCP. Open the POS tablet app to test and verify the connection.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="min-w-0 space-y-2 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Status
                          </span>
                          <Badge
                            variant={
                              activeTerminal.last_connection_status === "Online"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {activeTerminal.last_connection_status}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            {activeTerminal.last_connection_status === "Online"
                              ? "Online Since"
                              : "Last Verified"}
                          </span>
                          <span className="text-sm font-medium">
                            {activeTerminal.last_connection_status === "Online" &&
                            (activeTerminal.metadata as any)?.online_since
                              ? formatDistanceToNow(
                                  new Date((activeTerminal.metadata as any).online_since),
                                  {
                                    addSuffix: true,
                                  },
                                )
                              : activeTerminal.last_connection_test_at
                                ? formatDistanceToNow(
                                    new Date(activeTerminal.last_connection_test_at),
                                    {
                                      addSuffix: true,
                                    },
                                  )
                                : "Never"}
                          </span>
                        </div>
                        {activeTerminal.last_transaction_at && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              Last Transaction
                            </span>
                            <span className="text-sm font-medium">
                              {format(
                                new Date(activeTerminal.last_transaction_at),
                                "MMM d, yyyy h:mm a",
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Add another provider. The Valor placeholder always renders,
                    so this row is never empty. */}
                <div className="flex flex-wrap gap-3">
                  {!hasCastles && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                      onClick={() => openCreateDialog("castles")}
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      Add Castles
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add Valor (Coming soon)
                  </Button>
                </div>
              </div>
            )}
          </StationPanelContent>
        </StationPanel>
      </div>

      {/* Link Terminal Dialog */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Payment Terminal</DialogTitle>
            <DialogDescription>
              Select an available terminal to assign to this station.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select
              value={selectedTerminalId}
              onValueChange={setSelectedTerminalId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a terminal..." />
              </SelectTrigger>
              <SelectContent>
                {availableTerminals?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.terminal_name} ({getTerminalTypeLabel(t.terminal_type)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsLinkDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleLinkTerminal}
              disabled={!selectedTerminalId || linkMutation.isPending}
            >
              {linkMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Link Terminal
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Terminal Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent >
          <DialogHeader>
            <DialogTitle>
              Register {getTerminalTypeLabel(createType)} Terminal
            </DialogTitle>
            <DialogDescription>
              {isCastlesCreate
                ? "Enter the Castles terminal IP address and port for TCP connection."
                : "Enter the terminal credentials from your payment processor."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="terminalName">Terminal Name</Label>
              <Input
                id="terminalName"
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                placeholder={`e.g., Front Counter ${getTerminalTypeLabel(createType)}`}
              />
            </div>

            {isCastlesCreate ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="terminalModel">Terminal Model</Label>
                  <Input
                    id="terminalModel"
                    value={terminalModel}
                    onChange={(e) => setTerminalModel(e.target.value)}
                    placeholder="e.g., S1F4 Pro"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="localIpAddress">IP Address *</Label>
                    <Input
                      id="localIpAddress"
                      value={localIpAddress}
                      onChange={(e) => setLocalIpAddress(e.target.value)}
                      placeholder="192.168.1.208"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="localPort">Port</Label>
                    <Input
                      id="localPort"
                      type="number"
                      value={localPort}
                      onChange={(e) => setLocalPort(e.target.value)}
                      placeholder="8080"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="serialNumber">Serial Number</Label>
                    <Input
                      id="serialNumber"
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value)}
                      placeholder="Printed on terminal"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="firmwareVersion">Firmware Version</Label>
                    <Input
                      id="firmwareVersion"
                      value={firmwareVersion}
                      onChange={(e) => setFirmwareVersion(e.target.value)}
                      placeholder="e.g., 1.4.2"
                    />
                  </div>
                </div>

                <div className="min-w-0 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Castles terminals connect via local TCP. Connection testing is done from the POS tablet app, which will refresh serial number and firmware on first successful connection.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="apiEnvironment">Environment</Label>
                  <Select
                    value={apiEnvironment}
                    onValueChange={(v) => setApiEnvironment(v as ApiEnvironment)}
                  >
                    <SelectTrigger id="apiEnvironment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="registerId">Register ID *</Label>
                  <Input
                    id="registerId"
                    value={registerId}
                    onChange={(e) => setRegisterId(e.target.value)}
                    placeholder="Register identifier"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="authKey">Auth Key *</Label>
                  <Input
                    id="authKey"
                    type="password"
                    value={authKey}
                    onChange={(e) => setAuthKey(e.target.value)}
                    placeholder="Authentication key from processor"
                  />
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="signatureThreshold">
                Signature Threshold ($)
              </Label>
              <Input
                id="signatureThreshold"
                type="number"
                step="0.01"
                value={signatureThreshold}
                onChange={(e) => setSignatureThreshold(e.target.value)}
                placeholder="25.00"
              />
              <p className="text-xs text-muted-foreground">
                Require signature for transactions above this amount
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetCreateForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTerminal}
              disabled={
                isCastlesCreate
                  ? !localIpAddress || createMutation.isPending
                  : !registerId || !authKey || createMutation.isPending
              }
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registering...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Register Terminal
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink Confirmation Dialog */}
      <AlertDialog
        open={isUnlinkDialogOpen}
        onOpenChange={setIsUnlinkDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </div>
              <AlertDialogTitle>Unlink Terminal</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-3">
              Are you sure you want to unlink{" "}
              <span className="font-semibold text-foreground">
                {activeTerminal?.terminal_name}
              </span>{" "}
              from this station? The terminal will still exist and can be linked
              to another station.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlinkTerminal}
              disabled={unlinkMutation.isPending}
            >
              {unlinkMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unlinking...
                </>
              ) : (
                "Unlink Terminal"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
