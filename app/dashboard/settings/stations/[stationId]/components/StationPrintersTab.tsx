"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  useStationPrinters,
  useDeletePrinter,
  getPrinterRoleLabel,
  getPrinterRoleIcon,
  getPrinterTypeLabel,
  getPrinterConnectionTypeLabel,
  Printer,
  PrinterRole,
  PrinterType,
  PrinterConnectionType,
} from "../../hooks/usePrinters";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  Circle,
  Wifi,
  Bluetooth,
  Usb,
  Loader2,
  AlertTriangle,
  Printer as PrinterIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddPrinterDialog } from "./AddPrinterDialog";

interface StationPrintersTabProps {
  station: Station;
}

function ConnectionIcon({ type }: { type: string }) {
  switch (type) {
    case "usb":
      return <Usb className="h-4 w-4" />;
    case "bluetooth":
      return <Bluetooth className="h-4 w-4" />;
    case "network":
      return <Wifi className="h-4 w-4" />;
    default:
      return <Wifi className="h-4 w-4" />;
  }
}

export function StationPrintersTab({ station }: StationPrintersTabProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [printerToEdit, setPrinterToEdit] = useState<Printer | undefined>(
    undefined,
  );
  const [printerToDelete, setPrinterToDelete] = useState<Printer | null>(null);

  const { data: printers, isLoading } = useStationPrinters(station.id);
  const deleteMutation = useDeletePrinter();

  const handleDeletePrinter = async () => {
    if (!printerToDelete) return;
    try {
      await deleteMutation.mutateAsync(printerToDelete.id);
      setPrinterToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleEdit = (printer: Printer) => {
    setPrinterToEdit(printer);
    setIsAddDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      setTimeout(() => setPrinterToEdit(undefined), 200);
    }
  };

  if (isLoading) {
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

  const hasPrinters = printers && printers.length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Printers</CardTitle>
              <CardDescription>
                Dedicated printers configured for this station
              </CardDescription>
            </div>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Printer
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!hasPrinters ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <PrinterIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No printers configured</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-2">
                Add receipt, kitchen, or label printers to this station.
              </p>
              <Button
                className="mt-6"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Printer
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Printer</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Connection</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Defaults</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {printers.map((printer) => (
                  <TableRow key={printer.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xl">
                          {getPrinterRoleIcon(
                            printer.printer_role as PrinterRole,
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{printer.printer_name}</p>
                          {printer.printer_model && (
                            <p className="text-sm text-muted-foreground">
                              {printer.printer_model}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {getPrinterRoleLabel(
                          printer.printer_role as PrinterRole,
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {getPrinterTypeLabel(
                          printer.printer_type as PrinterType,
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ConnectionIcon type={printer.connection_type} />
                        <span className="text-sm">
                          {getPrinterConnectionTypeLabel(
                            printer.connection_type as PrinterConnectionType,
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          printer.is_connected
                            ? "border-green-500/50 bg-green-500/10 text-green-600"
                            : "border-gray-400/50 bg-gray-100 text-gray-600",
                        )}
                      >
                        <Circle
                          className={cn(
                            "mr-1 h-2 w-2",
                            printer.is_connected
                              ? "fill-green-500 text-green-500"
                              : "fill-gray-400 text-gray-400",
                          )}
                        />
                        {printer.is_connected ? "Connected" : "Disconnected"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {printer.is_default_receipt && (
                          <Badge
                            variant="outline"
                            className="border-blue-500/50 bg-blue-500/10 text-blue-600 text-xs"
                          >
                            Receipt
                          </Badge>
                        )}
                        {printer.is_default_kitchen && (
                          <Badge
                            variant="outline"
                            className="border-orange-500/50 bg-orange-500/10 text-orange-600 text-xs"
                          >
                            Kitchen
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleEdit(printer)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setPrinterToDelete(printer)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove Printer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Printer Dialog */}
      <AddPrinterDialog
        open={isAddDialogOpen}
        onOpenChange={handleDialogClose}
        stationId={station.id}
        printerToEdit={printerToEdit}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!printerToDelete}
        onOpenChange={(open) => !open && setPrinterToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle>Remove Printer</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-3">
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {printerToDelete?.printer_name}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {printerToDelete && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <span className="text-2xl">
                {getPrinterRoleIcon(
                  printerToDelete.printer_role as PrinterRole,
                )}
              </span>
              <div>
                <p className="font-medium">{printerToDelete.printer_name}</p>
                <p className="text-sm text-muted-foreground">
                  {getPrinterRoleLabel(
                    printerToDelete.printer_role as PrinterRole,
                  )}{" "}
                  Printer
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePrinter}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Printer"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
