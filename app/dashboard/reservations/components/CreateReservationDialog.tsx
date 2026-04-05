"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useCreateReservation } from "@/app/dashboard/hooks/useReservations";
import { detectReservationConflict } from "@/lib/reservations/conflict-detection";
import type { ConflictResult } from "@/lib/reservations/conflict-detection";
import type { Reservation } from "@/types/floor-plan";

const schema = z.object({
  partyName: z.string().min(1, "Name required"),
  partySize: z.number().int().min(1).max(20),
  phone: z.string().min(7, "Valid phone required"),
  reservationDate: z.string(),
  reservationTime: z.string(),
  durationMinutes: z.number().default(90),
  isVip: z.boolean().default(false),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface CreateReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  existingReservations: Reservation[];
}

export default function CreateReservationDialog({
  open,
  onOpenChange,
  defaultDate,
  existingReservations,
}: CreateReservationDialogProps) {
  const [conflictWarning, setConflictWarning] = useState<ConflictResult | null>(null);
  const [forceCreate, setForceCreate] = useState(false);

  const mutation = useCreateReservation(defaultDate);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      partyName: "",
      partySize: 2,
      phone: "",
      reservationDate: defaultDate,
      reservationTime: "19:00",
      durationMinutes: 90,
      isVip: false,
      notes: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!forceCreate) {
      const conflict = detectReservationConflict(
        {
          reservationDate: values.reservationDate,
          reservationTime: values.reservationTime,
          durationMinutes: values.durationMinutes,
          assignedTableIds: [],
        },
        existingReservations,
      );
      if (conflict) {
        setConflictWarning(conflict);
        return;
      }
    }

    await mutation.mutateAsync({
      partyName: values.partyName,
      partySize: values.partySize,
      phone: values.phone,
      reservationDate: values.reservationDate,
      reservationTime: values.reservationTime,
      durationMinutes: values.durationMinutes,
      isVip: values.isVip,
      notes: values.notes,
    });
    onOpenChange(false);
    form.reset();
    setConflictWarning(null);
    setForceCreate(false);
  };

  const handleCreateAnyway = () => {
    setForceCreate(true);
    setConflictWarning(null);
    form.handleSubmit(onSubmit)();
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      form.reset();
      setConflictWarning(null);
      setForceCreate(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Reservation</DialogTitle>
        </DialogHeader>

        {conflictWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Table conflict: {conflictWarning.reason}. You can proceed anyway.
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="partyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Party Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Guest name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="partySize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Party Size</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+1 555 000 0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="reservationDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reservationTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isVip"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">VIP Guest</FormLabel>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any special notes..."
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {conflictWarning ? (
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConflictWarning(null)}
                >
                  Go Back
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateAnyway}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Anyway
                </Button>
              </DialogFooter>
            ) : (
              <DialogFooter>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Reservation
                </Button>
              </DialogFooter>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
