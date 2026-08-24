/* eslint-disable @next/next/no-html-link-for-pages */
import type { Metadata } from "next";
import { chatGPTSignInPath, getChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登录 / 注册", description: "登录或注册 Research KMS，访问你的研究工作区。" };

const methods = [
  { icon: "✉", title: "邮箱或手机号", text: "使用验证码或已有账户继续" },
  { icon: "G", title: "Google", text: "使用 Google 账户继续" },
  { icon: "M", title: "Microsoft", text: "使用 Microsoft 账户继续" },
  { icon: "●", title: "Apple", text: "使用 Apple 账户继续" },
  { icon: "✦", title: "ChatGPT", text: "使用 ChatGPT 账户继续" },
];

export default async function LoginPage() {
  const user = await getChatGPTUser();
  const target = user ? "/app" : chatGPTSignInPath("/app");
  return <main className="login-page"><section className="login-story"><a className="login-brand" href="/"><span>R</span><b>Research KMS</b></a><div><span className="kicker light">One account · every client</span><h1>登录你的<br />研究工作区。</h1><p>同一账户连接 Web、Windows 与 Android。PDF、笔记、AI 对话和个人模型设置按用户隔离。</p><ul><li>文献与标注持久保存</li><li>Vault 笔记与双链同步</li><li>个人 API Key 服务端加密</li></ul></div><small>Research KMS · 2026</small></section><section className="login-gate"><div className="login-card"><header><span className="mini-brand">R</span><div><h2>{user ? "欢迎回来" : "登录或创建账户"}</h2><p>{user ? `已识别 ${user.email}` : "选择一种安全方式继续"}</p></div></header>{user ? <a className="login-primary" href="/app">打开我的工作区 →</a> : <div className="login-methods">{methods.map(method => <a href={target} key={method.title}><i>{method.icon}</i><span><b>{method.title}</b><small>{method.text}</small></span><em>→</em></a>)}</div>}<div className="login-divider"><span>安全说明</span></div><p className="login-legal">本站使用统一身份认证完成登录与注册，不在产品数据库中保存密码。继续即表示你同意 <a href="/terms">使用条款</a> 与 <a href="/privacy">隐私政策</a>。</p><a className="login-back" href="/">← 返回官网</a></div></section></main>;
}
