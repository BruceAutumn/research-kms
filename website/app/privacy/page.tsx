import type { Metadata } from "next";
import { Shell } from "../components/Shell";

export const metadata: Metadata = { title: "隐私说明", description: "Research KMS 官网预览的数据处理边界。" };

export default function PrivacyPage() {
  return <Shell><main className="legal-page wrap"><span className="kicker">Privacy notice · preview</span><h1>隐私说明</h1><p className="legal-lede">更新日期：2026 年 8 月 24 日。本文适用于当前 Research KMS 官网与示例预览，不是未来托管 SaaS 的最终法律文件。</p><section><h2>1. 当前官网处理什么</h2><p>官网和交互预览使用内置示例数据。我们不提供真实账户注册，不收集登录密码，不上传你的 PDF / Vault 文件，也不请求模型 API Key。托管平台可能为安全与可用性记录标准网络日志，例如时间、请求路径、粗略设备信息和 IP 地址。</p></section><section><h2>2. 本地应用</h2><p>本地版的文献、笔记和数据库默认由运行者控制。当你配置第三方 AI 服务时，发送给该服务的提示、选中文本、附件或文献上下文将按该服务商的政策处理。请仅向你信任的 Provider 发送数据。</p></section><section><h2>3. 个人 API Key</h2><p>API Key 不应进入浏览器包、Git 仓库、截图或诊断日志。本地后端使用加密存储；公网版将在上线前采用按用户的信封加密、托管 KMS、轮换与删除流程。</p></section><section><h2>4. 托管账户上线前</h2><p>我们会在开始收集邮箱、文献或账户数据前更新本说明，明确处理者身份、联系方式、数据类别、目的、法律依据、保留期、子处理商、跨境传输、导出/删除和申诉通道。</p></section><section><h2>5. 你可以做什么</h2><p>不要在公开 Issue 中粘贴 API Key、数据库密码、真实论文附件、本机绝对路径或含个人信息的日志。若凭据曾被提交，请立即撤销并轮换，然后清理完整 Git 历史。</p></section></main></Shell>;
}
