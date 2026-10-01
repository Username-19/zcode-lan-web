# ZCode 局域网网页部署变体(v3.14.3)

本仓库拷贝自官方 [zai-org/ZCode](https://github.com/zai-org/ZCode) v3.14.3,用于在 Windows 局域网机器上部署 `zcode --web`;开发、构建、打包等一切文档**详见原仓库 README**。

## 本仓库相对上游的更改(7 项网页端缺陷修复,均已实测)

1. **PDF 预览必挂**:`.mjs` worker 被按 octet-stream 下发,Chromium 拒收 → MIME 表补 `.mjs`(`packages/server/src/http.ts`)
2. **修完仍挂**:worker 资源 immutable 缓存一年,坏响应洗不掉 → `workerSrc` 加 `?v=2`(`packages/ui/src/components/ui/pdf-viewer.tsx`)
3. **反引号里的文件路径不可点**:插件跳过 inlineCode → 路径形状的行内代码投影为链接(`packages/ui/src/lib/zcodeFileCitationRemarkPlugin.ts`)
4. **侧栏分组/置顶/归档列表恒为空**:列表只读桌面版专属通道 → 失败时降级直连任务服务(`packages/ui/src/hooks/useGlobalTaskList.ts`)
5. **真实任务行渲染后 React #185**:吸顶表头 effect 每轮把新建 React 元素塞进 state → 改传原始数据,侧栏自渲染(`packages/ui/src/WorkspaceGroupedTasksSection.tsx` + `WorkspaceSidebar.tsx`)
6. **子面板代码块近同色隐形**:`"system"` 主题误用操作系统 matchMedia 解析 → 改读 `<html>` dark 类(`packages/ui/src/components/ai-elements/message.tsx`)
7. **HTTP 源附件上传必失败**:非安全源无 `crypto.subtle` → 纯 JS SHA-256 兜底(`packages/ui/src/v4/attachmentUploadTransaction.ts`)

7 项均已在本机局域网部署日常使用验证。
