import { requireApiUser } from "../../../../lib/api-user";
import { AGENT_TOOLS } from "../../../../lib/agent";
import { routeError } from "../../../../lib/runtime";

export async function GET() {
  try {
    await requireApiUser();
    return Response.json({ tools: AGENT_TOOLS });
  } catch (error) { return routeError(error); }
}
