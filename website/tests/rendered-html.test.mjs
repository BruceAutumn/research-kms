import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);

async function render(path = "/") {
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the product landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Research KMS/);
  assert.match(html, /让文献、AI/);
  assert.match(html, /href="\/app"/);
  assert.match(html, /登录 \/ 注册/);
  assert.doesNotMatch(html, /href="\/security"|href="\/status"/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("server-renders the public product and legal routes", async () => {
  for (const [path, phrase] of [
    ["/download", "Windows"],
    ["/privacy", "隐私说明"],
    ["/terms", "使用条款"],
  ]) {
    const response = await render(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), new RegExp(phrase), path);
  }
});

test("protected workspace redirects unauthenticated visitors to sign in", async () => {
  const response = await render("/app");
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") || "", /^\/signin-with-chatgpt\?return_to=/);
});
