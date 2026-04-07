type StaffAvatarSize = "book" | "display";

const SIZE: Record<StaffAvatarSize, string> = {
  /** Lista en booking público / modal */
  book: "w-16 h-16 min-w-[4rem] min-h-[4rem] text-base",
  /** Pantalla display en sucursal / TV — legible a distancia */
  display:
    "w-14 h-14 min-w-[3.5rem] min-h-[3.5rem] text-[10px] sm:w-16 sm:h-16 sm:min-w-[4rem] sm:min-h-[4rem] sm:text-xs md:w-[4.5rem] md:h-[4.5rem] md:min-w-[4.5rem] md:min-h-[4.5rem] md:text-sm lg:w-20 lg:h-20 lg:min-w-[5rem] lg:min-h-[5rem] lg:text-base xl:w-24 xl:h-24 xl:min-w-[6rem] xl:min-h-[6rem] xl:text-lg",
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
