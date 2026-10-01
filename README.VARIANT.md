# ZCode LAN Web Variant (v3.14.3 + LAN deployment patches)

A self-hosting-oriented variant of [zai-org/ZCode](https://github.com/zai-org/ZCode) v3.14.3, patched so that the open-source `zcode --web` server runs reliably on a **Windows LAN machine** and the web client behaves like a full daily driver.

> Upstream status (v3.14.3): all fixes below are still required for a LAN web deployment — upstream disables GitHub Issues, so these changes are published here.

## What this variant changes (vs upstream v3.14.3)

| # | Fix | Why | File(s) |
|---|-----|-----|---------|
| 1 | `.mjs` added to static MIME table (+ mp4/webm/mp3/m4a) | `pdf.worker.min-*.mjs` was served as `application/octet-stream`; Chromium rejects Worker scripts with that MIME → pdf.js collapsed to fake worker and PDF preview always failed | `packages/server/src/http.ts` |
| 2 | pdf.js `workerSrc` versioned (`?v=2`) | Worker asset is `immutable`-cached for a year; browsers that cached the bad-MIME response stay broken even after fix #1 — the version bump busts the poisoned cache | `packages/ui/src/components/ui/pdf-viewer.tsx` |
| 3 | Inline-code file paths become clickable file citations | Models often emit paths wrapped in backticks instead of `:zcode-file-citation` directives; the remark plugin skipped `inlineCode` nodes. Now a bare path (path separator + 33-extension allowlist) projects to a clickable file reference — works in main chat and selection side chat | `packages/ui/src/lib/zcodeFileCitationRemarkPlugin.ts` |
| 4 | Web fallback for task lists | Sidebar grouped/pinned/archived lists only read the `WindowHostController` channel, which is desktop-Host-only; on web they silently rendered empty ("no archived tasks"). When the controller call fails or times out (8s), the hook now falls back to direct `zcodeTaskService.listArchivedTasks/listPinnedTasks/listTasks` per workspace scope. Unsupported kinds (`timeline`) throw to keep the last list instead of wiping it; fallback timers are cleared | `packages/ui/src/hooks/useGlobalTaskList.ts` |
| 5 | Grouped sticky header: data channel instead of ReactNode | The sticky-group-header effect pushed a fresh `<StickyGroupHeader/>` element into sidebar state on every run (2 forced re-renders per run, element never `Object.is`-equal) — once real task rows appeared on web this spun into React error #185 (max update depth). The channel now carries plain data `{groupId, collapsed, tooltipsDisabled, node, callbacks}` and the sidebar renders the element itself; deps trimmed to 4 stable items | `packages/ui/src/WorkspaceGroupedTasksSection.tsx`, `packages/ui/src/WorkspaceSidebar.tsx`, `packages/ui/src/workspace-grouped-tasks/sticky-group-header-slot.tsx` |
| 6 | Code-block theme follows the UI, not the OS | Side chat panes that miss the host theme fall back to `"system"` → `matchMedia(OS)`; on a light OS + dark UI this resolved a light code theme → near-invisible text. `"system"` now reads `<html>`'s applied `dark` class | `packages/ui/src/components/ai-elements/message.tsx` |
| 7 | Attachment checksum fallback for HTTP origins | `crypto.subtle` is undefined on insecure origins (e.g. `http://<lan-ip>:3030`), so attachment upload always threw `fault.attachment.checksumUnavailable`. Added a pure-JS SHA-256 fallback (verified against `node:crypto`) | `packages/ui/src/v4/attachmentUploadTransaction.ts` |

## Build notes (Windows)

Upstream v3.14.3 build issues on Windows, also fixed/pinned here in practice:

- `scripts/build-zcode.mjs` uses `spawnSync("pnpm")` → `ENOENT` on Windows (`.cmd` not resolvable without shell). Work around by running the filter builds manually, then `node scripts/build-zcode.mjs --skip-build`.
- `packages/shared` ships no `build` script but the pack step needs `packages/shared/dist/index.js` → run `pnpm exec tsc` inside `packages/shared` once.
- The final tar step fails when GNU tar receives a `C:\...` path (parses `C:` as a host). Use relative paths.
- `ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install` avoids the blocked Electron binary download; desktop is not needed for web deployment.

Deploy shape that this variant was validated on: `node zcode/bin/zcode.mjs --web --host 0.0.0.0 --port 3030 --token <token>` on Windows, launched detached (WMI `Win32_Process.Create` — SSH-spawned children get reaped on session close), reading the same `~/.zcode` session store as the closed desktop build.

## Not included

- No secrets/keys (checked). Runtime config lives in `~/.zcode` outside this repo.
- Desktop/Electron build assets are not prebuilt here.

## License

Apache-2.0, same as upstream.
