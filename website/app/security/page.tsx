import type { Metadata } from "next";
import { CheckIcon, Shell, StatusDot } from "../components/Shell";

export const metadata: Metadata = { title: "安全", description: "Research KMS 数据边界、BYOK 设计与公网发布门禁。" };

const gates = [
  ["身份与会话", "OIDC Authorization Code + PKCE、验证邮箱、重置、MFA / Passkey、设备会话撤销。"],
  ["租户授权", "每个数据表、对象 ID、SSE 流、PDF 与 Vault 路径都必须被 user/workspace 约束。"],
  ["个人 API Key", "使用信封加密和托管 KMS，永不回传已保存的明文 Key，支持轮换、删除和日志脱敏。"],
  ["文件处理", "扩展名与魔数校验、大小/页数/文本上限、隔离解析、扫毒、租户存储与生命周期清理。"],
  ["滥用防护", "登录限速、账户/IP 配额、LLM 与工具预算、并发上限、超时、有界队列。"],
  ["账户生命周期", "导出、删除、保留期、备份删除传播、同意版本与审计记录。"],
];

export default function SecurityPage() {
  return <Shell><main className="subpage security-page"><section className="page-intro wrap"><span className="kicker">Trust is a feature</span><h1>安全不是<br />一个“登录”按钮。</h1><p>我们区分已实现的本地防护与公网服务必须完成的系统性控制。当前后端在 `public` 模式下会主动拒绝启动。</p></section><section className="security-state wrap"><article><span className="release-label"><StatusDot /> Implemented locally</span><h2>本地版已有的防护</h2><ul className="check-list"><li><CheckIcon />请求安全响应头和更准确的 4xx 映射</li><li><CheckIcon />PDF 魔数、大小、页数和提取文本上限</li><li><CheckIcon />Vault 文件白名单与更安全的下载头</li><li><CheckIcon />AI 附件使用不透明 token，不暴露服务器绝对路径</li><li><CheckIcon />原生容器仅开放 Tauri core 默认权限</li></ul></article><article className="blocked-card"><span className="release-label"><StatusDot tone="warn" /> Public hosting blocked</span><h2>为什么还不开放真实账户？</h2><p>现有数据层是单用户模型。如果只在前端补一个注册页，用户仍可能通过对象 ID、文件路径或 Agent 流访问他人数据。这种“有界面、无隔离”比没有登录更危险。</p><a className="text-link" href="/account">查看账户界面边界 →</a></article></section><section className="section wrap"><div className="section-heading narrow"><span className="kicker">Public release gates</span><h2>公网模式的六个 P0 门禁</h2></div><div className="gate-grid">{gates.map(([title, text], i) => <article key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section><section className="reporting wrap"><div><span className="kicker light">Responsible disclosure</span><h2>发现安全问题？</h2></div><p>公开仓库不接收真实密钥或含个人文献的复现附件。请提供最小化、脱敏的复现说明；正式发布前将在域名下公布专用安全联系方式。</p></section></main></Shell>;
}
