import { readSafeLocalStorage } from "@/lib/browserEnvironment.js";

/**
 * 网页端"调色盘"：在 <html> 上内联覆盖主题 CSS 变量，让用户摆脱纯黑/纯白
 * （zai-light 卡片纯白、primary 纯黑；zai-dark 反之）。覆盖集来自全量审计：
 * 核心表层/容器/文字/主色变量 + 高频交互态（hover/selected/menu-hover/
 * secondary/tag）、tooltip 文字、background-alt、链接色（icon-blue）、
 * 搜索高亮等；语义色（成功/危险/git/图表/终端 ANSI）刻意不跟随。
 * 模式仿 uiFontSize.ts：localStorage 持久化 + storage 事件跨标签同步；
 * 明暗主题各存一套，applyTheme 切换时由 syncUiPaletteForTheme 换用对应套。
 */

export interface PaletteConfig {
  /** 底色：背景/卡片/侧栏/弹窗等大面积颜色的基准。 */
  base: string;
  /** 主色：按钮/链接/强调。 */
  primary: string;
}

export interface UiPaletteState {
  light: PaletteConfig | null;
  dark: PaletteConfig | null;
}

export type PaletteMode = "light" | "dark";

export const UI_PALETTE_STORAGE_KEY = "zcode-ui-palette";

export interface PalettePreset {
  id: string;
  mode: PaletteMode;
  config: PaletteConfig;
}

/** 预设色板：base/primary 对，与设置页双拼色块一一对应。 */
export const UI_PALETTE_PRESETS: readonly PalettePreset[] = [
  { id: "parchment", mode: "light", config: { base: "#f2ead9", primary: "#7a5c33" } },
  { id: "cream", mode: "light", config: { base: "#f7f2e9", primary: "#946b2d" } },
  { id: "coolblue", mode: "light", config: { base: "#edf1f5", primary: "#3d5a80" } },
  { id: "ink", mode: "dark", config: { base: "#0f1626", primary: "#6ea8fe" } },
  { id: "forest", mode: "dark", config: { base: "#0f1512", primary: "#4f9d69" } },
  { id: "umber", mode: "dark", config: { base: "#1a1512", primary: "#c8956c" } },
] as const;

// ---------------------------------------------------------------------------
// 颜色数学（hex ↔ HSL，够用即可，不引入依赖）
// ---------------------------------------------------------------------------

interface Hsl {
  h: number;
  s: number;
  l: number;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!HEX_RE.test(trimmed)) return null;
  if (trimmed.length === 4) {
    const r = trimmed[1] ?? "0";
    const g = trimmed[2] ?? "0";
    const b = trimmed[3] ?? "0";
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed.toLowerCase();
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to255 = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

function hslCss(h: number, s: number, l: number, alpha = 1): string {
  // 直接产出 rgba()/rgb() 字符串，避免 hex 量化损失 alpha 混色精度。
  const [r, g, b] = hslToRgb(((h % 1) + 1) % 1, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l)));
  if (alpha >= 1) {
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  }
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${Number(alpha.toFixed(3))})`;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// ---------------------------------------------------------------------------
// 从 base + primary 推导整套覆盖变量
// ---------------------------------------------------------------------------

/** 全部会被调色盘写入/清除的变量名（恢复默认时逐个 removeProperty）。 */
export const UI_PALETTE_VARIABLES: readonly string[] = [
  "--color-background",
  "--color-background-alt",
  "--color-card",
  "--color-popover",
  "--color-menu",
  "--color-input",
  "--color-toast",
  "--color-tooltip",
  "--color-header",
  "--color-panel",
  "--color-border",
  "--color-border-hover",
  "--color-surface",
  "--color-surface-hover",
  "--color-hover",
  "--color-selected",
  "--color-menu-hover",
  "--color-secondary",
  "--color-tag",
  "--color-foreground",
  "--color-foreground-subtle",
  "--color-foreground-subtlest",
  "--color-foreground-inverse",
  "--color-primary",
  "--color-primary-foreground",
  "--color-accent",
  "--color-brand",
  "--color-icon-blue",
  "--color-find-highlight",
  "--color-find-highlight-active",
  "--color-tooltip-foreground",
  "--color-tooltip-tag",
  "--color-tooltip-tag-foreground",
  "--color-terminal-cursor-accent",
] as const;

/**
 * 推导规则（按当前模式）：
 * - 文字色 = 底色色相 + 少量饱和度，明度取近白/近黑，避免死黑死白；
 * - 容器层（卡片/弹窗/输入）= 底色沿明度轴抬/压几档，保持同一色相；
 * - 线/面/hover 类 = 前景色按 alpha 叠底色，自动适配任何底色；
 * - primary 相关（按钮/链接/brand/accent）跟随用户主色。
 */
export function derivePaletteVariables(config: PaletteConfig, mode: PaletteMode): Record<string, string> {
  const base = normalizeHexColor(config.base) ?? (mode === "dark" ? "#161616" : "#f8f8f8");
  const primary = normalizeHexColor(config.primary) ?? (mode === "dark" ? "#ffffff" : "#000000");
  const isDarkMode = mode === "dark";
  const b = hexToHsl(base);
  const p = hexToHsl(primary);

  // 容器阶梯：同一色相沿明度轴抬/压。浅色模式卡片更白、页头略沉；
  // 深色模式卡片/页头比背景亮一档（暗面抬升）。
  const lighten = (l: number, d: number) => Math.min(0.985, Math.max(0.015, l + d));

  const cardL = lighten(b.l, isDarkMode ? 0.035 : 0.03);
  const raisedL = lighten(b.l, isDarkMode ? 0.06 : -0.015);
  const tooltipL = isDarkMode ? lighten(b.l, 0.09) : cardL;

  const bg = (l: number) => hslCss(b.h, b.s, l);
  const bgA = (l: number, a: number) => hslCss(b.h, b.s, l, a);

  // 文字：带底色色相的近黑/近白，饱和度收敛避免过艳。
  const textS = Math.min(0.14, b.s * 0.3 + 0.02);
  const fgHsl: Hsl = {
    h: b.h,
    s: textS,
    l: isDarkMode ? 0.92 : 0.16,
  };
  const fg = hslCss(fgHsl.h, fgHsl.s, fgHsl.l);
  const fgA = (a: number) => hslCss(fgHsl.h, fgHsl.s, isDarkMode ? 0.92 : 0.16, a);

  const primaryFg = relativeLuminance(primary) > 0.45
    ? "rgb(12, 12, 14)"
    : "rgb(250, 250, 250)";

  // 语义化叠加：前景色按 alpha 叠在底色上（rgb 数学，避免依赖 color-mix 兼容面）。
  const overlay = (alpha: number, overL = b.l) => {
    const [fr, fgCh, fb] = hslToRgb(fgHsl.h, fgHsl.s, isDarkMode ? 0.92 : 0.16);
    const [br, bgCh, bb] = hslToRgb(b.h, b.s, overL);
    return rgbToHex(
      fr * alpha + br * (1 - alpha),
      fgCh * alpha + bgCh * (1 - alpha),
      fb * alpha + bb * (1 - alpha),
    );
  };

  const vars: Record<string, string> = {
    "--color-background": bg(b.l),
    "--color-background-alt": bg(raisedL),
    "--color-card": bg(cardL),
    "--color-popover": bg(cardL),
    "--color-menu": bg(cardL),
    "--color-input": bg(cardL),
    "--color-toast": bg(cardL),
    "--color-tooltip": bg(tooltipL),
    "--color-header": bg(raisedL),
    "--color-panel": bg(raisedL),
    "--color-border": overlay(0.14),
    "--color-border-hover": overlay(0.26),
    "--color-surface": overlay(0.035),
    "--color-surface-hover": overlay(0.07),
    "--color-hover": overlay(0.05),
    "--color-selected": overlay(0.09),
    "--color-menu-hover": overlay(0.06, cardL),
    "--color-secondary": overlay(0.1),
    "--color-tag": overlay(0.08),
    "--color-foreground": fg,
    "--color-foreground-subtle": fgA(0.62),
    "--color-foreground-subtleest": fgA(0.42),
    "--color-foreground-inverse": isDarkMode
      ? hslCss(b.h, textS, 0.14)
      : hslCss(b.h, textS, 0.95),
    "--color-primary": primary,
    "--color-primary-foreground": primaryFg,
    "--color-accent": hslCss(p.h, p.s, isDarkMode ? Math.max(p.l, 0.22) : Math.min(p.l, 0.92), 0.16),
    "--color-brand": primary,
    "--color-icon-blue": primary,
    "--color-find-highlight": hslCss(p.h, p.s, isDarkMode ? Math.max(p.l, 0.2) : Math.min(p.l, 0.9), 0.3),
    "--color-find-highlight-active": hslCss(p.h, p.s, isDarkMode ? Math.max(p.l, 0.2) : Math.min(p.l, 0.9), 0.55),
    "--color-tooltip-foreground": fg,
    "--color-tooltip-tag": overlay(0.08, tooltipL),
    "--color-tooltip-tag-foreground": fgA(0.66),
    "--color-terminal-cursor-accent": bg(b.l),
  };

  return vars;
}

// ---------------------------------------------------------------------------
// 应用 / 持久化 / 同步
// ---------------------------------------------------------------------------

function parsePaletteConfig(value: unknown): PaletteConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const base = normalizeHexColor((value as { base?: unknown }).base);
  const primary = normalizeHexColor((value as { primary?: unknown }).primary);
  return base && primary ? { base, primary } : null;
}

export function normalizeUiPaletteState(value: unknown): UiPaletteState {
  const empty: UiPaletteState = { light: null, dark: null };
  if (typeof value !== "object" || value === null) return empty;
  return {
    light: parsePaletteConfig((value as { light?: unknown }).light),
    dark: parsePaletteConfig((value as { dark?: unknown }).dark),
  };
}

export function loadUiPalette(): UiPaletteState {
  const raw = readSafeLocalStorage(UI_PALETTE_STORAGE_KEY);
  if (raw === null) return { light: null, dark: null };
  try {
    return normalizeUiPaletteState(JSON.parse(raw));
  } catch {
    return { light: null, dark: null };
  }
}

let activeUiPalette: UiPaletteState = { light: null, dark: null };

function currentResolvedMode(): PaletteMode {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

function syncThemeColorMeta(): void {
  if (typeof document === "undefined") return;
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-background")
    .trim();
  if (!background) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = background;
}

/** 按 resolved 明暗应用当前激活的那套（无则清空恢复默认）。applyTheme 切换时调用。 */
export function syncUiPaletteForTheme(mode: PaletteMode): void {
  const rootStyle = typeof document === "undefined" ? undefined : document.documentElement?.style;
  if (!rootStyle) return;
  for (const name of UI_PALETTE_VARIABLES) {
    rootStyle.removeProperty(name);
  }
  const config = activeUiPalette[mode];
  if (config) {
    const vars = derivePaletteVariables(config, mode);
    for (const [name, value] of Object.entries(vars)) {
      rootStyle.setProperty(name, value);
    }
  }
  syncThemeColorMeta();
}

/** store setter / storage 事件统一入口：更新激活态并立即按当前主题应用。 */
export function applyUiPalette(state: UiPaletteState): void {
  activeUiPalette = state;
  syncUiPaletteForTheme(currentResolvedMode());
}

export function subscribeToUiPaletteStorageChanges(): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== UI_PALETTE_STORAGE_KEY) return;
    try {
      applyUiPalette(normalizeUiPaletteState(event.newValue ? JSON.parse(event.newValue) : null));
    } catch {
      applyUiPalette({ light: null, dark: null });
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}
