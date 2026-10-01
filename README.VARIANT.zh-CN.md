# ZCode 局域网网页部署变体(v3.14.3 + 补丁集)

[English](README.VARIANT.md) | 简体中文

基于 [zai-org/ZCode](https://github.com/zai-org/ZCode) v3.14.3 的自托管向变体,补丁目标是让开源版 `zcode --web` 服务在 **Windows 局域网机器**上稳定运行,网页客户端达到日常可用状态。

> 上游现状(v3.14.3):局域网网页部署仍然需要下面所有修复——上游已禁用 GitHub Issues,故在此发布。

## 本变体相对上游 v3.14.3 的修改

| # | 修复 | 原因 | 涉及文件 |
|---|------|------|----------|
| 1 | 静态 MIME 表补 `.mjs`(顺带 mp4/webm/mp3/m4a) | `pdf.worker.min-*.mjs` 被以 `application/octet-stream` 下发,Chromium 对 Worker 脚本强制 MIME 校验直接拒收 → pdf.js 退化为 fake worker,PDF 预览必挂 | `packages/server/src/http.ts` |
| 2 | pdf.js `workerSrc` 加版本参数(`?v=2`) | worker 资源以 `immutable` 缓存一年,浏览器把坏 MIME 的旧响应缓存住,服务器修复后旧条目仍在——版本参数换 URL 绕开毒缓存 | `packages/ui/src/components/ui/pdf-viewer.tsx` |
| 3 | 行内代码里的文件路径变成可点引用 | 模型经常把路径写在反引号里而非发 `:zcode-file-citation` 指令;remark 插件原本跳过 `inlineCode` 节点。现在裸路径(含路径分隔符 + 33 种扩展名白名单)会投影为可点击文件引用——主聊天与划词辅助对话同时生效 | `packages/ui/src/lib/zcodeFileCitationRemarkPlugin.ts` |
| 4 | 任务列表的 Web 降级路径 | 侧栏分组/置顶/归档列表只读 `WindowHostController` 通道(桌面 Host 专属),网页端静默渲染为空("暂无归档任务")。Controller 查询失败或超时(8s)时按工作区降级直连 `zcodeTaskService.listArchivedTasks/listPinnedTasks/listTasks`;不支持的 `timeline` 类型改为抛错保留上次列表;降级定时器在 finally 清理 | `packages/ui/src/hooks/useGlobalTaskList.ts` |
| 5 | 分组吸顶表头:数据通道替代 ReactNode | 吸顶表头 effect 每轮把新建的 `<StickyGroupHeader/>` 元素推进侧栏 state(每轮 2 次强制重渲染,元素永不等值)——网页端真实任务行出现后旋转成 React error #185(嵌套更新超限)。通道改为携带原始数据 `{groupId, collapsed, tooltipsDisabled, node, callbacks}`,由侧栏渲染元素;依赖砍到 4 个稳定项 | `packages/ui/src/WorkspaceGroupedTasksSection.tsx`、`packages/ui/src/WorkspaceSidebar.tsx`、`packages/ui/src/workspace-grouped-tasks/sticky-group-header-slot.tsx` |
| 6 | 代码块主题跟随界面而非操作系统 | 拿不到宿主主题的子面板回落 `"system"` → `matchMedia(操作系统)`;浅色系统 + 深色界面时解析出浅色代码主题 → 文字近同色隐形。`"system"` 分支改为读 `<html>` 实际应用的 `dark` 类 | `packages/ui/src/components/ai-elements/message.tsx` |
| 7 | HTTP 源的附件校验和兜底 | `crypto.subtle` 在非安全源(如 `http://<局域网IP>:3030`)不存在,附件上传必抛 `fault.attachment.checksumUnavailable`。加纯 JS SHA-256 兜底(已对照 `node:crypto` 验证) | `packages/ui/src/v4/attachmentUploadTransaction.ts` |

## Windows 构建备注

上游 v3.14.3 在 Windows 上构建时还会遇到以下问题,本变体实际处理方式:

- `scripts/build-zcode.mjs` 使用 `spawnSync("pnpm")` → Windows 下 ENOENT(不带 shell 找不到 `.cmd`)。绕过:手动跑各 filter 构建,再 `node scripts/build-zcode.mjs --skip-build`。
- `packages/shared` 没有 `build` 脚本,但组包需要 `packages/shared/dist/index.js` → 在 `packages/shared` 里执行一次 `pnpm exec tsc`。
- 最后的 tar 打包在 GNU tar 收到 `C:\...` 路径时把 `C:` 当远程主机解析而失败。使用相对路径。
- `ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install` 可跳过被墙的 Electron 二进制下载;网页部署不需要桌面端。

## 已验证的部署形态

`node zcode/bin/zcode.mjs --web --host 0.0.0.0 --port 3030 --token <token>`,Windows 上以 detached 方式启动(WMI `Win32_Process.Create`——SSH 拉起的子进程会随会话断开被回收),与闭源桌面版共享同一 `~/.zcode` 会话库。

## 未包含

- 无任何密钥(已检查)。运行时配置在仓库外的 `~/.zcode`。
- 不预构建桌面/Electron 产物。

## 许可

Apache-2.0,与上游一致。
