"use client";

import { useState } from "react";

export function AccountPreview() {
  const [tab, setTab] = useState<"login" | "register">("login");
  return <div className="account-preview"><div className="account-card-head"><span className="mini-brand">R</span><div><b>{tab === "login" ? "欢迎回来" : "创建工作区"}</b><small>UI preview · no data is submitted</small></div></div><div className="account-tabs"><button className={tab === "login" ? "active" : ""} onClick={() => setTab("login")}>登录</button><button className={tab === "register" ? "active" : ""} onClick={() => setTab("register")}>注册</button></div><label>邮箱<input type="email" disabled placeholder="name@example.com" /></label><label>密码<input type="password" disabled placeholder="••••••••••••" /></label>{tab === "register" && <label className="consent-preview"><input type="checkbox" disabled />我已阅读隐私说明与数据保留政策</label>}<button className="button disabled full" disabled>{tab === "login" ? "账户服务尚未开放" : "注册尚未开放"}</button><p className="account-explainer">使用本地版不需要账户。我们不会为了展示完整度而收集无法被安全隔离的凭据。</p></div>;
}
