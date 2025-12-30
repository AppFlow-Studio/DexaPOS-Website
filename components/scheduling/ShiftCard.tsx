"use client";

import { motion } from "motion/react";
import { Shift } from "@/types/schedule";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

interface ShiftCardProps {
  shift: Shift;
  onClick?: () => void;
}

const roleColors: Record<string, string> = {
  server:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800",
  kitchen:
    "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800",
  cashier:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800",
  manager:
    "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800",
  driver:
    "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-200 dark:border-slate-800",
};

export function ShiftCard({ shift, onClick }: ShiftCardProps) {
  const start = parseISO(shift.start_time);
  const end = parseISO(shift.end_time);

  const colorClass =
    roleColors[shift.role] || "bg-gray-100 text-gray-800 border-gray-200";

  return (
    <motion.div
      layout
      layoutId={shift.id}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "p-2 rounded-md border text-xs cursor-pointer shadow-sm select-none relative overflow-hidden",
        colorClass
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between font-semibold">
          <span className="capitalize">{shift.role}</span>
        </div>
        <div className="flex items-center gap-1 opacity-90">
          <Clock className="h-3 w-3" />
          <span>
            {format(start, "HH:mm")} - {format(end, "HH:mm")}
          </span>
        </div>
        {shift.notes && (
          <div className="mt-1 text-[10px] opacity-75 truncate border-t border-black/10 pt-1">
            {shift.notes}
          </div>
        )}
      </div>

      {/* Status Indicator (if needed later) */}
      {/* <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-500" /> */}
    </motion.div>
  );
}
