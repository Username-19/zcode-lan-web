# 变体说明

[English](README.VARIANT.md) | 简体中文

基于官方 v3.14.3 的局域网网页部署变体:修复了网页端 PDF 预览、任务列表、文件链接等 7 处缺陷,已部署日常使用。缺陷与修复清单如下,每条 = 缺陷 → 修复(文件)。

## 缺陷与修复

1. **PDF 预览必挂**:`.mjs` worker 被按 octet-stream 下发,Chromium 拒收 → 静态 MIME 表补 `.mjs`(`packages/server/src/http.ts`)
2. **修完仍挂**:worker 资源被 immutable 缓存一年,坏响应洗不掉 → `workerSrc` 加 `?v=2` 换 URL(`packages/ui/src/components/ui/pdf-viewer.tsx`)
3. **反引号里的文件路径不可点**:插件跳过 inlineCode 节点 → 路径形状的行内代码(分隔符+33 种扩展名白名单)投影为链接(`packages/ui/src/lib/zcodeFileCitationRemarkPlugin.ts`)
4. **侧栏分组/置顶/归档列表恒为空**:列表只读桌面版专属通道 → Controller 失败时降级直连任务服务(`packages/ui/src/hooks/useGlobalTaskList.ts`)
5. **真实任务行渲染后触发 React #185**:吸顶表头 effect 每轮把新建 React 元素塞进 state → 改传原始数据,侧栏自渲染(`packages/ui/src/WorkspaceGroupedTasksSection.tsx` + `WorkspaceSidebar.tsx`)
6. **子面板代码块近同色隐形**:`"system"` 主题误用操作系统 matchMedia 解析 → 改读 `<html>` 实际 dark 类(`packages/ui/src/components/ai-elements/message.tsx`)
7. **HTTP 源附件上传必失败**:`crypto.subtle` 在非安全源不存在 → 纯 JS SHA-256 兜底(`packages/ui/src/v4/attachmentUploadTransaction.ts`)

向上游的 PR:见 zai-org/ZCode 的 Pull Requests(分支 `Username-19:fix/lan-web-deployment`)。
