type StaffAvatarSize = "book" | "display";

const SIZE: Record<StaffAvatarSize, string> = {
  /** Lista en booking público */
  book: "w-20 h-20 min-w-[5rem] min-h-[5rem] text-xl",
  /** Tarjetas en pantalla display */
  display: "w-32 h-32 min-w-[8rem] min-h-[8rem] text-3xl",
};

/**
 * Foto de staff o inicial; mismo origen de datos que Manage staff (`photo` en API).
 */
export function StaffAvatar({
  name,
  photo,
  size = "book",
  className = "",
}: {
  name: string;
  photo?: string | null;
  size?: StaffAvatarSize;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const shell = `${SIZE[size]} shrink-0 rounded-full border-2 border-[var(--callendra-border)] bg-[color-mix(in_srgb,var(--callendra-text-primary)_10%,var(--callendra-bg))] flex items-center justify-center font-bold text-[var(--callendra-accent)] overflow-hidden ${className}`;

  if (photo) {
    return (
      <div className={shell}>
        <img src={photo} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className={shell} aria-hidden>
      {initial}
    </div>
  );
}
