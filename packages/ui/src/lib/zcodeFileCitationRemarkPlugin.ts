import type { Plugin } from "unified";
import {
  resolveAssistantRawFilePath,
  type AssistantFilePathResolveOptions,
} from "@/lib/assistantFileReferences.js";
import { getPathLeaf } from "@/lib/path.js";
import { extractZCodeFileCitations } from "@/lib/zcodeFileCitation.js";

interface CitationMarkdownNode {
  children?: CitationMarkdownNode[];
  type: string;
  url?: string;
  value?: string;
}

const SKIPPED_PARENT_TYPES = new Set(["code", "html", "image", "link"]);

// 行内代码里的裸路径(如 `D:\ws\期望方差示意图.png`)也投影为可点击文件链接。
// 模型并非总是发出 zcode-file-citation 指令,经常把路径直接写在反引号里;
// 白名单扩展名 + 路径分隔符双条件过滤,避免把普通代码片段误判成文件。
const INLINE_CODE_FILE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "pdf", "md", "txt", "csv",
  "xlsx", "xls", "doc", "docx", "pptx", "ppt", "json", "py", "js", "ts", "tsx",
  "jsx", "ps1", "bat", "cmd", "sh", "html", "css", "xml", "yaml", "yml", "log",
]);

function inlineCodeFilePathCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512) return null;
  if (!/[\\/]/.test(trimmed)) return null;
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0) return null;
  const extension = trimmed.slice(dotIndex + 1).toLowerCase();
  if (!/^[a-z0-9]{1,8}$/.test(extension) || !INLINE_CODE_FILE_EXTENSIONS.has(extension)) {
    return null;
  }
  return trimmed;
}

function projectInlineCodeFilePath(
  node: CitationMarkdownNode,
  workspacePath: string,
  options: AssistantFilePathResolveOptions,
): CitationMarkdownNode | null {
  const candidate = inlineCodeFilePathCandidate(node.value ?? "");
  if (!candidate) return null;
  const path = resolveAssistantRawFilePath(workspacePath, candidate, options);
  if (!path) return null;
  return {
    type: "link",
    url: candidate,
    children: [{ type: "text", value: getPathLeaf(path) || candidate }],
  };
}

function projectCitationTextNode(
  node: CitationMarkdownNode,
  workspacePath: string,
  options: AssistantFilePathResolveOptions,
): CitationMarkdownNode[] | null {
  const value = node.value ?? "";
  const citations = extractZCodeFileCitations(value);
  if (citations.length === 0) return null;

  const nextNodes: CitationMarkdownNode[] = [];
  let cursor = 0;
  for (const citation of citations) {
    const path = resolveAssistantRawFilePath(workspacePath, citation.path, options);
    if (!path) continue;
    if (citation.start > cursor) {
      nextNodes.push({ type: "text", value: value.slice(cursor, citation.start) });
    }
    nextNodes.push({
      type: "link",
      url: citation.path,
      children: [{ type: "text", value: getPathLeaf(path) || citation.path }],
    });
    cursor = citation.end;
  }
  if (cursor === 0) return null;
  if (cursor < value.length) {
    nextNodes.push({ type: "text", value: value.slice(cursor) });
  }
  return nextNodes;
}

function transformCitationChildren(
  node: CitationMarkdownNode,
  workspacePath: string,
  options: AssistantFilePathResolveOptions,
): void {
  if (!node.children || SKIPPED_PARENT_TYPES.has(node.type)) return;

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]!;
    if (child.type === "text") {
      const replacement = projectCitationTextNode(child, workspacePath, options);
      if (replacement) {
        node.children.splice(index, 1, ...replacement);
        index += replacement.length - 1;
      }
      continue;
    }
    if (child.type === "inlineCode") {
      const linkNode = projectInlineCodeFilePath(child, workspacePath, options);
      if (linkNode) {
        node.children.splice(index, 1, linkNode);
      }
      continue;
    }
    transformCitationChildren(child, workspacePath, options);
  }
}

export function createZCodeFileCitationRemarkPlugin(
  workspacePath: string,
  homePath?: string,
): Plugin {
  return function zcodeFileCitationRemarkPlugin() {
    return (tree: unknown) => {
      transformCitationChildren(tree as CitationMarkdownNode, workspacePath, { homePath });
    };
  };
}
