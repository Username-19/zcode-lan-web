# ZCode 局域网网页部署变体(v3.14.3)

本仓库拷贝自官方 [zai-org/ZCode](https://github.com/zai-org/ZCode) v3.14.3,用于在 Windows 局域网机器上部署 `zcode --web`;开发、构建、打包等一切文档**详见原仓库 README**。

## 本仓库相对上游的更改(9 项网页端缺陷修复,均已实测)

1. **PDF 预览必挂**:`.mjs` worker 被按 octet-stream 下发,Chromium 拒收 → MIME 表补 `.mjs`(`packages/server/src/http.ts`)
2. **修完仍挂**:worker 资源 immutable 缓存一年,坏响应洗不掉 → `workerSrc` 加 `?v=2`(`packages/ui/src/components/ui/pdf-viewer.tsx`)
3. **反引号里的文件路径不可点**:插件跳过 inlineCode → 路径形状的行内代码投影为链接(`packages/ui/src/lib/zcodeFileCitationRemarkPlugin.ts`)
4. **侧栏分组/置顶/归档列表恒为空**:列表只读桌面版专属通道 → 失败时降级直连任务服务(`packages/ui/src/hooks/useGlobalTaskList.ts`)
5. **真实任务行渲染后 React #185**:吸顶表头 effect 每轮把新建 React 元素塞进 state → 改传原始数据,侧栏自渲染(`packages/ui/src/WorkspaceGroupedTasksSection.tsx` + `WorkspaceSidebar.tsx`)
6. **子面板代码块近同色隐形**:`"system"` 主题误用操作系统 matchMedia 解析 → 改读 `<html>` dark 类(`packages/ui/src/components/ai-elements/message.tsx`)
7. **HTTP 源附件上传必失败**:非安全源无 `crypto.subtle` → 纯 JS SHA-256 兜底(`packages/ui/src/v4/attachmentUploadTransaction.ts`)
8. **MD 预览相对图片全裂**:相对图片一律按 workspace 根解析,嵌套目录 md 引用同级 `img/` 全部指向不存在路径;rehype-harden 又把相对 src 归一成 `/x` 逃过解析 → 按源文件目录解析并保留 workspace 根候选重试(`packages/ui/src/lib/markdownFileLink.ts` + `markdown-image.tsx` + `message.tsx` + `previewPaneMarkdownContent.tsx`)
9. **HTTP 源所有复制按钮失效**:非安全源没有 `navigator.clipboard`,表格/代码块等 25 处复制全报 clipboard-unavailable → 入口注入 execCommand 兜底 polyfill,HTTPS/桌面端自动跳过(`packages/web/src/insecureOriginClipboard.ts`)

9 项均已在本机局域网部署日常使用验证。

## 新增功能(上游没有的)

- **侧栏手机扫码入口**:桌面版"移动端远程控制"按钮在 web 端的同位平替(账号与设置按钮之间,手机图标)——点击弹出当前页面地址(含 token)的二维码,手机扫码免输入打开网页版;多端连同一会话实时同步(消息/流式输出/打断全端生效,生成中新消息走队列不打断)。手机需与本机同一局域网(`packages/ui/src/WorkspaceWebPairingQrButton.tsx`)

## Web 端固有缺陷(上游/架构限制,本变体未修)

- **辅助对话不持久**:划词侧聊面板只存前端内存,刷新即消失;子会话虽落库(task_type=selection_side_chat)但从不进侧栏任务列表,面板关闭后界面上没有入口找回,再点划词提问会新建一条子会话
- **时间线列表不可用**:timeline 数据源依赖桌面版专属的 WindowHostController 通道,降级路径不覆盖,web 端保留上次列表
- **其他 Controller 类功能缺失**:所有依赖 WindowHostController 通道的桌面专属能力在 web 端不存在
- **运行状态跨端不同步**:web 与桌面共享会话库(历史双向同步),但"正在生成"状态只存在于各自进程——桌面在跑时网页显示已停止,反之亦然

## 与官方 release(闭源桌面安装包)的区别

| | 本仓库 web 版 | 官方 release(闭源桌面) |
|---|---|---|
| 形态 | 浏览器访问,免安装,服务跑在局域网主机 | Electron 安装包,本机运行 |
| 会话库 | 共享同一 ~/.zcode,可与桌面并存 | 同左 |
| 上表 9 项缺陷 | 已修复 | 存在(上游未修) |
| 行内路径识别 | 33 种扩展名(含图片/代码) | 仅 PDF/Office/音视频 |
| 桌面专属能力 | 无(WindowHostController 类通道、手机配对云中继) | 有 |
| 存活 | 独立进程,关闭桌面应用不影响;仅服务重启中断 | 应用关闭即停 |
| 版本 | 开源 v3.14.3 | 闭源 v3.14.1/v3.14.3(同代) |
