import { requireChatGPTUser } from "../chatgpt-auth";
import { WorkspaceApp } from "../components/WorkspaceApp";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  await requireChatGPTUser("/app");
  return <WorkspaceApp />;
}
