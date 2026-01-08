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
    "bg-blue-50/50 border-l-blue-500 text-blue-700 dark:bg-blue-900/10 dark:border-l-blue-400 dark:text-blue-300 border-y border-r border-y-blue-200/50 border-r-blue-200/50 dark:border-y-blue-800/20 dark:border-r-blue-800/20",
  kitchen:
    "bg-orange-50/50 border-l-orange-500 text-orange-700 dark:bg-orange-900/10 dark:border-l-orange-400 dark:text-orange-300 border-y border-r border-y-orange-200/50 border-r-orange-200/50 dark:border-y-orange-800/20 dark:border-r-orange-800/20",
  cashier:
    "bg-green-50/50 border-l-green-500 text-green-700 dark:bg-green-900/10 dark:border-l-green-400 dark:text-green-300 border-y border-r border-y-green-200/50 border-r-green-200/50 dark:border-y-green-800/20 dark:border-r-green-800/20",
  manager:
    "bg-purple-50/50 border-l-purple-500 text-purple-700 dark:bg-purple-900/10 dark:border-l-purple-400 dark:text-purple-300 border-y border-r border-y-purple-200/50 border-r-purple-200/50 dark:border-y-purple-800/20 dark:border-r-purple-800/20",
  driver:
    "bg-slate-50/50 border-l-slate-500 text-slate-700 dark:bg-slate-900/10 dark:border-l-slate-400 dark:text-slate-300 border-y border-r border-y-slate-200/50 border-r-slate-200/50 dark:border-y-slate-800/20 dark:border-r-slate-800/20",
};

export function ShiftCard({ shift, onClick }: ShiftCardProps) {
  const start = parseISO(shift.start_time);
  const end = parseISO(shift.end_time);

  const colorClass =
    roleColors[shift.role] ||
    "bg-gray-50/50 border-l-gray-500 text-gray-700 border-y border-r border-y-gray-200/50 border-r-gray-200/50";

  return (
    <motion.div
      layout
      layoutId={shift.id}
      whileHover={{ scale: 1.02, zIndex: 10 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "p-2 rounded-r-md border-l-4 text-xs cursor-pointer shadow-sm hover:shadow-md select-none relative overflow-hidden transition-all duration-200",
        colorClass
      )}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="font-bold capitalize truncate pr-2">
            {shift.role}
          </span>
        </div>
        <div className="flex items-center gap-1 opacity-90 text-[10px] font-medium">
          <Clock className="h-3 w-3" />
          <span>
            {format(start, "HH:mm")} - {format(end, "HH:mm")}
          </span>
        </div>
        {shift.notes && (
          <div className="mt-1 text-[9px] opacity-75 truncate border-t border-black/5 dark:border-white/5 pt-0.5 font-light">
            {shift.notes}
          </div>
        )}
      </div>
    </motion.div>
  );
}
