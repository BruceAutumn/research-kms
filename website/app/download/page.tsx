import type { Metadata } from "next";
import { PlatformIcon, Shell, StatusDot } from "../components/Shell";

export const metadata: Metadata = { title: "下载", description: "下载 Research KMS Web、Windows 与 Android 客户端。" };

const releaseRoot = "https://github.com/BruceAutumn/research-kms/releases/download/v0.5.0";

export default function DownloadPage() {
  return <Shell><main className="subpage"><section className="page-intro wrap"><span className="kicker">Three surfaces, one workspace</span><h1>选择你的<br />研究入口。</h1><p>Web、Windows 与 Android 使用同一账户和同一份研究资料。网页端无需安装，客户端可直接下载安装。</p></section><section className="download-grid wrap"><article className="download-card featured"><div className="download-icon"><PlatformIcon kind="web" /></div><span className="release-label"><StatusDot /> Available</span><h2>Web</h2><p>登录后直接上传 PDF、配置个人模型 API、使用 AI Studio 与双链知识库。</p><a className="button primary" href="/app">打开 Web 客户端 →</a><small>无需安装</small></article><article className="download-card"><div className="download-icon"><PlatformIcon kind="windows" /></div><span className="release-label"><StatusDot /> v0.5.0</span><h2>Windows</h2><p>适用于 Windows 10/11 的桌面客户端，连接同一个加密工作区。</p><a className="button primary" href={`${releaseRoot}/Research-KMS-Windows-v0.5.0-Setup.exe`}>下载 Windows →</a><small>未签名安装包可能显示来源提醒</small></article><article className="download-card"><div className="download-icon"><PlatformIcon kind="android" /></div><span className="release-label"><StatusDot /> v0.5.0</span><h2>Android</h2><p>适用于 Android 的可侧载 APK，支持移动端登录和资料访问。</p><a className="button primary" href={`${releaseRoot}/Research-KMS-Android-v0.5.0.apk`}>下载 Android →</a><small>安装时需允许本次来源</small></article></section><section className="requirements wrap"><div><span className="kicker">同一账户</span><h2>从电脑阅读，<br />到手机继续。</h2></div><div><p>客户端不内置个人 API Key 或数据库密码，只连接 Research KMS 正式 HTTPS 工作区。你的模型设置与研究资料仍按登录账户隔离。</p><a className="text-link" href="/app">立即打开 Web 客户端 →</a></div></section></main></Shell>;
}
