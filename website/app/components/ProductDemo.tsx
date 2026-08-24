"use client";

import { useState } from "react";

type Area = "library" | "ai" | "vault";
type Mode = "chat" | "agent";

const papers = [
  { title: "Attention Is All You Need", authors: "Vaswani et al.", year: "2017", status: "Reading" },
  { title: "BERT: Pre-training of Deep Bidirectional Transformers", authors: "Devlin et al.", year: "2019", status: "Unread" },
  { title: "Retrieval-Augmented Generation", authors: "Lewis et al.", year: "2020", status: "Read" },
];

export function ProductDemo() {
  const [area, setArea] = useState<Area>("library");
  const [mode, setMode] = useState<Mode>("chat");
  const [extracted, setExtracted] = useState(false);
  const [noteLinked, setNoteLinked] = useState(false);

  return <section className="product-demo wrap" aria-label="Product preview">
    <div className="demo-banner"><span>DEMO WORKSPACE</span><p>全部内容为示例数据</p><span className="demo-online"><i /> Local preview</span></div>
    <div className="demo-shell">
      <aside className="demo-nav">
        <div className="demo-logo">R</div>
        <button className={area === "library" ? "active" : ""} onClick={() => setArea("library")}><span>▤</span>Literature</button>
        <button className={area === "ai" ? "active" : ""} onClick={() => setArea("ai")}><span>✦</span>AI Studio</button>
        <button className={area === "vault" ? "active" : ""} onClick={() => setArea("vault")}><span>⎆</span>Vault</button>
        <div className="demo-nav-bottom"><button><span>⚙</span>Settings</button><div className="demo-user"><i>HQ</i><span>Preview<small>Local</small></span></div></div>
      </aside>
      <div className="demo-content">
        {area === "library" && <LibraryDemo extracted={extracted} onExtract={() => setExtracted(true)} onAsk={() => setArea("ai")} />}
        {area === "ai" && <AiDemo mode={mode} setMode={setMode} onLink={() => { setNoteLinked(true); setArea("vault"); }} />}
        {area === "vault" && <VaultDemo linked={noteLinked} onAi={() => setArea("ai")} />}
      </div>
    </div>
  </section>;
}

function LibraryDemo({ extracted, onExtract, onAsk }: { extracted: boolean; onExtract: () => void; onAsk: () => void }) {
  return <div className="library-demo"><div className="demo-titlebar"><div><small>LITERATURE</small><h2>All papers</h2></div><button className="demo-button">+ Import PDF</button></div><div className="library-grid"><div className="paper-list"><div className="paper-search">Search 24 papers… <kbd>⌘ K</kbd></div>{papers.map((paper, index) => <button className={`paper-row ${index === 0 ? "selected" : ""}`} key={paper.title}><i className="pdf-badge">PDF</i><span><b>{paper.title}</b><small>{paper.authors} · {paper.year}</small></span><em>{paper.status}</em></button>)}</div><div className="paper-detail"><span className="preview-chip">PDF · 15 pages</span><h3>Attention Is All You Need</h3><p className="authors">Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit et al.</p><div className="metadata-grid"><span><small>YEAR</small>2017</span><span><small>VENUE</small>NeurIPS</span><span><small>DOI</small>10.48550/arXiv.1706.03762</span><span><small>CITE KEY</small>vaswani2017attention</span></div><div className="abstract"><small>ABSTRACT</small><p>The dominant sequence transduction models are based on complex recurrent or convolutional neural networks…</p></div>{!extracted ? <button className="extract-button" onClick={onExtract}><span>✦</span> AI 提取元数据</button> : <div className="extraction-result"><div><b>✓ 提取完成</b><small>4 个字段等待确认</small></div><span>98% confidence</span></div>}<button className="ask-button" onClick={onAsk}>用 AI 解读本文 →</button></div></div></div>;
}

function AiDemo({ mode, setMode, onLink }: { mode: Mode; setMode: (m: Mode) => void; onLink: () => void }) {
  return <div className="ai-demo"><div className="demo-titlebar"><div><small>AI STUDIO</small><h2>Transformer evidence review</h2></div><div className="mode-switch"><button className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")}>Chat</button><button className={mode === "agent" ? "active" : ""} onClick={() => setMode("agent")}>Agent</button></div></div><div className="context-row"><span>PDF · Attention Is All You Need</span><span>Vault · [[Transformer]]</span></div><div className="chat-stream"><div className="human-message">这篇论文的核心贡献是什么？用当前 PDF 和我的 Transformer 笔记回答。</div>{mode === "agent" && <div className="tool-trace"><div><i>✓</i><span>read_pdf_selection<small>page 1–8 · 1.2s</small></span></div><div><i>✓</i><span>read_vault_note<small>Transformer.md · 0.4s</small></span></div><div><i>✓</i><span>find_related_papers<small>3 results · 0.9s</small></span></div></div>}<div className="assistant-message"><span className="assistant-mark">✦</span><div><b>核心贡献</b><p>论文将序列建模从递归结构转向完全基于注意力的 Transformer，从而提高训练并行度，并更直接地捕捉长程依赖。</p><ol><li><b>架构：</b>移除循环与卷积，仅使用 self-attention 和前馈网络。</li><li><b>效率：</b>令 token 计算可并行，缩短有效路径长度。</li><li><b>证据：</b>机器翻译结果在更低训练成本下达到当时领先水平。</li></ol><button onClick={onLink}>Create linked evidence note →</button></div></div></div><div className="composer-preview"><span>⊕</span><p>Ask with papers, notes and files…</p><button>↑</button></div></div>;
}

function VaultDemo({ linked, onAi }: { linked: boolean; onAi: () => void }) {
  return <div className="vault-demo"><div className="demo-titlebar"><div><small>KNOWLEDGE VAULT</small><h2>Transformer.md</h2></div><button className="demo-button" onClick={onAi}>✦ Ask AI</button></div><div className="vault-grid"><aside className="file-tree"><b>RESEARCH VAULT</b><span>▾ 📁 Concepts</span><span className="indent active">📄 Transformer.md</span><span className="indent">📄 Attention.md</span><span>▾ 📁 Evidence</span>{linked && <span className="indent new-note">📄 Vaswani 2017.md</span>}<span>▸ 📁 Daily</span></aside><article className="note-editor"><div className="frontmatter">type: concept<br />status: evergreen<br />tags: [nlp, architecture]</div><h1>Transformer</h1><p>A sequence architecture built around <a>[[Self-attention]]</a> rather than recurrence.</p><h2>Why it matters</h2><ul><li>Parallel token processing improves training throughput.</li><li>Path length between positions becomes constant.</li><li>Multi-head attention learns complementary relations.</li></ul>{linked ? <blockquote><b>Evidence added</b><br />[[Vaswani 2017]] demonstrates that an attention-only architecture can outperform recurrent baselines in machine translation.</blockquote> : <p className="placeholder-note">Run the Agent and create an evidence note to see the backlink.</p>}</article><aside className="knowledge-panel"><b>BACKLINKS</b><div><strong>{linked ? "2" : "1"}</strong><span>linked mentions</span></div><a>Attention.md <small>line 18</small></a>{linked && <a className="new-link">Vaswani 2017.md <small>line 9</small></a>}<b>PROPERTIES</b><span>type <em>concept</em></span><span>status <em>evergreen</em></span></aside></div></div>;
}
