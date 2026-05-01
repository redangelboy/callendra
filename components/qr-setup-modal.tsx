"use client";

import { QRCodeSVG } from "qrcode.react";

export function QrSetupModal({
  open,
  onClose,
  url,
  hint,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  hint: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-setup-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--callendra-border)] bg-[var(--callendra-bg)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="qr-setup-title" className="text-lg font-semibold text-[var(--callendra-text-primary)] mb-4 text-center">
          Setup QR
        </h3>
        <div className="flex justify-center mb-4 [&_svg]:max-w-full">
          {url ? <QRCodeSVG value={url} size={220} level="M" includeMargin /> : null}
        </div>
        <p className="text-sm text-[var(--callendra-text-secondary)] text-center mb-6">{hint}</p>
        <button
          type="button"
          onClick={onClose}
          className="w-full border border-[var(--callendra-border)] py-3 rounded-xl text-sm font-medium hover:bg-[color-mix(in_srgb,var(--callendra-text-primary)_6%,var(--callendra-bg))] transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}
