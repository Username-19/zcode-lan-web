import { useZCodeStore } from "@/store/StoreProvider.js";
import { resolveTheme } from "@/useTheme.js";
import { Card, CardContent } from "@/components/ui/card.js";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  UI_PALETTE_PRESETS,
  type PaletteConfig,
  type PaletteMode,
} from "@/lib/uiPalette.js";

function configEquals(a: PaletteConfig | null, b: PaletteConfig | null): boolean {
  if (!a || !b) return false;
  return a.base.toLowerCase() === b.base.toLowerCase() &&
    a.primary.toLowerCase() === b.primary.toLowerCase();
}

function PaletteChip({
  base,
  primary,
  active,
  title,
  onClick,
}: {
  base: string;
  primary: string;
  active: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className="group/chip flex flex-col items-center gap-1.5"
    >
      <span
        className={`flex h-10 w-[76px] overflow-hidden rounded-lg border transition-shadow ${
          active
            ? "border-transparent outline-2 outline-offset-2 outline-primary"
            : "border-border group-hover/chip:border-border-hover"
        }`}
      >
        <span className="flex-1" style={{ background: base }} />
        <span className="flex-1" style={{ background: primary }} />
      </span>
      <span
        className={`max-w-[86px] truncate text-ui-xs ${active ? "text-foreground" : "text-foreground-subtle"}`}
      >
        {title}
      </span>
    </button>
  );
}

function ColorField({
  value,
  onChange,
  label,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  ariaLabel: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-12 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
      />
      <span className="text-ui-sm text-foreground-subtle">{label}</span>
    </label>
  );
}

/**
 * 设置 → 外观 → 界面配色（调色盘）。
 * 明/暗主题各一套：预设双拼色块一键应用；自定义行编辑的是"当前生效模式"那套，
 * 取色器改动即时生效；恢复默认清除该模式覆盖回到 zai 原版。
 */
export function AppearancePaletteSettings() {
  const { intl } = useZCodeIntl();
  const theme = useZCodeStore((state) => state.theme);
  const uiPalette = useZCodeStore((state) => state.uiPalette);
  const setUiPaletteMode = useZCodeStore((state) => state.setUiPaletteMode);
  const resolvedMode: PaletteMode = resolveTheme(theme);
  const activeConfig = uiPalette[resolvedMode];
  const editingBase = activeConfig?.base ?? (resolvedMode === "dark" ? "#161616" : "#f8f8f8");
  const editingPrimary = activeConfig?.primary ?? (resolvedMode === "dark" ? "#ffffff" : "#000000");
  const modeLabel = intl.formatMessage({ id: `settings.themeMode.${resolvedMode}` });

  const presetsFor = (mode: PaletteMode) =>
    UI_PALETTE_PRESETS.filter((preset) => preset.mode === mode);

  return (
    <Card className="border border-border bg-card py-0 shadow-none">
      <CardContent className="space-y-4 px-6 py-5">
        <div>
          <h4 className="text-ui-base font-semibold text-foreground">
            {intl.formatMessage({ id: "settings.palette.title" })}
          </h4>
          <p className="mt-1 text-ui-sm leading-6 text-foreground-subtle">
            {intl.formatMessage({ id: "settings.palette.description" })}
          </p>
        </div>
        {(["light", "dark"] as const).map((mode) => (
          <div key={mode} className="flex items-start gap-3">
            <div className="w-24 shrink-0 pt-2 text-ui-sm text-foreground-subtle">
              {intl.formatMessage({ id: `settings.themeMode.${mode}` })}
            </div>
            <div className="flex flex-wrap gap-3">
              {presetsFor(mode).map((preset) => (
                <PaletteChip
                  key={preset.id}
                  base={preset.config.base}
                  primary={preset.config.primary}
                  active={configEquals(uiPalette[mode], preset.config)}
                  title={intl.formatMessage({ id: `settings.palette.preset.${preset.id}` })}
                  onClick={() =>
                    setUiPaletteMode(
                      mode,
                      configEquals(uiPalette[mode], preset.config) ? null : preset.config,
                    )
                  }
                />
              ))}
              {uiPalette[mode] && !presetsFor(mode).some((p) => configEquals(uiPalette[mode], p.config)) ? (
                <PaletteChip
                  base={uiPalette[mode]!.base}
                  primary={uiPalette[mode]!.primary}
                  active
                  title={intl.formatMessage({ id: "settings.palette.custom" })}
                  onClick={() => setUiPaletteMode(mode, null)}
                />
              ) : null}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <div className="text-ui-sm text-foreground-subtle">
            {intl.formatMessage(
              { id: "settings.palette.customTitle" },
              { mode: modeLabel },
            )}
          </div>
          <ColorField
            value={editingBase}
            ariaLabel={intl.formatMessage({ id: "settings.palette.baseColor" })}
            label={intl.formatMessage({ id: "settings.palette.baseColor" })}
            onChange={(base) =>
              setUiPaletteMode(resolvedMode, { base, primary: editingPrimary })
            }
          />
          <ColorField
            value={editingPrimary}
            ariaLabel={intl.formatMessage({ id: "settings.palette.primaryColor" })}
            label={intl.formatMessage({ id: "settings.palette.primaryColor" })}
            onChange={(primary) =>
              setUiPaletteMode(resolvedMode, { base: editingBase, primary })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!activeConfig}
            onClick={() => setUiPaletteMode(resolvedMode, null)}
            className="ml-auto"
          >
            {intl.formatMessage({ id: "settings.palette.reset" })}
          </Button>
        </div>
        <p className="text-ui-xs leading-5 text-foreground-subtlest">
          {intl.formatMessage({ id: "settings.palette.hint" })}
        </p>
      </CardContent>
    </Card>
  );
}
