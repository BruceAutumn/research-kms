/* eslint-disable @next/next/no-html-link-for-pages */
import type { ReactNode } from "react";
import { getChatGPTUser } from "../chatgpt-auth";

export async function Shell({ children }: { children: ReactNode }) {
  const user = await getChatGPTUser();
  return <><header className="site-header"><a className="brand" href="/" aria-label="Research KMS home"><span>R</span><b>Research KMS</b></a><nav aria-label="Main navigation"><a href="/#product">产品</a><a href="/app">Web 客户端</a><a href="/download">下载客户端</a></nav><a className="header-account" href={user ? "/app" : "/login"}>{user ? "打开工作区" : "登录 / 注册"} <ArrowIcon /></a></header>{children}<Footer /></>;
}

export function Footer() {
  return <footer className="site-footer wrap"><div className="footer-brand"><span className="brand"><span>R</span><b>Research KMS</b></span><p>让研究材料保持可解释、可链接、可迁移。</p></div><div className="footer-links"><div><b>Product</b><a href="/app">Web 客户端</a><a href="/download">Windows / Android</a></div><div><b>Legal</b><a href="/privacy">隐私政策</a><a href="/terms">使用条款</a></div></div><div className="footer-bottom"><span>© 2026 Research KMS</span><span>Web · Windows · Android</span></div></footer>;
}

export function ArrowIcon() { return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" /></svg>; }
export function CheckIcon() { return <svg className="check-icon" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8"/><path d="m5.5 9 2.2 2.2 4.8-5"/></svg>; }
export function StatusDot({ tone = "live" }: { tone?: "live" | "quiet" | "warn" }) { return <span className={`status-dot ${tone}`} aria-hidden="true" />; }
export function PlatformIcon({ kind }: { kind: "web" | "windows" | "android" }) {
  if (kind === "windows") return <svg className="platform-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4.5 10.7 3v8.3H3V4.5Zm8.8-1.7L21 1v10.3h-9.2V2.8ZM3 12.5h7.7V21L3 19.5v-7Zm8.8 0H21V23l-9.2-1.8v-8.7Z" /></svg>;
  if (kind === "android") return <svg className="platform-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m7.2 7.1-1.6-2.5m11.2 2.5 1.6-2.5M6 8.5h12a1 1 0 0 1 1 1V17a1 1 0 0 1-1 1h-1v3h-2v-3H9v3H7v-3H6a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Zm3.5 3h.01m4.99 0h.01" /></svg>;
  return <svg className="platform-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>;
}
