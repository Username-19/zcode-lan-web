# Variant notes

[English](README.VARIANT.md) | [简体中文](README.VARIANT.zh-CN.md)

A LAN web-deployment variant of official v3.14.3: fixes 7 web-client defects (PDF preview, task lists, file links, React #185, theme, checksum), deployed and in daily use. List below — each item = defect → fix (files).

## Defects & fixes

1. **PDF preview always broken**: `.mjs` worker served as octet-stream, rejected by Chromium → add `.mjs` to the static MIME table (`packages/server/src/http.ts`)
2. **Still broken after #1**: worker asset poisoned by a 1-year immutable cache → version `workerSrc` (`?v=2`) (`packages/ui/src/components/ui/pdf-viewer.tsx`)
3. **Backtick file paths are dead text**: plugin skipped inlineCode nodes → path-shaped inline code projects to a link (separator + 33-extension allowlist) (`packages/ui/src/lib/zcodeFileCitationRemarkPlugin.ts`)
4. **Sidebar grouped/pinned/archived lists always empty**: lists read the desktop-only controller channel → fall back to direct task service queries (`packages/ui/src/hooks/useGlobalTaskList.ts`)
5. **React #185 once real rows render**: sticky-header effect pushed a fresh ReactNode into state every run → report plain data, sidebar renders the element (`packages/ui/src/WorkspaceGroupedTasksSection.tsx` + `WorkspaceSidebar.tsx`)
6. **Code blocks near-invisible in theme-less panes**: `"system"` resolved via OS matchMedia → read the applied `html.dark` class (`packages/ui/src/components/ai-elements/message.tsx`)
7. **Attachment upload fails on HTTP origins**: `crypto.subtle` undefined on insecure origins → pure-JS SHA-256 fallback (`packages/ui/src/v4/attachmentUploadTransaction.ts`)

Upstream PR: see zai-org/ZCode Pull Requests (branch `Username-19:fix/lan-web-deployment`).
