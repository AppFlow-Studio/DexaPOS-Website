"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
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
  useStationTerminal,
  useAvailableTerminals,
  useLinkTerminalToStation,
  useUnlinkTerminalFromStation,
  useCreatePaymentTerminal,
  useTestTerminalConnection,
  getTerminalTypeLabel,
  getApiEnvironmentLabel,
  PaymentTerminal,
  TerminalType,
  ApiEnvironment,
} from "../../hooks/usePaymentTerminals";
import { useAuth } from "@clerk/nextjs";
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
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface PaymentTerminalTabProps {
  station: Station;
}

function CapabilityBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        enabled
          ? "border-green-500/50 bg-green-500/10 text-green-600"
          : "border-gray-400/50 text-gray-500"
      )}
    >
      {enabled ? <CheckCircle className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
      {label}
    </Badge>
  );
}

export function PaymentTerminalTab({ station }: PaymentTerminalTabProps) {
  const { orgId } = useAuth();
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isUnlinkDialogOpen, setIsUnlinkDialogOpen] = useState(false);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
 
  // Create terminal form state
  const [terminalName, setTerminalName] = useState("");
  const [terminalType, setTerminalType] = useState<TerminalType>("dejavoo");
  const [tpn, setTpn] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [apiEnvironment, setApiEnvironment] = useState<ApiEnvironment>("sandbox");
  const [signatureThreshold, setSignatureThreshold] = useState("25.00");
  const [registerId, setRegisterId] = useState("");

  const { data: terminal, isLoading: isLoadingTerminal } = useStationTerminal(station.id);
  const { data: availableTerminals } = useAvailableTerminals(station.location_id);

  const linkMutation = useLinkTerminalToStation();
  const unlinkMutation = useUnlinkTerminalFromStation();
  const createMutation = useCreatePaymentTerminal();
  const testConnectionMutation = useTestTerminalConnection();

  const resetCreateForm = () => {
    setTerminalName("");
    setTerminalType("dejavoo");
    setTpn("");
    setAuthKey("");
    setApiEnvironment("sandbox");
    setSignatureThreshold("25.00");
    setRegisterId("");
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
    if (!terminal) return;
    try {
      await unlinkMutation.mutateAsync(terminal.id);
      setIsUnlinkDialogOpen(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleCreateTerminal = async () => {
    if (!orgId || !tpn || !authKey) return;
    try {
      await createMutation.mutateAsync({
        clerkOrgId: orgId,
        input: {
          location_id: station.location_id,
          station_id: station.id,
          terminal_name: terminalName || "Payment Terminal",
          terminal_type: terminalType,
          tpn,
          register_id: registerId,
          auth_key: authKey,
          api_environment: apiEnvironment,
          signature_threshold: parseFloat(signatureThreshold) || 25.0,
        },
      });
      setIsCreateDialogOpen(false);
      resetCreateForm();
    } catch {
      // Error handled by mutation
    }
  };

  const handleTestConnection = async () => {
    if (!terminal) return;
    setIsTestingConnection(true);
    try {
      await testConnectionMutation.mutateAsync(terminal.id);
    } finally {
      setIsTestingConnection(false);
    }
  };

  if (isLoadingTerminal) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasTerminal = !!terminal;
  const hasAvailableTerminals = availableTerminals && availableTerminals.length > 0;

  return (
    <>
      <div className="space-y-6">
        {/* Terminal Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Payment Terminal</CardTitle>
                <CardDescription>
                  {hasTerminal
                    ? "Terminal assigned to this station"
                    : "No payment terminal is assigned to this station"}
                </CardDescription>
              </div>
              {hasTerminal && (
                <div className="flex gap-2">
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
          </CardHeader>
          <CardContent>
            {!hasTerminal ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                  {<CreditCard className="h-8 w-8 text-muted-foreground" />}
                </div>
                <h3 className="text-lg font-semibold">No terminal assigned</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-2">
                  Link an existing terminal or create a new one for this station.
                </p>
                <div className="flex gap-3 mt-6">
                  {hasAvailableTerminals && (
                    <Button variant="outline" onClick={() => setIsLinkDialogOpen(true)}>
                      <LinkIcon className="mr-2 h-4 w-4" />
                      Link Existing
                    </Button>
                  )}
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Terminal
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Terminal Info */}
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl ">
                  {terminal.terminal_type == 'dejavoo' ? <Image src="/dejavoo.png" alt="Dejavoo" width={32} height={32} /> : <CreditCard className="h-8 w-8 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-lg">{terminal.terminal_name}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          terminal.is_connected
                            ? "border-green-500/50 bg-green-500/10 text-green-600"
                            : "border-gray-400/50 text-gray-500"
                        )}
                      >
                        <Circle
                          className={cn(
                            "mr-1 h-2 w-2",
                            terminal.is_connected
                              ? "fill-green-500 text-green-500"
                              : "fill-gray-400 text-gray-400"
                          )}
                        />
                        {terminal.is_connected ? "Online" : "Offline"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getTerminalTypeLabel(terminal.terminal_type)}
                      {terminal.terminal_model && ` - ${terminal.terminal_model}`}
                    </p>
                  </div>
                  <Badge
                    variant={terminal.api_environment === "production" ? "default" : "secondary"}
                  >
                    {getApiEnvironmentLabel(terminal.api_environment)}
                  </Badge>
                </div>

                {/* Credentials & Settings */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Credentials
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">TPN</p>
                        <p className="font-mono">{terminal.tpn}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Auth Key</p>
                        <p className="font-mono">{terminal.auth_key}</p>
                      </div>
                      {terminal.register_id && (
                        <div>
                          <p className="text-muted-foreground">Register ID</p>
                          <p className="font-mono">{terminal.register_id}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Settings
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Signature Threshold</p>
                        <p className="font-medium">${terminal.signature_threshold.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Timeout</p>
                        <p className="font-medium">{terminal.spin_proxy_timeout}s</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Merchant Receipt</p>
                        <p className="font-medium">
                          {terminal.print_merchant_receipt ? "Print" : "Skip"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Customer Receipt</p>
                        <p className="font-medium">
                          {terminal.print_customer_receipt ? "Print" : "Skip"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Capabilities */}
                <div className="space-y-3">
                  <h4 className="font-medium">Capabilities</h4>
                  <div className="flex flex-wrap gap-2">
                    <CapabilityBadge label="Contactless" enabled={terminal.supports_contactless} />
                    <CapabilityBadge label="EMV Chip" enabled={terminal.supports_emv} />
                    <CapabilityBadge label="Manual Entry" enabled={terminal.supports_manual_entry} />
                    <CapabilityBadge label="Debit" enabled={terminal.supports_debit} />
                    <CapabilityBadge label="EBT" enabled={terminal.supports_ebt} />
                    <CapabilityBadge label="Tip Adjust" enabled={terminal.supports_tip_adjust} />
                  </div>
                </div>

                {/* Connection Status */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Last Connection Test</span>
                    <span className="text-sm font-medium">
                      {terminal.last_connection_test_at
                        ? formatDistanceToNow(new Date(terminal.last_connection_test_at), {
                            addSuffix: true,
                          })
                        : "Never"}
                    </span>
                  </div>
                  {terminal.last_connection_status && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge
                        variant={terminal.last_connection_status === "Online" ? "default" : "secondary"}
                      >
                        {terminal.last_connection_status}
                      </Badge>
                    </div>
                  )}
                  {terminal.last_transaction_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Last Transaction</span>
                      <span className="text-sm font-medium">
                        {format(new Date(terminal.last_transaction_at), "MMM d, yyyy h:mm a")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
            <Select value={selectedTerminalId} onValueChange={setSelectedTerminalId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a terminal..." />
              </SelectTrigger>
              <SelectContent>
                {availableTerminals?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.terminal_name} ({t.tpn})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Register New Terminal</DialogTitle>
            <DialogDescription>
              Enter the terminal credentials from your payment processor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="terminalName">Terminal Name</Label>
              <Input
                id="terminalName"
                value={terminalName}
                onChange={(e) => setTerminalName(e.target.value)}
                placeholder="e.g., Front Counter Terminal"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="terminalType">Terminal Type</Label>
                <Select
                  value={terminalType}
                  onValueChange={(v) => setTerminalType(v as TerminalType)}
                >
                  <SelectTrigger id="terminalType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dejavoo">Dejavoo</SelectItem>
                    <SelectItem value="pax">PAX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tpn">TPN (Terminal Profile Number)</Label>
              <Input
                id="tpn"
                value={tpn}
                onChange={(e) => setTpn(e.target.value)}
                placeholder="10-12 digit number"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="registerId">Register ID</Label>
              <Input
                id="registerId"
                value={registerId}
                onChange={(e) => setRegisterId(e.target.value)}
                placeholder="10-12 digit number"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="authKey">Auth Key</Label>
              <Input
                id="authKey"
                type="password"
                value={authKey}
                onChange={(e) => setAuthKey(e.target.value)}
                placeholder="Authentication key from processor"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="signatureThreshold">Signature Threshold ($)</Label>
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
              disabled={!tpn || !authKey || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Terminal
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink Confirmation Dialog */}
      <AlertDialog open={isUnlinkDialogOpen} onOpenChange={setIsUnlinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/10">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              </div>
              <AlertDialogTitle>Unlink Terminal</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-3">
              Are you sure you want to unlink{" "}
              <span className="font-semibold text-foreground">
                {terminal?.terminal_name}
              </span>{" "}
              from this station? The terminal will still exist and can be linked to another
              station.
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
