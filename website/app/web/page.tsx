import type { Metadata } from "next";
import { Shell } from "../components/Shell";
import { ProductDemo } from "../components/ProductDemo";

export const metadata: Metadata = { title: "网页预览", description: "使用示例数据体验 Research KMS 的文献、AI 和 Vault 工作流。" };

export default function WebPreviewPage() {
  return <Shell><main className="subpage demo-page"><section className="page-intro wrap"><span className="kicker">Interactive preview</span><h1>用一个研究问题，<br />走遍三个工作区。</h1><p>这是可交互的前端预览，使用内置示例文献；不会上传文件或调用你的模型 API。</p></section><ProductDemo /><section className="demo-note wrap"><div><b>想处理自己的 PDF？</b><p>请在本地安装版中使用。面向公网用户的托管账户服务需要先完成多租户安全门禁。</p></div><a className="button primary" href="/download">查看安装方式</a></section></main></Shell>;
}
