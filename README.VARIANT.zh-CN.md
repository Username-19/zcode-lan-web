# 相对上游 v3.14.3 的补丁

[English](README.VARIANT.md) | 简体中文

本 fork 只带一类改动:让 `zcode --web` 在 Windows 局域网机器上能正常跑。每项都是 症状 → 根因 → 改法,全部在 `v3.14.3` 上验证过。

## 1. PDF 预览必挂:`.mjs` worker 被当成 octet-stream 下发

`packages/server/src/http.ts` — 静态 MIME 表没有 `.mjs` 条目。`pdf.worker.min-*.mjs` 以 `application/octet-stream` 下发;Chromium 对 Worker 脚本强制 MIME 校验,直接拒收 → pdf.js 退化为 fake worker,`getDocument` 失败,所有 PDF 预览显示"无法预览"。

修法:补 `.mjs: text/javascript; charset=utf-8`(顺带 mp4/webm/mp3/m4a)。

## 2. 修完 #1 PDF 还是挂:毒化的 immutable 缓存

`packages/ui/src/components/ui/pdf-viewer.tsx` — worker 资源以 `Cache-Control: immutable, max-age=1y` 下发。浏览器缓存过坏 MIME 响应后,服务器修好也照样失败。修法:`workerSrc` 加 `?v=2` 换 URL 绕开缓存。

## 3. 反引号里的文件路径是死文本

`packages/ui/src/lib/zcodeFileCitationRemarkPlugin.ts` — 可点击文件链接只由显式 `:zcode-file-citation{path="..."}` 指令生成;`SKIPPED_PARENT_TYPES` 含 `inlineCode`,而模型经常把路径写成行内代码。修法:`inlineCode` 节点若整段值是路径形状(含路径分隔符、扩展名在 33 项白名单内、≤512 字符)则投影为链接节点。代码块和命令片段不受影响(含空格/引号,过不了形状检查)。

## 4. Web 端侧栏/归档列表永远为空

`packages/ui/src/hooks/useGlobalTaskList.ts` — 分组/置顶/归档列表读 `WindowHostController` 通道,只有桌面 Host 实现了它。网页端该调用快速失败,hook 保留空列表。修法:Controller 失败或超时(8s)时,按工作区降级直连 `zcodeTaskService.listArchivedTasks/listPinnedTasks/listTasks`。不支持的类型(`timeline`)抛错以保留上次列表,降级定时器在 `finally` 清理。

## 5. 真实任务行渲染后,网页端触发 React #185(嵌套更新超限)

`packages/ui/src/WorkspaceGroupedTasksSection.tsx` + `WorkspaceSidebar.tsx` — 分组吸顶表头 effect 每轮把新建的 `<StickyGroupHeader/>` 元素推进侧栏 state(每轮 2 次强制重渲染;新元素永不等值)。列表为空时这段永远不跑;#4 让真实行出现后它旋转超过 React 的嵌套更新上限。修法:effect 改为上报原始数据 `{groupId, collapsed, tooltipsDisabled, node, callbacks}`,由侧栏自己渲染元素——数据不变时 setState 自动 bail。effect 依赖从 9 项(5 个不稳定回调)砍到 4 个稳定项。

## 6. 拿不到宿主主题的面板里代码块近同色隐形

`packages/ui/src/components/ai-elements/message.tsx` — 拿不到宿主主题的面板回落 `"system"`,经 `matchMedia(操作系统)` 解析。浅色系统 + 深色界面 → 浅色代码主题打在深背景上。修法:`"system"` 分支改读 `<html>` 实际应用的 `dark` 类。

## 7. HTTP 源上附件上传必失败

`packages/ui/src/v4/attachmentUploadTransaction.ts` — 非安全源(`http://<局域网IP>:3030`)上 `crypto.subtle` 不存在,SHA-256 校验和必抛 `fault.attachment.checksumUnavailable`。修法:纯 JS SHA-256 兜底(对照 `node:crypto` 验证过),有 WebCrypto 时仍优先使用。

## Windows 构建备注

- `scripts/build-zcode.mjs` 用 `spawnSync("pnpm")` → Windows 下 ENOENT。绕过:手动跑各 filter 构建,再 `--skip-build`。
- `packages/shared` 没有 build 脚本但组包需要 `dist/index.js` → 在其内执行一次 `pnpm exec tsc`。
- 最终 tar 打包收到 `C:\...` 路径会失败(GNU tar 把 `C:` 当主机名)。用相对路径。
- 纯网页构建用 `ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install`。
