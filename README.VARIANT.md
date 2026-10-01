# Patches vs upstream v3.14.3

[简体中文](README.VARIANT.zh-CN.md) | English

This fork only carries fixes required to run `zcode --web` on a Windows LAN machine. Each fix: symptom → root cause → change. All verified on `v3.14.3`.

## 1. PDF preview broken: served `.mjs` worker as `application/octet-stream`

`packages/server/src/http.ts` — the static MIME table has no `.mjs` entry. `pdf.worker.min-*.mjs` is served with `application/octet-stream`; Chromium refuses Worker scripts with that MIME, pdf.js degrades to a fake worker and `getDocument` fails — every PDF preview shows "unavailable".

Fix: add `.mjs: text/javascript; charset=utf-8` (plus mp4/webm/mp3/m4a).

## 2. PDF preview still broken after #1: poisoned immutable cache

`packages/ui/src/components/ui/pdf-viewer.tsx` — the worker asset is served with `Cache-Control: immutable, max-age=1y`. Browsers that cached the bad-MIME response keep failing after the server is fixed. Fix: append `?v=2` to `workerSrc` to bust the cache.

## 3. File paths in backticks are dead text

`packages/ui/src/lib/zcodeFileCitationRemarkPlugin.ts` — clickable file links are only created from explicit `:zcode-file-citation{path="..."}` directives; `SKIPPED_PARENT_TYPES` includes `inlineCode`, and models frequently emit paths as inline code. Fix: an `inlineCode` node whose whole value is path-shaped (has a path separator, extension in a 33-entry allowlist, ≤512 chars) is projected to a link node. Code blocks and command snippets are untouched (they contain spaces/quotes and fail the shape check).

## 4. Web sidebar/archive lists are always empty

`packages/ui/src/hooks/useGlobalTaskList.ts` — grouped/pinned/archived lists read the `WindowHostController` channel, which only the desktop host implements. On web the channel call fails fast and the hook keeps an empty list. Fix: on controller failure or 8s timeout, fall back to direct `zcodeTaskService.listArchivedTasks/listPinnedTasks/listTasks` per workspace scope. Unsupported kinds (`timeline`) throw so the last list is preserved, and fallback timers are cleared in `finally`.

## 5. React #185 (max update depth) once real task rows render on web

`packages/ui/src/WorkspaceGroupedTasksSection.tsx` + `WorkspaceSidebar.tsx` — the grouped-sticky-header effect pushed a freshly-created `<StickyGroupHeader/>` element into sidebar state on every run (2 forced re-renders per run; a new element is never `Object.is`-equal). With empty lists this never ran; once #4 populated real rows it spun past React's nested-update limit. Fix: the effect now reports plain data `{groupId, collapsed, tooltipsDisabled, node, callbacks}` and the sidebar renders the element itself — setState bails when data is unchanged. Effect deps trimmed from 9 (5 unstable callback identities) to 4 stable ones.

## 6. Code blocks render near-invisible in panes that miss the host theme

`packages/ui/src/components/ai-elements/message.tsx` — panes without a host theme fall back to `"system"`, which resolved via `matchMedia(OS)`. Light OS + dark UI → light code theme on a dark background. Fix: the `"system"` branch reads `<html>`'s applied `dark` class instead.

## 7. Attachment upload fails on HTTP origins

`packages/ui/src/v4/attachmentUploadTransaction.ts` — `crypto.subtle` is undefined on insecure origins (`http://<lan-ip>:3030`), so the SHA-256 checksum threw `fault.attachment.checksumUnavailable` on every upload. Fix: pure-JS SHA-256 fallback (verified against `node:crypto`), WebCrypto still preferred when available.

## Windows build notes

- `scripts/build-zcode.mjs` uses `spawnSync("pnpm")` → `ENOENT` on Windows. Workaround: run filter builds manually, then `--skip-build`.
- `packages/shared` has no build script but packaging needs `dist/index.js` → `pnpm exec tsc` inside it once.
- The final tar step breaks on `C:\...` paths (GNU tar parses `C:` as a host). Use relative paths.
- `ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install` for headless/web-only builds.
