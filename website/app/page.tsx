import type { Metadata } from "next";
import { ArrowIcon, CheckIcon, PlatformIcon, Shell, StatusDot } from "./components/Shell";

export const metadata: Metadata = {
  title: "Research KMS — 从文献到知识，一个工作区",
  description: "统一管理文献、AI 工具与双链笔记的本地优先研究工作台。",
};

const features = [
  {
    index: "01",
    eyebrow: "Literature",
    title: "论文不再是一排沉默的 PDF",
    text: "上传 PDF，校对 DOI / BibTeX 元数据，阅读、标注、引用与相关文献在同一处完成。AI 提取结果始终经由你确认后写回。",
    tags: ["PDF 阅读", "元数据", "标注", "BibTeX"],
  },
  {
    index: "02",
    eyebrow: "AI Studio",
    title: "不只回答，还能解释它做了什么",
    text: "Chat 用于探讨，Agent 用于分步工作。文献、笔记与附件可显式加入上下文；工具调用可见，写入操作需要授权。",
    tags: ["Chat / Agent", "工具调用", "上下文", "可取消"],
  },
  {
    index: "03",
    eyebrow: "Knowledge Vault",
    title: "将问题、证据和想法连成网络",
    text: "Markdown 文件是事实来源。WikiLink、反向链接、YAML 属性、标签、表格和知识图谱一并可用，也保留普通文件的可迁移性。",
    tags: ["WikiLink", "Backlinks", "YAML", "Graph"],
  },
];

export default function Home() {
  return (
    <Shell>
      <main>
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="eyebrow"><StatusDot /> Web · Windows · Android</div>
            <h1>让文献、AI<br />与笔记，共用<br /><em>同一段思考。</em></h1>
            <p className="hero-lede">Research KMS 是一个本地优先的研究工作台——Zotero 式文献管理、可调工具的 AI，加上 Obsidian 式双链 Vault。</p>
            <div className="hero-actions">
              <a className="button primary" href="/app">登录 / 注册并使用 <ArrowIcon /></a>
              <a className="button ghost" href="/download">下载客户端</a>
            </div>
            <p className="microcopy">账户数据隔离 · 自带模型 API · 密钥服务端加密</p>
          </div>
          <WorkspaceArtwork />
        </section>

        <section className="principles wrap" aria-label="Product principles">
          <div><strong>BYOM</strong><span>DeepSeek 与 OpenAI-compatible</span></div>
          <div><strong>LOCAL-FIRST</strong><span>Markdown 和 PDF 由你控制</span></div>
          <div><strong>VISIBLE TOOLS</strong><span>工具过程可查看、可取消</span></div>
          <div><strong>PORTABLE</strong><span>Web · Windows · Android</span></div>
        </section>

        <section className="section wrap" id="product">
          <div className="section-heading">
            <span className="kicker">One research loop</span>
            <h2>从“收藏了”，到“真正用上了”。</h2>
            <p>不再把同一个研究问题拆在三个孤立软件里。</p>
          </div>
          <div className="feature-stack">
            {features.map((feature) => (
              <article className="feature-row" key={feature.index}>
                <div className="feature-index">{feature.index}</div>
                <div className="feature-title"><span>{feature.eyebrow}</span><h3>{feature.title}</h3></div>
                <div className="feature-body"><p>{feature.text}</p><div className="tag-row">{feature.tags.map(tag => <span key={tag}>{tag}</span>)}</div></div>
              </article>
            ))}
          </div>
        </section>

        <section className="section wrap two-up">
          <article className="model-card dark-card">
            <div className="kicker light">Model routing</div>
            <h2>你选模型，<br />工作区守边界。</h2>
            <p>通过后端加密保存个人 API Key，配置 DeepSeek、OpenAI、OpenRouter 等 OpenAI-compatible 服务。客户端不携带任何预置密钥。</p>
            <div className="model-list">
              <div><StatusDot /><span>DeepSeek</span><small>OpenAI-compatible</small></div>
              <div><StatusDot /><span>OpenRouter</span><small>OpenAI-compatible</small></div>
              <div><StatusDot tone="quiet" /><span>Anthropic native</span><small>Roadmap</small></div>
            </div>
          </article>
          <article className="release-card">
            <div className="kicker">Your workspace</div>
            <h2>登录一次，<br />资料随你打开。</h2>
            <p>网页与客户端使用同一账户。文献、PDF、笔记、对话和模型设置按用户隔离，个人 API Key 加密保存且不会回传浏览器。</p>
            <ul className="check-list">
              <li><CheckIcon />无需另设密码，使用 ChatGPT 账户登录</li>
              <li><CheckIcon />PDF 与 Vault 按账户持久化</li>
              <li><CheckIcon />模型 API 可自由配置和替换</li>
            </ul>
            <a className="text-link" href="/app">打开我的工作区 <ArrowIcon /></a>
          </article>
        </section>

        <section className="cta wrap">
          <div><span className="kicker light">Choose your surface</span><h2>在桌面深度阅读，<br />在手机上捕捉想法。</h2></div>
          <div className="cta-platforms">
            <a href="/app"><PlatformIcon kind="web" /><span><small>立即使用</small>Web</span><ArrowIcon /></a>
            <a href="/download"><PlatformIcon kind="windows" /><span><small>下载安装</small>Windows</span><ArrowIcon /></a>
            <a href="/download"><PlatformIcon kind="android" /><span><small>下载安装</small>Android</span><ArrowIcon /></a>
          </div>
        </section>
      </main>
    </Shell>
  );
}

function WorkspaceArtwork() {
  return (
    <div className="workspace-art" aria-label="Research KMS interface illustration">
      <div className="workspace-top"><span className="mini-mark">R</span><span>Research KMS</span><div className="top-search">Search papers, notes, chats… <kbd>⌘ K</kbd></div><span className="avatar">HQ</span></div>
      <div className="workspace-body">
        <aside className="workspace-rail">
          <b>Library</b><span className="active">All papers <i>24</i></span><span>Recently read</span><span>Collections</span><hr /><b>Vault</b><span>Research map</span><span>Daily notes</span>
        </aside>
        <div className="workspace-main">
          <div className="paper-toolbar"><span>Attention Is All You Need.pdf</span><small>8 / 15</small></div>
          <div className="paper-sheet">
            <small>3.2.2   SCALED DOT-PRODUCT ATTENTION</small>
            <h4>Attention is all you need</h4>
            <p>We call our particular attention "Scaled Dot-Product Attention". The input consists of queries and keys…</p>
            <div className="equation">Attention(Q, K, V) = softmax(QK<sup>T</sup> / √d<sub>k</sub>)V</div>
            <p className="highlight-line">The Transformer allows for significantly more parallelization and can reach a new state of the art.</p>
            <div className="annotation-pin">1</div>
          </div>
        </div>
        <aside className="ai-panel">
          <div className="ai-panel-head"><span className="spark">✦</span><b>AI Studio</b><small>Agent</small></div>
          <div className="context-pill">PDF · page 8 selected</div>
          <div className="ai-message">Extract the core contribution and connect it to my <b>Transformer notes</b>.</div>
          <div className="agent-step done"><i>✓</i><span>Read selected passage<small>1.2s</small></span></div>
          <div className="agent-step done"><i>✓</i><span>Find linked note<small>0.8s</small></span></div>
          <div className="agent-step running"><i></i><span>Draft evidence card<small>Running</small></span></div>
          <div className="ai-response"><b>Core contribution</b><p>The paper replaces recurrence with attention, enabling parallel sequence modeling…</p></div>
        </aside>
      </div>
      <div className="art-caption"><span>PDF 阅读上下文</span><span>Agent 工具轨迹</span><span>Vault 双向链接</span></div>
    </div>
  );
}
