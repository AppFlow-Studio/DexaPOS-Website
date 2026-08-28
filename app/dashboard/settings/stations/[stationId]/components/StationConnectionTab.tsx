"use client";

import {
  StationPanel,
  StationPanelContent,
  StationPanelDescription,
  StationPanelHeader,
  StationPanelTitle,
} from "./StationPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Station } from "@/app/dashboard/actions/stations";
import { getSyncRoleLabel } from "../../hooks/useStations";
import {
  Wifi,
  WifiOff,
  Globe,
  Clock,
  RefreshCw,
  Circle,
  Signal,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

interface StationConnectionTabProps {
  station: Station;
}

function SignalStrength({ strength }: { strength?: number }) {
  const bars = [1, 2, 3, 4];
  const level = strength || 0;

  return (
    <div className="flex items-end gap-0.5 h-5">
      {bars.map((bar) => (
        <div
          key={bar}
          className={cn(
            "w-1.5 rounded-sm transition-colors",
            bar <= level ? "bg-foreground" : "bg-muted",
            bar === 1 && "h-1.5",
            bar === 2 && "h-2.5",
            bar === 3 && "h-3.5",
            bar === 4 && "h-5",
          )}
        />
      ))}
    </div>
  );
}

export function StationConnectionTab({ station }: StationConnectionTabProps) {
  const [isTesting, setIsTesting] = useState(false);

  const isOnline = station.is_active && station.is_online;

  const handleTestConnection = async () => {
    setIsTesting(true);
    // Simulate connection test
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const success = Math.random() > 0.2;
    toast[success ? "success" : "error"](
      success ? "Connection test successful!" : "Connection test failed",
    );
    setIsTesting(false);
  };

  // Mock signal strength (would come from actual device)
  const signalStrength: number = isOnline ? 4 : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Connection Status */}
      <StationPanel>
        <StationPanelHeader>
          <StationPanelTitle className="text-lg flex items-center gap-2">
            {isOnline ? (
              <Wifi className="h-5 w-5 text-muted-foreground" />
            ) : (
              <WifiOff className="h-5 w-5 text-muted-foreground" />
            )}
            Connection Status
          </StationPanelTitle>
        </StationPanelHeader>
        <StationPanelContent className="space-y-6">
          {/* Status Display */}
          <div className="flex min-w-0 items-center gap-4 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
            <div
              className={cn(
                "h-14 w-14 rounded-full flex items-center justify-center",
                "bg-muted/60",
              )}
            >
              <Circle
                className={cn(
                  "h-6 w-6",
                  isOnline
                    ? "fill-current"
                    : "fill-transparent",
                )}
              />
            </div>
            <div>
              <p className="font-semibold text-xl">
                {isOnline ? "Connected" : "Disconnected"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isOnline && station.last_heartbeat_at
                  ? `Online for ${formatDistanceToNow(new Date(station.last_heartbeat_at))}`
                  : station.last_heartbeat_at
                    ? `Offline for ${formatDistanceToNow(new Date(station.last_heartbeat_at))}`
                    : "Status unknown"}
              </p>
            </div>
          </div>

          {/* Signal Strength */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Signal Strength</p>
              <div className="flex items-center gap-2 mt-1">
                <SignalStrength strength={signalStrength} />
                <span className="text-sm font-medium">
                  {signalStrength === 4 && "Excellent"}
                  {signalStrength === 3 && "Good"}
                  {signalStrength === 2 && "Fair"}
                  {signalStrength === 1 && "Weak"}
                  {signalStrength === 0 && "No Signal"}
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Heartbeat</p>
              <p className="font-medium">
                {station.last_heartbeat_at
                  ? format(new Date(station.last_heartbeat_at), "h:mm:ss a")
                  : "—"}
              </p>
            </div>
          </div>

          {/* Test Button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={handleTestConnection}
            disabled={isTesting || !isOnline}
          >
            {isTesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing connection...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Test Connection
              </>
            )}
          </Button>
        </StationPanelContent>
      </StationPanel>

      {/* Network Details */}
      <StationPanel>
        <StationPanelHeader>
          <StationPanelTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Network Details
          </StationPanelTitle>
        </StationPanelHeader>
        <StationPanelContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">IP Address</p>
              <p className="font-mono">{station.ip_address || "—"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Device ID</p>
              <p
                className="font-mono text-xs truncate"
                title={station.device_id || undefined}
              >
                {station.device_id || "—"}
              </p>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border-0 bg-muted/60 p-4 shadow-none">
            <p className="text-sm text-muted-foreground mb-3">
              Network information will be automatically populated when the POS
              app connects to this station.
            </p>
            {!station.device_id && (
              <Badge variant="secondary">Awaiting device registration</Badge>
            )}
          </div>
        </StationPanelContent>
      </StationPanel>

      {/* Sync Status */}
      <StationPanel>
        <StationPanelHeader>
          <StationPanelTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sync Status
          </StationPanelTitle>
        </StationPanelHeader>
        <StationPanelContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Sync Role</p>
              <Badge
                variant={
                  station.sync_role === "leader" ? "default" : "secondary"
                }
              >
                {getSyncRoleLabel(station.sync_role)}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Sync</p>
              <p className="font-medium">
                {station.last_sync_at
                  ? formatDistanceToNow(new Date(station.last_sync_at), {
                      addSuffix: true,
                    })
                  : "Never synced"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Menu data synced</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Settings synced</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Staff data synced</span>
            </div>
          </div>

          {station.sync_role === "leader" && (
            <div className="min-w-0 rounded-2xl border-0 bg-muted/60 p-3 shadow-none">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                As a leader station, this device syncs data to other stations at
                this location.
              </p>
            </div>
          )}
        </StationPanelContent>
      </StationPanel>

      {/* Troubleshooting */}
      <StationPanel>
        <StationPanelHeader>
          <StationPanelTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Troubleshooting
          </StationPanelTitle>
          <StationPanelDescription>
            Common solutions for connection issues
          </StationPanelDescription>
        </StationPanelHeader>
        <StationPanelContent className="space-y-3">
          <div className="space-y-2 text-sm">
            <p className="font-medium">If the station is showing offline:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Check that the device has an active internet connection</li>
              <li>Ensure the POS app is running and not minimized</li>
              <li>Try force-closing and reopening the app</li>
              <li>Verify the device is logged into the correct account</li>
            </ul>
          </div>

          <div className="pt-3">
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://help.dexapos.com/troubleshoot-connection"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Full Guide
              </a>
            </Button>
          </div>
        </StationPanelContent>
      </StationPanel>
    </div>
  );
}
