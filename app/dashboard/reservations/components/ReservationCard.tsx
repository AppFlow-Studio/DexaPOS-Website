"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Phone, Clock, Star } from "lucide-react";
import type { Reservation } from "@/types/floor-plan";
import { formatPhoneForDisplay } from "@/lib/phone";

const STATUS_COLORS: Record<Reservation["status"], string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  reminded: "bg-purple-100 text-purple-800",
  arrived: "bg-orange-100 text-orange-800",
  seated: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-600",
  no_show: "bg-red-100 text-red-800",
  cancelled: "bg-red-100 text-red-800",
};

interface ReservationCardProps {
  reservation: Reservation;
  onClick: () => void;
}

export default function ReservationCard({
  reservation,
  onClick,
}: ReservationCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="font-bold text-base truncate">{reservation.party_name}</span>
          <div className="flex items-center gap-1 shrink-0">
            {reservation.is_vip && (
              <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1 px-2 py-0.5">
                <Star className="h-3 w-3" />
                VIP
              </Badge>
            )}
            <Badge className={STATUS_COLORS[reservation.status]}>
              {reservation.status.replace("_", " ")}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {reservation.reservation_time}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {reservation.party_size}
          </span>
          {reservation.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {formatPhoneForDisplay(reservation.phone)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
