"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  StationPanel,
  StationPanelContent,
  StationPanelDescription,
  StationPanelHeader,
  StationPanelTitle,
} from "./StationPanel";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  RefreshCw,
  Trash2,
  RotateCcw,
  LogOut,
  Power,
  Send,
  FileText,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Station } from "@/app/dashboard/actions/stations";
import { RemoteActionType } from "@/app/dashboard/actions/station-remote-actions";
import { useStationRemoteAction } from "../../hooks/useStationRemoteActions";

interface RemoteActionsPanelProps {
  station: Station;
}

interface ActionConfig {
  type: RemoteActionType;
  label: string;
  description: string;
  icon: React.ReactNode;
  variant: "outline" | "destructive";
  requiresConfirm: boolean;
  confirmTitle?: string;
  confirmDescription?: string;
  disableWhenOffline: boolean;
}

const ACTIONS: ActionConfig[] = [
  {
    type: "force_refresh",
    label: "Force Refresh",
    description: "Reload all data on the station",
    icon: <RefreshCw className="h-4 w-4" />,
    variant: "outline",
    requiresConfirm: false,
    disableWhenOffline: true,
  },
  {
    type: "clear_cache",
    label: "Clear Cache",
    description: "Clear local cached data",
    icon: <Trash2 className="h-4 w-4" />,
    variant: "outline",
    requiresConfirm: false,
    disableWhenOffline: true,
  },
  {
    type: "restart_app",
    label: "Restart App",
    description: "Restart the POS application",
    icon: <RotateCcw className="h-4 w-4" />,
    variant: "outline",
    requiresConfirm: false,
    disableWhenOffline: true,
  },
  {
    type: "config_update",
    label: "Push Config",
    description: "Push latest configuration to station",
    icon: <Send className="h-4 w-4" />,
    variant: "outline",
    requiresConfirm: false,
    disableWhenOffline: true,
  },
  {
    type: "send_logs",
    label: "Request Logs",
    description: "Request diagnostic logs from station",
    icon: <FileText className="h-4 w-4" />,
    variant: "outline",
    requiresConfirm: false,
    disableWhenOffline: true,
  },
  {
    type: "force_logout",
    label: "Log Out Station",
    description: "Force log out the current user",
    icon: <LogOut className="h-4 w-4" />,
    variant: "outline",
    requiresConfirm: true,
    confirmTitle: "Log Out Station?",
    confirmDescription:
      "This will immediately log out any active user session on this station. Any unsaved work will be lost.",
    disableWhenOffline: true,
  },
  {
    type: "deactivate",
    label: "Deactivate Station",
    description: "Deactivate and disconnect this station",
    icon: <Power className="h-4 w-4" />,
    variant: "destructive",
    requiresConfirm: true,
    confirmTitle: "Deactivate Station?",
    confirmDescription:
      "This will deactivate the station and disconnect it from the system. The station will need to be reactivated before it can be used again.",
    disableWhenOffline: false,
  },
];

export function RemoteActionsPanel({ station }: RemoteActionsPanelProps) {
  const { execute, pendingAction } = useStationRemoteAction();
  const [confirmAction, setConfirmAction] = useState<ActionConfig | null>(null);

  const isOnline = station.is_active && station.is_online;

  const handleAction = async (action: ActionConfig) => {
    if (action.requiresConfirm) {
      setConfirmAction(action);
      return;
    }
    await execute(station.id, action.type);
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    await execute(station.id, confirmAction.type);
    setConfirmAction(null);
  };

  return (
    <>
      <StationPanel>
        <StationPanelHeader>
          <StationPanelTitle>Remote Actions</StationPanelTitle>
          <StationPanelDescription>
            Send commands to this station remotely. Actions are broadcast in
            real-time to the POS device.
          </StationPanelDescription>
        </StationPanelHeader>
        <StationPanelContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ACTIONS.map((action) => {
              const isDisabled =
                (action.disableWhenOffline && !isOnline) ||
                pendingAction !== null;
              const isLoading = pendingAction === action.type;

              return (
                <Button
                  key={action.type}
                  variant={action.variant}
                  className="h-auto py-3 px-4 flex flex-col items-start gap-1 text-left"
                  disabled={isDisabled}
                  onClick={() => handleAction(action)}
                >
                  <div className="flex items-center gap-2 w-full">
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      action.icon
                    )}
                    <span className="font-medium">{action.label}</span>
                  </div>
                  <span className="text-xs font-normal opacity-70">
                    {action.description}
                  </span>
                </Button>
              );
            })}
          </div>

          {!isOnline && (
            <p className="text-sm text-muted-foreground mt-4">
              Some actions are unavailable while the station is offline.
            </p>
          )}
        </StationPanelContent>
      </StationPanel>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open && !pendingAction) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>{confirmAction?.confirmTitle}</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-3">
              {confirmAction?.confirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={!!pendingAction}
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!pendingAction}
            >
              {pendingAction ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                confirmAction?.label
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
