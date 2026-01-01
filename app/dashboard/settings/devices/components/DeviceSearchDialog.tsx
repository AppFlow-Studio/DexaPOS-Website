"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Device,
  getDeviceTypeLabel,
  getDeviceTypeIcon,
} from "../hooks/useDevices";
import {
  Search,
  Circle,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface DeviceSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: Device[];
}

export function DeviceSearchDialog({
  open,
  onOpenChange,
  devices,
}: DeviceSearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter devices based on query
  const filteredDevices = devices.filter((device) => {
    if (!query.trim()) return true;
    const searchTerm = query.toLowerCase();
    return (
      device.name.toLowerCase().includes(searchTerm) ||
      device.serialNumber?.toLowerCase().includes(searchTerm) ||
      device.model?.toLowerCase().includes(searchTerm) ||
      getDeviceTypeLabel(device.type).toLowerCase().includes(searchTerm)
    );
  });

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredDevices.length > 0) {
      const selectedItem = listRef.current.children[
        selectedIndex
      ] as HTMLElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, filteredDevices.length]);

  const handleSelect = useCallback(
    (device: Device) => {
      onOpenChange(false);
      router.push(`/dashboard/settings/devices/${device.id}`);
    },
    [onOpenChange, router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredDevices.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredDevices[selectedIndex]) {
            handleSelect(filteredDevices[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [filteredDevices, selectedIndex, handleSelect, onOpenChange]
  );

  // Status indicator with aria-label
  const StatusIndicator = ({ device }: { device: Device }) => {
    const isOnline = device.status === "online";
    let ariaLabel = isOnline ? "Online" : "Offline";

    if (!isOnline && device.offlineSince) {
      ariaLabel = `Offline for ${formatDistanceToNow(
        new Date(device.offlineSince)
      )}`;
    }

    return (
      <div
        className="flex items-center gap-1"
        role="status"
        aria-label={ariaLabel}
      >
        <Circle
          className={cn(
            "h-2 w-2",
            isOnline
              ? "fill-green-500 text-green-500"
              : "fill-gray-400 text-gray-400"
          )}
          aria-hidden="true"
        />
        <span
          className={cn(
            "text-xs",
            isOnline ? "text-green-600" : "text-gray-500"
          )}
          aria-hidden="true"
        >
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl p-0 gap-0 overflow-hidden"
        aria-label="Search devices"
      >
        <DialogTitle className="sr-only">Search devices</DialogTitle>

        {/* Search Input */}
        <div className="flex items-center border-b px-4 py-3">
          <Search
            className="h-5 w-5 text-muted-foreground mr-3"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search devices by name, serial, or type..."
            className="border-0 p-0 h-auto text-base shadow-none focus-visible:ring-0"
            aria-label="Search devices"
            aria-activedescendant={
              filteredDevices[selectedIndex]
                ? `device-option-${filteredDevices[selectedIndex].id}`
                : undefined
            }
            role="combobox"
            aria-expanded={open}
            aria-controls="device-search-results"
            aria-autocomplete="list"
          />
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          id="device-search-results"
          role="listbox"
          className="max-h-[60vh] overflow-y-auto py-2"
          aria-label="Device search results"
        >
          <AnimatePresence mode="wait">
            {filteredDevices.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                <p>No devices found</p>
                <p className="text-sm mt-1">Try a different search term</p>
              </motion.div>
            ) : (
              filteredDevices.map((device, index) => (
                <motion.div
                  key={device.id}
                  id={`device-option-${device.id}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02, duration: 0.15 }}
                  onClick={() => handleSelect(device)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-100",
                    index === selectedIndex ? "bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  {/* Device Icon */}
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-background border text-lg shrink-0"
                    role="img"
                    aria-label={getDeviceTypeLabel(device.type)}
                  >
                    <span aria-hidden="true">
                      {getDeviceTypeIcon(device.type)}
                    </span>
                  </div>

                  {/* Device Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {device.name}
                      </span>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {getDeviceTypeLabel(device.type)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <StatusIndicator device={device} />
                      {device.serialNumber && (
                        <span className="text-xs text-muted-foreground font-mono truncate">
                          {device.serialNumber}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Selection indicator */}
                  {index === selectedIndex && (
                    <CornerDownLeft
                      className="h-4 w-4 text-muted-foreground shrink-0"
                      aria-hidden="true"
                    />
                  )}
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Footer with keyboard hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono">
                ↓
              </kbd>
              <span className="ml-1">Navigate</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono">
                ↵
              </kbd>
              <span className="ml-1">Select</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono">
                esc
              </kbd>
              <span className="ml-1">Close</span>
            </div>
          </div>
          <span>
            {filteredDevices.length} device
            {filteredDevices.length !== 1 ? "s" : ""}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
