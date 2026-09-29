import type { CSSProperties } from "react";
import type { Settings, ThemeColors } from "./types";
import { paletteColors } from "./themePalette";

export const themePresets: Record<string, ThemeColors> = {
  original: {
    background: "#151210",
    sidebar: "#181411",
    surface: "#1c1814",
    surfaceRaised: "#241e18",
    field: "#211a15",
    border: "#322a23",
    text: "#e9e2d7",
    muted: "#9d9286",
    accent: "#ad92df",
    accentText: "#201529",
    button: "#aa8bdb",
    buttonText: "#201529",
  },
  light: {
    background: "#f7f5f1",
    sidebar: "#eeeae3",
    surface: "#ffffff",
    surfaceRaised: "#f2eee8",
    field: "#faf8f5",
    border: "#d5cfc5",
    text: "#28231e",
    muted: "#70665c",
    accent: "#6842a6",
    accentText: "#ffffff",
    button: "#6842a6",
    buttonText: "#ffffff",
  },
  night: {
    background: "#20242c",
    sidebar: "#1b2028",
    surface: "#2a303a",
    surfaceRaised: "#343b46",
    field: "#252b34",
    border: "#48505c",
    text: "#f2f0ec",
    muted: "#b3bbc7",
    accent: "#bca4ef",
    accentText: "#241a34",
    button: "#bca4ef",
    buttonText: "#241a34",
  },
  dark: {
    background: "#000000",
    sidebar: "#080808",
    surface: "#111111",
    surfaceRaised: "#1a1a1a",
    field: "#141414",
    border: "#353535",
    text: "#f5f5f5",
    muted: "#aaa4ae",
    accent: "#c8aaff",
    accentText: "#180d24",
    button: "#c8aaff",
    buttonText: "#180d24",
  },
};
export const themeColorLabels: Record<keyof ThemeColors, string> = {
  background: "Fundo da página",
  sidebar: "Menu lateral",
  surface: "Cards e painéis",
  surfaceRaised: "Superfície elevada",
  field: "Campos de formulário",
  border: "Bordas",
  text: "Texto principal",
  muted: "Texto secundário",
  accent: "Destaque",
  accentText: "Texto sobre destaque",
  button: "Botões principais",
  buttonText: "Texto dos botões",
};

function rgb(hex: string) {
  return [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16));
}
function mix(a: string, b: string, ratio: number) {
  const aa = rgb(a),
    bb = rgb(b);
  return `#${aa
    .map((n, i) =>
      Math.round(n * (1 - ratio) + bb[i] * ratio)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
function relativeLuminance(hex: string) {
  const [r, g, b] = rgb(hex).map((n) => {
    const v = n / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function mapColor(original: string, colors: ThemeColors) {
  const [r, g, b] = rgb(original);
  const value = Math.max(r, g, b);
  const spread = value - Math.min(r, g, b);
  const purple = b > r * 1.12 && b > g * 1.13;
  const gold = r > b * 1.22 && g > b * 1.1 && value > 110;
  const semantic =
    (r > g * 1.35 && r > b * 1.2) ||
    (g > r * 1.28 && g > b * 1.08) ||
    (b > r * 1.35 && b > g * 1.15);
  if (purple && value > 95 && spread > 28)
    return mix(colors.accent, colors.text, value > 190 ? 0.17 : 0);
  if (gold && spread > 45 && value > 145)
    return mix(colors.accent, colors.text, 0.2);
  if (semantic && spread > 50)
    return mix(
      original,
      colors.text,
      relativeLuminance(colors.background) > 0.5 ? 0.05 : 0.12,
    );
  if (value < 26) return colors.background;
  if (value < 34) return colors.surface;
  if (value < 48) return colors.surfaceRaised;
  if (value < 78) return colors.border;
  if (value < 142) return mix(colors.muted, colors.border, 0.3);
  if (value < 198) return colors.muted;
  return colors.text;
}
export function activeTheme(settings: Settings) {
  return (
    themePresets[settings.theme || "original"] ||
    settings.customThemes?.find((item) => item.id === settings.theme)?.colors ||
    themePresets.original
  );
}
export function themeStyle(settings: Settings): CSSProperties {
  if (!settings.theme || settings.theme === "original") return {};
  const c = activeTheme(settings);
  const style: Record<string, string> = {
    "--bg": c.background,
    "--panel": c.surface,
    "--border": c.border,
    "--muted": c.muted,
    "--accent": c.accent,
    "--accent-bg": mix(c.accent, c.surface, 0.86),
    "--gold": c.accent,
    "--violet": c.accent,
    "--theme-text": c.text,
    "--theme-sidebar": c.sidebar,
    "--theme-surface": c.surface,
    "--theme-field": c.field,
    "--theme-button": c.button,
    "--theme-button-text": c.buttonText,
    "--theme-accent-text": c.accentText,
  };
  for (const hex of paletteColors)
    style[`--tone-${hex.slice(1)}`] = mapColor(hex, c);
  return style as CSSProperties;
}
