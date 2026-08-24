import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./product.css";
import "./product-fixes.css";
import "./v050.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://research-kms-workspace.huangqiuhao672790.chatgpt.site"),
  title: { default: "Research KMS", template: "%s — Research KMS" },
  description: "本地优先的 AI 科研知识工作台。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Research KMS — 从文献到知识",
    description: "文献、可调工具的 AI 与双链笔记，共用一个工作区。",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1713" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
