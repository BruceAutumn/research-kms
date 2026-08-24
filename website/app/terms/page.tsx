import type { Metadata } from "next";
import { Shell } from "../components/Shell";

export const metadata: Metadata = { title: "使用条款", description: "Research KMS 公开源码预览使用边界。" };

export default function TermsPage() {
  return <Shell><main className="legal-page wrap"><span className="kicker">Terms · preview</span><h1>使用条款</h1><p className="legal-lede">更新日期：2026 年 8 月 24 日。当前版本为公开源码预览，而非已商业化的托管服务。</p><section><h2>1. 许可和版权</h2><p>仓库中标注为 MIT 的原创代码可按许可文件使用。第三方依赖、学术文献、图标、模型和外部数据各自受其条款约束。</p></section><section><h2>2. 不构成学术或专业保证</h2><p>AI 提取、摘要、引用与 Agent 工具结果可能错误或不完整。用户必须核对原文、元数据、引用格式与授权。不应将本预览用于医疗、法律、金融或其他高风险决策。</p></section><section><h2>3. 第三方服务</h2><p>你自行选择并配置的 AI Provider、DOI/元数据服务和存储服务可能收费并处理你发送的数据。你负责阅读并遵守相应条款、配额与版权要求。</p></section><section><h2>4. 禁止事项</h2><p>不得利用本项目进行未授权访问、破坏性扫描、资源滥用、侵权传播、隐私侵害或规避第三方服务限制。</p></section><section><h2>5. 发布边界</h2><p>当前后端为本地单用户版，禁止未经安全改造就直接暴露到公网并承载多个不互信用户。详见安全页的公网门禁。</p></section></main></Shell>;
}
