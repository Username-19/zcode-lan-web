import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ZCodeGroupedTaskViewNode, ZCodeTaskGroupColor } from "@zcode/services";
import { cn } from "@/components/lib/utils.js";

const STICKY_GROUP_HEADER_EXIT_MS = 150;

type StickyGroupNode = Extract<ZCodeGroupedTaskViewNode, { type: "group" }>;

// 跨组件通道（WorkspaceSidebar 的 groupedStickyHeader state）只承载这份数据 + 稳定引用，
// 由父层在渲染期再组装 <StickyGroupHeader/>；不直接传 ReactNode——effect 每次运行都
// push 新元素会对父层连续强制两次 setState，回调身份变化又重跑 effect，
// 形成 React error #185（max update depth）嵌套更新循环。
// node 直接存 view 的 group 节点对象：它来自 useMemo 的 view，引用稳定，可安全比较身份。
export interface GroupedStickyHeaderData {
  groupId: string;
  collapsed: boolean;
  tooltipsDisabled: boolean;
  node: StickyGroupNode;
  onCreateTask: () => void;
  onToggleCollapsed: (groupId: string) => void;
  onUpdateGroupColor: (groupId: string, color: ZCodeTaskGroupColor) => void;
  onUngroupGroup: (groupId: string) => void;
}

export function StickyGroupHeaderSlot({ header }: { header: ReactNode | null }) {
  const [renderedHeader, setRenderedHeader] = useState<ReactNode | null>(header);
  const [visible, setVisible] = useState(Boolean(header));

  useEffect(() => {
    if (header) {
      setRenderedHeader(header);
      const animationFrame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(animationFrame);
    }

    setVisible(false);
    const timeout = window.setTimeout(() => {
      setRenderedHeader(null);
    }, STICKY_GROUP_HEADER_EXIT_MS);
    return () => window.clearTimeout(timeout);
  }, [header]);

  if (!renderedHeader) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-0 right-0 top-0 z-20 pt-1",
        "transition-[opacity,transform] duration-150 ease-out motion-reduce:translate-y-0 motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
      )}
    >
      {renderedHeader}
    </div>
  );
}
