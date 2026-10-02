/**
 * HTTP 局域网部署(如 http://192.168.18.100:3030)属于非安全源,
 * [SecureContext] 的 navigator.clipboard 整个不存在,UI 里 25 处复制按钮
 * (表格/代码块/commit hash/文件路径…)全部报 clipboard-unavailable。
 * 这里在入口统一注入 execCommand("copy") 兜底实现,让所有
 * navigator.clipboard.writeText 调用点原样工作;
 * HTTPS/localhost/桌面 Electron(file:// 属安全上下文)下是 no-op。
 */
export function installInsecureOriginClipboardPolyfill(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  if (window.isSecureContext) {
    return;
  }
  if (navigator.clipboard) {
    return;
  }

  const copyViaExecCommand = (text: string): Promise<void> => {
    // execCommand 依赖用户手势且必须在同一任务内同步执行,
    // 因此这里先同步复制再返回 Promise,不能先 await 别的异步步骤。
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    // 选中区保持是锦上添花:个别环境(内嵌 WebView)的 Selection 缺 getAllRanges,
    // 必须按能力探测,不能假定标准 API 齐全。
    const selection = document.getSelection();
    const canRestoreSelection =
      !!selection &&
      typeof selection.getAllRanges === "function" &&
      typeof selection.removeAllRanges === "function" &&
      typeof selection.addRange === "function";
    const previousRanges = canRestoreSelection
      ? Array.from(selection.getAllRanges())
      : [];
    textarea.select();
    let succeeded = false;
    try {
      succeeded = document.execCommand("copy");
    } catch {
      succeeded = false;
    }
    document.body.removeChild(textarea);
    if (canRestoreSelection) {
      selection.removeAllRanges();
      for (const range of previousRanges) {
        selection.addRange(range);
      }
    }
    return succeeded
      ? Promise.resolve()
      : Promise.reject(new DOMException("copy command failed", "NotAllowedError"));
  };

  try {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: (text: string): Promise<void> => {
          if (typeof text !== "string") {
            return Promise.reject(new TypeError("writeText expects a string"));
          }
          return copyViaExecCommand(text);
        },
        // 非安全源没有读取剪贴板的合法路径;显式拒绝与原生行为对齐。
        readText: (): Promise<string> =>
          Promise.reject(
            new DOMException("readText requires a secure context", "NotAllowedError"),
          ),
      },
      configurable: true,
    });
  } catch {
    // 个别环境把 navigator 属性锁死;保持原生行为(调用点各自报错)。
  }
}
