import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  WindowHostControllerTaskListItem,
  ZCodeTaskListKind,
  ZCodeTaskListWorkspaceScope,
} from "@zcode/services";
import { logger } from "@/logger.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import type { WorkspaceTabState } from "@/store/tabStore.js";
import { selectWorkspaceZCodeState, useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { attachTaskListRowActivity } from "@/v4/taskListRowActivity.js";
import { stabilizeTaskListItems } from "@/v4/taskListItemStabilization.js";
import { getWindowControllerTaskListRegistry } from "@/v4/windowControllerTaskListRegistry.js";
import type { WindowControllerTaskListVersion } from "@/v4/windowControllerTaskListRegistry.js";

type GlobalTaskListItem = WindowHostControllerTaskListItem;

const subscribeToNothing = () => () => {};
const zeroRevision = () => 0;

function buildWorkspaceScopes(workspaceTabs: WorkspaceTabState[]): ZCodeTaskListWorkspaceScope[] {
  const scopes = new Map<string, ZCodeTaskListWorkspaceScope>();
  for (const tab of workspaceTabs) {
    const scope = {
      workspacePath: tab.workspacePath,
      ...(tab.workspaceIdentity ? { workspaceIdentity: tab.workspaceIdentity } : {}),
    };
    scopes.set(
      JSON.stringify([tab.workspaceIdentity?.trim() || tab.workspacePath, tab.workspacePath]),
      scope,
    );
  }
  return Array.from(scopes.values());
}

export function useGlobalTaskList(params: {
  kind: ZCodeTaskListKind;
  workspaceTabs: WorkspaceTabState[];
  sortBy: "created" | "updated";
  searchQuery: string;
  expanded: boolean;
  collapsedLimit: number;
}) {
  const baseServices = useBaseWorkspaceServices();
  // 经 ref 透传 baseServices,避免其身份变化重建 load、导致 effect 反复重查。
  const baseServicesRef = useRef(baseServices);
  baseServicesRef.current = baseServices;
  const controller = baseServices.windowControllerService;
  const controllerRegistry = useMemo(
    () => (controller ? getWindowControllerTaskListRegistry(controller) : null),
    [controller],
  );
  const controllerRevision = useSyncExternalStore(
    controllerRegistry?.subscribe ?? subscribeToNothing,
    controllerRegistry?.getRevision ?? zeroRevision,
    controllerRegistry?.getRevision ?? zeroRevision,
  );
  const workspaceSignature = JSON.stringify(
    params.workspaceTabs
      .map(
        (tab) => [tab.workspaceIdentity?.trim() || tab.workspacePath, tab.workspacePath] as const,
      )
      .sort(
        ([leftKey, leftPath], [rightKey, rightPath]) =>
          leftKey.localeCompare(rightKey) || leftPath.localeCompare(rightPath),
      ),
  );
  const workspaceSourceGenerationSignature = JSON.stringify(
    params.workspaceTabs
      .map(
        (tab) =>
          [
            tab.workspaceIdentity?.trim() || tab.workspacePath,
            tab.workspacePath,
            tab.remoteSessionId?.trim() || null,
          ] as const,
      )
      .sort(
        ([leftKey, leftPath, leftSession], [rightKey, rightPath, rightSession]) =>
          leftKey.localeCompare(rightKey) ||
          leftPath.localeCompare(rightPath) ||
          (leftSession ?? "").localeCompare(rightSession ?? ""),
      ),
  );
  const workspaceScopes = useMemo(
    () => buildWorkspaceScopes(params.workspaceTabs),
    // workspaceSignature 是标准化后的 scope 值签名，避免父组件重建 tabs 数组时重复查询。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspaceSignature],
  );
  const taskListVersionSignature = useZCodeSessionStore((state) =>
    JSON.stringify(
      params.workspaceTabs
        .map((tab) => {
          const workspace = selectWorkspaceZCodeState(
            state,
            tab.workspacePath,
            tab.workspaceIdentity,
          );
          return [
            tab.workspaceIdentity?.trim() || tab.workspacePath,
            workspace.taskListVersion,
          ] as const;
        })
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
  const [items, setItems] = useState<GlobalTaskListItem[]>([]);
  const itemsRef = useRef<GlobalTaskListItem[]>(items);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(workspaceScopes.length > 0);
  const requestSerialRef = useRef(0);
  const manualRefreshSerialRef = useRef(0);

  const query = useMemo(
    () => ({
      kind: params.kind,
      workspaceScopes,
      sortBy: params.sortBy,
      search: params.searchQuery.trim() || undefined,
      limit: params.expanded ? undefined : params.collapsedLimit,
    }),
    [
      params.collapsedLimit,
      params.expanded,
      params.kind,
      params.searchQuery,
      params.sortBy,
      workspaceScopes,
    ],
  );
  const queryKey = useMemo(() => JSON.stringify(query), [query]);

  const load = useCallback(
    async (version: WindowControllerTaskListVersion) => {
      const requestSerial = ++requestSerialRef.current;
      if (workspaceScopes.length === 0) {
        setItems([]);
        itemsRef.current = [];
        setTotal(0);
        setHasMore(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      // Web 部署没有 WindowHostController 通道(桌面 Host 专属实现,描述符对象恒为真值,
      // registry.list 要么快速失败要么挂起)。Controller 查询失败或超时(8s)时降级为按
      // scope 直连 zcodeTaskService 拉取;桌面路径不受影响。
      // 收集 withTimeout 创建的定时器句柄,在 finally 中统一 clearTimeout,避免定时器泄漏。
      const timeoutTimerIds = new Set<ReturnType<typeof setTimeout>>();
      const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            const timerId = setTimeout(
              () => reject(new Error("task list controller timeout")),
              ms,
            );
            timeoutTimerIds.add(timerId);
          }),
        ]);
      try {
        let result: {
          items: GlobalTaskListItem[];
          total: number;
          hasMore: boolean;
        } | null = null;
        if (controllerRegistry) {
          try {
            const controllerResult = await withTimeout(
              controllerRegistry.list(queryKey, version, query),
              8_000,
            );
            if (requestSerialRef.current !== requestSerial) {
              return;
            }
            result = controllerResult;
          } catch (controllerError) {
            if (requestSerialRef.current !== requestSerial) {
              return;
            }
            logger.warn(
              `[useGlobalTaskList] Controller 加载 ${params.kind} 列表失败,降级直连 task 服务`,
              controllerError,
            );
          }
        }
        if (!result) {
          const service = baseServicesRef.current.zcodeTaskService;
          const collected: GlobalTaskListItem[] = [];
          for (const scope of workspaceScopes) {
            const scopeParams = {
              workspacePath: scope.workspacePath,
              ...(scope.workspaceIdentity
                ? { workspaceIdentity: scope.workspaceIdentity }
                : {}),
            };
            if (params.kind === "archived") {
              const metas = await withTimeout(service.listArchivedTasks(scopeParams), 12_000);
              for (const meta of metas) {
                collected.push({ ...meta, sourceAvailability: "online", liveStatus: "idle" });
              }
            } else if (params.kind === "pinned") {
              const metas = await withTimeout(service.listPinnedTasks(scopeParams), 12_000);
              for (const meta of metas) {
                collected.push({ ...meta, sourceAvailability: "online", liveStatus: "idle" });
              }
            } else if (params.kind === "active") {
              const metas = await withTimeout(service.listTasks(scopeParams), 12_000);
              for (const meta of metas) {
                collected.push({ ...meta, sourceAvailability: "online", liveStatus: "idle" });
              }
            } else {
              // timeline 走专用搜索聚合,不在本降级范围内;抛错交由外层 catch 保留最后列表
              throw new Error(`[useGlobalTaskList] 降级路径不支持 ${params.kind} 列表`);
            }
            if (requestSerialRef.current !== requestSerial) {
              return;
            }
          }
          collected.sort((left, right) =>
            params.sortBy === "updated"
              ? right.updatedAt - left.updatedAt || right.createdAt - left.createdAt
              : right.createdAt - left.createdAt,
          );
          const total = collected.length;
          const limited =
            query.limit !== undefined ? collected.slice(0, query.limit) : collected;
          result = { items: limited, total, hasMore: collected.length > limited.length };
        }
        if (requestSerialRef.current !== requestSerial) {
          return;
        }
        // Controller 的每个 activity 帧（运行中任务的 tool 调用等）都会让本 hook 重查，
        // 而 attachTaskListRowActivity 与 tasks-index join 每次都产生全新对象。下游（grouped 视图）
        // 只能按引用判等，于是整棵列表树换代重渲染并重测量虚拟器。这里与 sessions-index lane 同款
        // 逐条引用稳定化：内容等价复用旧对象，整表等价复用旧数组。
        const nextItems = stabilizeTaskListItems(
          itemsRef.current,
          result.items.map((item) =>
            item.activity ? attachTaskListRowActivity(item, item.activity) : item,
          ),
        );
        itemsRef.current = nextItems;
        setItems(nextItems);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (error) {
        if (requestSerialRef.current === requestSerial) {
          // Controller/降级查询失败时保留最后可信列表，避免单 source 异常清空其他 workspace。
          logger.error(`[useGlobalTaskList] 加载 ${params.kind} 列表失败`, error);
        }
      } finally {
        if (requestSerialRef.current === requestSerial) {
          setLoading(false);
        }
        // 无论成功、失败还是串号返回,都清除本次 load 尚未触发的超时定时器。
        for (const timerId of timeoutTimerIds) {
          clearTimeout(timerId);
        }
      }
    },
    [controllerRegistry, params.kind, query, queryKey, workspaceScopes],
  );

  const refresh = useCallback(async () => {
    manualRefreshSerialRef.current += 1;
    await load({
      controllerRevision,
      taskListVersionSignature,
      workspaceSourceGenerationSignature,
      manualRefreshSerial: manualRefreshSerialRef.current,
    });
  }, [controllerRevision, load, taskListVersionSignature, workspaceSourceGenerationSignature]);

  useEffect(() => {
    // 远程 workspace 从断开占位恢复为在线 session 时 identity/path 不变，
    // taskListVersion 也可能尚未变化，旧缓存因此永久保留连接前的空结果。remoteSessionId
    // 只作为 source 代际触发重查，不改变 workspaceIdentity 与 Controller 查询契约。
    void load({
      controllerRevision,
      taskListVersionSignature,
      workspaceSourceGenerationSignature,
    });
  }, [controllerRevision, load, taskListVersionSignature, workspaceSourceGenerationSignature]);

  const hasRemoteScope = params.workspaceTabs.some((tab) => Boolean(tab.workspaceIdentity));
  return {
    items,
    total,
    hasMore,
    loading,
    syncingRemoteWorkspaces: loading && hasRemoteScope,
    refresh,
  };
}
