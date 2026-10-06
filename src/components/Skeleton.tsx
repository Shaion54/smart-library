import React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-100 rounded-lg ${className}`} />;
}

export function SeatCardSkeleton() {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="w-12 h-6" />
        <Skeleton className="w-20 h-5 rounded-full" />
      </div>
      <div className="space-y-2 pt-2">
        <Skeleton className="w-full h-4" />
        <Skeleton className="w-3/4 h-4" />
      </div>
      <div className="pt-3 border-t border-zinc-100">
        <Skeleton className="w-full h-9 rounded-xl" />
      </div>
    </div>
  );
}
