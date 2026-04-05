import { buildThemeStyleInnerHTML } from "@/lib/callendra-themes";

type Variant = "base" | "override";

/**
 * Inyecta variables CSS `--callendra-*` en :root.
 * - `base`: marketing / login (tema por defecto del sitio).
 * - `override`: dashboard, book, display (tema del negocio; debe ir después del base en el DOM).
 */
export function CallendraThemeStyle({
  preset,
  variant = "base",
}: {
  preset: string;
  variant?: Variant;
}) {
  const id =
    variant === "base" ? "callendra-theme-base" : "callendra-theme-override";
  return (
    <style
      id={id}
      dangerouslySetInnerHTML={{ __html: buildThemeStyleInnerHTML(preset) }}
    />
  );
}
