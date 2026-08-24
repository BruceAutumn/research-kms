import type { Metadata } from "next";
import { requireChatGPTUser } from "../chatgpt-auth";
import { AccountPanel } from "../components/AccountPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "账户与数据" };

export default async function AccountPage() {
  const user = await requireChatGPTUser("/account");
  return <AccountPanel displayName={user.displayName} email={user.email} />;
}
