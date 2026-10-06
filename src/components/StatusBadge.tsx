import React from "react";
import { SeatDisplayStatus } from "@/types/database";
import { CheckCircle2, User, Clock, Wrench, WifiOff } from "lucide-react";

interface StatusBadgeProps {
  status: SeatDisplayStatus | "active" | "cancelled" | "expired" | "completed";
  size?: "sm" | "md";
}

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  let label: string = status;
  let bgClass = "bg-zinc-50 text-zinc-700 border-zinc-200";
  let icon = <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />;

  switch (status) {
    case "Available":
      label = "Available";
      bgClass = "bg-green-50 text-green-700 border-green-200";
      icon = <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
      break;
    case "Occupied":
      label = "Occupied";
      bgClass = "bg-red-50 text-red-700 border-red-200";
      icon = <User className="w-3.5 h-3.5 text-red-600" />;
      break;
    case "Reserved":
    case "active":
      label = status === "active" ? "Active" : "Reserved";
      bgClass = "bg-blue-50 text-blue-700 border-blue-200";
      icon = <Clock className="w-3.5 h-3.5 text-blue-600" />;
      break;
    case "Maintenance":
      label = "Maintenance";
      bgClass = "bg-amber-50 text-amber-700 border-amber-200";
      icon = <Wrench className="w-3.5 h-3.5 text-amber-600" />;
      break;
    case "Offline":
      label = "Offline";
      bgClass = "bg-zinc-100 text-zinc-600 border-zinc-200";
      icon = <WifiOff className="w-3.5 h-3.5 text-zinc-500" />;
      break;
    case "cancelled":
      label = "Cancelled";
      bgClass = "bg-zinc-100 text-zinc-500 border-zinc-200";
      icon = <Clock className="w-3.5 h-3.5 text-zinc-400" />;
      break;
    case "expired":
      label = "Expired";
      bgClass = "bg-zinc-100 text-zinc-500 border-zinc-200";
      icon = <Clock className="w-3.5 h-3.5 text-zinc-400" />;
      break;
    case "completed":
      label = "Completed";
      bgClass = "bg-green-50 text-green-700 border-green-200";
      icon = <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
      break;
  }

  const paddingClass = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${bgClass} ${paddingClass}`}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}
