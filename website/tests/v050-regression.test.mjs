import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, root), "utf8");

test("workspace uses 100dvh and recoverable panes instead of permanently hidden mobile features", async () => {
  const [css, workspace] = await Promise.all([source("app/v050.css"), source("app/components/WorkspaceApp.tsx")]);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /\.pane-toggle-bar/);
  assert.match(css, /\.pane-open/);
  assert.match(workspace, /useStoredBoolean\("kms\.library\.collections\.open"/);
  assert.match(workspace, /onDoubleClick=\{onReset\}/);
  assert.match(workspace, /ArrowLeft/);
});

test("PDF reader is pdf.js based, range-aware and stores normalized annotation rectangles", async () => {
  const [workspace, viewer, fileRoute] = await Promise.all([
    source("app/components/WorkspaceApp.tsx"), source("app/components/PdfCanvasViewer.tsx"), source("app/api/papers/[id]/file/route.ts"),
  ]);
  assert.doesNotMatch(workspace, /<iframe/);
  assert.match(workspace, /<PdfCanvasViewer/);
  assert.match(viewer, /TextLayer/);
  assert.match(viewer, /normalizeRect/);
  assert.match(fileRoute, /Accept-Ranges/);
  assert.match(fileRoute, /Content-Range/);
});

test("note and paper saves enforce optimistic concurrency", async () => {
  const [notes, papers] = await Promise.all([source("app/api/notes/route.ts"), source("app/api/papers/[id]/route.ts")]);
  for (const route of [notes, papers]) {
    assert.match(route, /revision = revision \+ 1/);
    assert.match(route, /status: 409/);
    assert.match(route, /REVISION_CONFLICT/);
  }
});

test("hosted Agent executes registered tools stepwise with approval and cancellation gates", async () => {
  const [registry, next, approve, cancel] = await Promise.all([
    source("lib/agent.ts"), source("app/api/v1/agent-runs/[id]/next/route.ts"), source("app/api/v1/agent-runs/[id]/approve/route.ts"), source("app/api/v1/agent-runs/[id]/cancel/route.ts"),
  ]);
  assert.match(registry, /AGENT_TOOLS/);
  assert.match(registry, /write_to_vault/);
  assert.match(next, /approval_required/);
  assert.match(next, /stillActive\.status === "cancelled"/);
  assert.match(approve, /decision === "reject"/);
  assert.match(cancel, /status='cancelled'/);
});

test("login has one truthful portal entry and user operations are separated from admin", async () => {
  const [login, workspace, account] = await Promise.all([source("app/login/page.tsx"), source("app/components/WorkspaceApp.tsx"), source("app/components/AccountPanel.tsx")]);
  assert.equal((login.match(/href=\{target\}/g) || []).length, 1);
  assert.match(login, /统一账号门户/);
  assert.match(workspace, /data\.isAdmin &&/);
  assert.match(account, /导出我的数据/);
  assert.match(account, /删除个人 API Key/);
});
