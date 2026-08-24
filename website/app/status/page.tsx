import type { Metadata } from "next";
import { Shell, StatusDot } from "../components/Shell";

export const metadata: Metadata = { title: "发布状态", description: "Research KMS 各发布通道与能力就绪情况。" };

const rows = [
  ["官网与交互预览", "live", "可用", "使用示例数据，不收集文件或密钥"],
  ["本地 Web / PWA", "live", "就绪", "单个受信用户与私有网络"],
  ["OpenAI-compatible Chat", "live", "就绪", "DeepSeek 等服务可在本地设置中配置"],
  ["Anthropic / Ollama 原生 Chat", "quiet", "计划中", "界面保持禁用，不展示虚假可用性"],
  ["Windows 签名版", "warn", "内测", "已有打包源码；等待证书与签名更新通道"],
  ["Android Play 版", "warn", "内测", "已有打包源码；等待 AAB 签名与商店合规"],
  ["公网多用户 SaaS", "warn", "已阻断", "必须先完成身份、租户授权、数据删除与配额"],
] as const;

export default function StatusPage() {
  return <Shell><main className="subpage"><section className="page-intro wrap"><span className="kicker">Release ledger</span><h1>用可验证的状态，<br />代替“即将上线”。</h1><p>该页记录公开版的能力与边界，不代替运行时监控。生产发布还需日志、指标、追踪、告警和用户可见的事故页。</p></section><section className="status-table wrap"><div className="status-row header"><span>Surface / capability</span><span>Status</span><span>Boundary</span></div>{rows.map(([name, tone, label, note]) => <div className="status-row" key={name}><b>{name}</b><span className={`status-label ${tone}`}><StatusDot tone={tone} />{label}</span><p>{note}</p></div>)}</section><section className="requirements wrap"><div><span className="kicker">Build evidence</span><h2>每次发布<br />都应可以重现。</h2></div><div><p>公开包提供 Maven 测试、TypeScript/生产构建、Windows 和 Android 手动工作流。真正发布前还应添加 SBOM、完整 Git 历史密密扫描、已签名产物验证和恢复演练。</p><a className="text-link" href="/security">查看安全门禁 →</a></div></section></main></Shell>;
}
