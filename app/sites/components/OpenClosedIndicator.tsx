"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DaySchedule {
  enabled?: boolean;
  from?: string;
  to?: string;
  is24Hours?: boolean;
  closed?: boolean;
  open?: string;
  close?: string;
  hours?: string;
}

interface OpenClosedIndicatorProps {
  businessHours: any; // Can be various formats from the database
  className?: string;
  showSchedule?: boolean;
}

// Parse business hours from various formats
function parseBusinessHours(businessHours: any): Record<string, DaySchedule> {
  if (!businessHours) return {};

  // If it's a string, try to parse as JSON
  let parsed = businessHours;
  if (typeof businessHours === "string") {
    try {
      parsed = JSON.parse(businessHours);
    } catch {
      return {};
    }
  }

  return parsed;
}

// Get current day key
function getCurrentDay(): string {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[new Date().getDay()];
}

// Convert time string to minutes for comparison
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

// Check if currently open
function isCurrentlyOpen(schedule: DaySchedule | undefined): boolean {
  if (!schedule) return false;

  // Handle different schema formats
  const isEnabled = schedule.enabled ?? !schedule.closed;
  if (!isEnabled) return false;

  // 24 hours
  if (schedule.is24Hours) return true;

  // Get open/close times
  const openTime = schedule.from || schedule.open;
  const closeTime = schedule.to || schedule.close;

  if (!openTime || !closeTime) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);

  // Handle overnight hours (close is before open)
  if (closeMinutes < openMinutes) {
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

// Format time for display
function formatTime(time: string): string {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${(minutes || 0)
    .toString()
    .padStart(2, "0")} ${period}`;
}

export function OpenClosedIndicator({
  businessHours,
  className,
  showSchedule = false,
}: OpenClosedIndicatorProps) {
  const { isOpen, todaySchedule, nextOpenTime } = useMemo(() => {
    const hours = parseBusinessHours(businessHours);
    const currentDay = getCurrentDay();
    const todaySchedule = hours[currentDay];
    const isOpen = isCurrentlyOpen(todaySchedule);

    // Find next open time if currently closed
    let nextOpenTime = "";
    if (!isOpen && todaySchedule) {
      const openTime = todaySchedule.from || todaySchedule.open;
      if (openTime) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const openMinutes = timeToMinutes(openTime);

        if (currentMinutes < openMinutes) {
          nextOpenTime = formatTime(openTime);
        }
      }
    }

    return { isOpen, todaySchedule, nextOpenTime };
  }, [businessHours]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("inline-flex items-center gap-2", className)}
    >
      {isOpen ? (
        <>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <CheckCircle className="h-4 w-4" />
            </motion.div>
            <span className="text-sm font-semibold">Open Now</span>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
            <XCircle className="h-4 w-4" />
            <span className="text-sm font-semibold">Closed</span>
          </div>
          {nextOpenTime && (
            <span className="text-xs text-gray-500">
              Opens at {nextOpenTime}
            </span>
          )}
        </>
      )}

      {showSchedule && todaySchedule && (
        <div className="flex items-center gap-1 text-xs text-gray-500 ml-2">
          <Clock className="h-3 w-3" />
          {todaySchedule.is24Hours ? (
            <span>24 hours</span>
          ) : (
            <span>
              {formatTime(todaySchedule.from || todaySchedule.open || "")} -{" "}
              {formatTime(todaySchedule.to || todaySchedule.close || "")}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
