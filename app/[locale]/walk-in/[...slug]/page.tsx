"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PublicBookingFlow } from "@/components/public-booking-flow";

const shell =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-[var(--callendra-bg)] px-4 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]";

function WalkInGate() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  if (!token) {
    return (
      <div className={shell}>
        <div className="text-center max-w-md">
          <p className="text-4xl mb-3" aria-hidden>
            🔗
          </p>
          <h1 className="text-lg font-semibold text-[var(--callendra-text-primary)] mb-2">Missing walk-in link</h1>
          <p className="text-sm text-[var(--callendra-text-secondary)]">
            This page needs the full URL from your business (including the secret token). Ask the staff for the iPad link
            or open it from the dashboard.
          </p>
        </div>
      </div>
    );
  }

  return <PublicBookingFlow walkInToken={token} />;
}

export default function WalkInPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex h-[100dvh] max-h-[100dvh] items-center justify-center bg-[var(--callendra-bg)]">
            <div className="text-[var(--callendra-text-primary)] animate-pulse">Loading...</div>
          </div>
        }
      >
        <WalkInGate />
      </Suspense>
    </div>
  );
}
