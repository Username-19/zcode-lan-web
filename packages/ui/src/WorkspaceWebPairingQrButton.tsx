import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";

/**
 * 网页版"手机扫码访问"入口：与桌面版 WorkspaceWebRemoteControlTrigger 同位
 * (侧栏 footer 图标簇内、设置按钮之前)，但桌面版那个按钮被 isDesktop 门禁
 * 挡住且走 Bot/云中继渠道；网页版的同位平替是局域网直连——二维码内容为
 * 当前页面地址(含 token)，手机扫码免输入打开同一网页版，多端共享同一
 * agent 进程，消息/生成状态实时同步(已实测)。
 */
export function WorkspaceWebPairingQrButton({ className }: { className?: string }) {
  const { intl } = useZCodeIntl();
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const currentUrl = typeof window === "undefined" ? "" : window.location.href;

  useEffect(() => {
    if (!open || !currentUrl) return;
    let cancelled = false;
    void QRCode.toDataURL(currentUrl, { margin: 1, width: 260 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch((error: unknown) => {
        logger.error(
          "[WorkspaceWebPairingQrButton] 生成访问二维码失败",
          error instanceof Error ? error.message : String(error),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, currentUrl]);

  const triggerLabel = intl.formatMessage({ id: "webRemoteControl.pairing.trigger" });

  return (
    <>
      <ControlHintTooltip title={triggerLabel} side="top" align="center">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={triggerLabel}
          className={className}
          onClick={() => setOpen(true)}
        >
          <Smartphone className="size-4 text-foreground-subtle" />
        </Button>
      </ControlHintTooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden rounded-2xl p-0">
          <DialogHeader className="space-y-2 p-5 pb-3">
            <DialogTitle>
              {intl.formatMessage({ id: "webRemoteControl.pairing.title" })}
            </DialogTitle>
            <DialogDescription>
              {intl.formatMessage({ id: "webRemoteControl.pairing.description" })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 px-5 pb-5">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={triggerLabel}
                className="size-60 shrink-0 rounded-lg border border-border bg-white p-2"
              />
            ) : (
              <div className="flex size-60 items-center justify-center rounded-lg border border-border bg-surface text-ui-base text-foreground-subtle">
                {intl.formatMessage({ id: "webRemoteControl.pairing.title" })}
              </div>
            )}
            <div className="w-full break-all rounded-md bg-surface px-2 py-1 text-center font-mono text-ui-xs text-foreground-subtle select-all">
              {currentUrl}
            </div>
            <p className="text-ui-xs leading-relaxed text-foreground-subtle">
              {intl.formatMessage({ id: "webRemoteControl.pairing.hint" })}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
