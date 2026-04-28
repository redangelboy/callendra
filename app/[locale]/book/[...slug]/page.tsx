"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PublicBookingFlow } from "@/components/public-booking-flow";

function BookPageInner() {
  const searchParams = useSearchParams();
  const walkInToken = searchParams.get("token")?.trim() || null;
  return <PublicBookingFlow walkInToken={walkInToken} />;
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] max-h-[100dvh] items-center justify-center bg-[var(--callendra-bg)]">
          <div className="text-[var(--callendra-text-primary)] animate-pulse">Loading...</div>
        </div>
      }
    >
      <BookPageInner />
    </Suspense>
  );
}
