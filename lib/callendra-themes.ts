/**
 * Presets de color Callendra — UI global vía variables CSS `--callendra-*`.
 */

export type CallendraThemeColors = {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  accent: string;
  buttonPrimary: string;
  buttonHover: string;
  success: string;
};

export type CallendraThemeId =
  | "blushGlow"
  | "sageCalm"
  | "clearSky"
  | "softSand"
  | "playfulLight"
  | "lavenderDream"
  | "earthBalance"
  | "warmBlush"
  | "deepOcean"
  | "peachSoft"
  | "goldenLuxe"
  | "appleLight"
  | "appleDark";

export const CALLENDRA_THEMES: Record<CallendraThemeId, CallendraThemeColors> = {
  blushGlow: {
    background: "#E8D4DE",
    surface: "#FFF5F9",
    textPrimary: "#2E1F2A",
    textSecondary: "#6B5563",
    border: "#D4B8C8",
    accent: "#D97AA3",
    buttonPrimary: "#C85A8C",
    buttonHover: "#B34A7A",
    success: "#5AAA88",
  },
  sageCalm: {
    background: "#D4E0D6",
    surface: "#F4FAF5",
    textPrimary: "#1C2820",
    textSecondary: "#5A6A60",
    border: "#B8C8BC",
    accent: "#6F9480",
    buttonPrimary: "#5A8068",
    buttonHover: "#4A6E58",
    success: "#5EAA78",
  },
  clearSky: {
    background: "#B8D4EC",
    surface: "#F0F8FF",
    textPrimary: "#0F2838",
    textSecondary: "#4A6078",
    border: "#98B8D4",
    accent: "#2FA7D8",
    buttonPrimary: "#1E8FC4",
    buttonHover: "#1678A8",
    success: "#3AA888",
  },
  softSand: {
    background: "#E0D2C4",
    surface: "#FAF4EC",
    textPrimary: "#2A221C",
    textSecondary: "#6E5E52",
    border: "#C8B8A8",
    accent: "#A88958",
    buttonPrimary: "#967848",
    buttonHover: "#826838",
    success: "#6A9880",
  },
  playfulLight: {
    background: "#D8DCE4",
    surface: "#F6F8FC",
    textPrimary: "#1C2838",
    textSecondary: "#5A6478",
    border: "#B8C0D0",
    accent: "#E89848",
    buttonPrimary: "#4C9AE6",
    buttonHover: "#3880CC",
    success: "#4AAA78",
  },
  lavenderDream: {
    background: "#D8CCE8",
    surface: "#F6F2FC",
    textPrimary: "#221A30",
    textSecondary: "#5E5470",
    border: "#C0B0D8",
    accent: "#8A68D0",
    buttonPrimary: "#7858B8",
    buttonHover: "#6648A0",
    success: "#58A888",
  },
  earthBalance: {
    background: "#D4CCC0",
    surface: "#F4F0E8",
    textPrimary: "#28241C",
    textSecondary: "#625A50",
    border: "#B8B0A0",
    accent: "#8A7A58",
    buttonPrimary: "#6E6248",
    buttonHover: "#5A5238",
    success: "#5A8860",
  },
  warmBlush: {
    background: "#E0CCC8",
    surface: "#FCF4F2",
    textPrimary: "#302420",
    textSecondary: "#6E5858",
    border: "#C8B0A8",
    accent: "#C87870",
    buttonPrimary: "#B86058",
    buttonHover: "#A04840",
    success: "#58A080",
  },
  deepOcean: {
    background: "#A8B8CC",
    surface: "#E8EEF4",
    textPrimary: "#101C28",
    textSecondary: "#485868",
    border: "#8898AC",
    accent: "#4A78B8",
    buttonPrimary: "#284A78",
    buttonHover: "#1C3A60",
    success: "#3A9870",
  },
  peachSoft: {
    background: "#E0C8BC",
    surface: "#FCF4F0",
    textPrimary: "#302018",
    textSecondary: "#6E5850",
    border: "#C8A898",
    accent: "#D88050",
    buttonPrimary: "#C06840",
    buttonHover: "#A85030",
    success: "#58A078",
  },
  goldenLuxe: {
    background: "#060607",
    surface: "#0E0E10",
    textPrimary: "#F2F2F2",
    textSecondary: "#A8A8A8",
    border: "#242428",
    accent: "#D4AF37",
    buttonPrimary: "#D4AF37",
    buttonHover: "#B8962E",
    success: "#3A9868",
  },
  /** Inspirado en el modo claro del sistema Apple (grises + azul sistema) */
  appleLight: {
    background: "#FFFFFF",
    surface: "#FFFFFF",
    textPrimary: "#000000",
    textSecondary: "#3C3C43",
    border: "#C6C6C8",
    accent: "#007AFF",
    buttonPrimary: "#007AFF",
    buttonHover: "#0062CC",
    success: "#34C759",
  },
  /** Inspirado en el modo oscuro del sistema Apple (negro / gris elevado + azul sistema) */
  appleDark: {
    background: "#000000",
    surface: "#1C1C1E",
    textPrimary: "#FFFFFF",
    textSecondary: "#98989D",
    border: "#38383A",
    accent: "#0A84FF",
    buttonPrimary: "#0A84FF",
    buttonHover: "#409CFF",
    success: "#30D158",
  },
};

export const GOLDEN_LUXE_BUTTON_GRADIENT =
  "linear-gradient(135deg, #D4AF37, #F5D76E)";

/** IDs en orden estable para selects */
export const CALLENDRA_THEME_IDS = Object.keys(CALLENDRA_THEMES) as CallendraThemeId[];

export const THEME_LABELS: Record<CallendraThemeId, { title: string; mood: string }> = {
  blushGlow: { title: "Blush Glow", mood: "Suave, femenino, moderno" },
  sageCalm: { title: "Sage Calm", mood: "Natural, relajante" },
  clearSky: { title: "Clear Sky", mood: "Limpio, confiable" },
  softSand: { title: "Soft Sand", mood: "Lujo cálido" },
  playfulLight: { title: "Playful Light", mood: "Amigable, ligero" },
  lavenderDream: { title: "Lavender Dream", mood: "Beauty aesthetic" },
  earthBalance: { title: "Earth Balance", mood: "Natural, grounded" },
  warmBlush: { title: "Warm Blush", mood: "Sofisticado moderno" },
  deepOcean: { title: "Deep Ocean", mood: "Profesional, confianza" },
  peachSoft: { title: "Peach Soft", mood: "Cálido, lifestyle" },
  goldenLuxe: { title: "Golden Luxe", mood: "Premium, elegante (VIP / high-end)" },
  appleLight: { title: "Apple Light", mood: "Gris sistema, blanco y azul (estilo iOS claro)" },
  appleDark: { title: "Apple Dark", mood: "Negro, grises elevados y azul (estilo iOS oscuro)" },
};

/** Filtro del primer dropdown → lista de IDs permitidos en el segundo */
export type ThemeCategoryFilterId = "all" | "softWarm" | "natural" | "freshTrust" | "beauty" | "premium";

export const THEME_CATEGORY_OPTIONS: { id: ThemeCategoryFilterId; label: string }[] = [
  { id: "all", label: "Todos los estilos" },
  { id: "softWarm", label: "Suaves y cálidos" },
  { id: "natural", label: "Naturales" },
  { id: "freshTrust", label: "Frescos y confianza" },
  { id: "beauty", label: "Beauty & lifestyle" },
  { id: "premium", label: "Premium" },
];

const THEME_BY_CATEGORY: Record<ThemeCategoryFilterId, CallendraThemeId[] | null> = {
  all: null,
  softWarm: ["blushGlow", "warmBlush", "peachSoft", "playfulLight", "softSand"],
  natural: ["sageCalm", "earthBalance"],
  freshTrust: ["clearSky", "deepOcean", "appleLight"],
  beauty: ["lavenderDream"],
  premium: ["goldenLuxe", "appleDark"],
};

export function themesForCategory(cat: ThemeCategoryFilterId): CallendraThemeId[] {
  const list = THEME_BY_CATEGORY[cat];
  if (list == null) return [...CALLENDRA_THEME_IDS];
  return list;
}

export function isValidThemeId(id: string): id is CallendraThemeId {
  return id in CALLENDRA_THEMES;
}

export const DEFAULT_THEME_ID: CallendraThemeId = "clearSky";

/** Genera el bloque `:root { ... }` para inyectar en `<style>` */
export function buildThemeStyleInnerHTML(preset: string): string {
  const id = isValidThemeId(preset) ? preset : DEFAULT_THEME_ID;
  const t = CALLENDRA_THEMES[id];
  const buttonPrimaryBg =
    id === "goldenLuxe" ? GOLDEN_LUXE_BUTTON_GRADIENT : t.buttonPrimary;
  return `:root {
  --callendra-bg: ${t.background};
  --callendra-surface: ${t.surface};
  --callendra-text-primary: ${t.textPrimary};
  --callendra-text-secondary: ${t.textSecondary};
  --callendra-border: ${t.border};
  --callendra-accent: ${t.accent};
  --callendra-button-primary: ${t.buttonPrimary};
  --callendra-button-hover: ${t.buttonHover};
  --callendra-button-primary-bg: ${buttonPrimaryBg};
  --callendra-on-primary: #ffffff;
  --callendra-success: ${t.success};
}`;
}
