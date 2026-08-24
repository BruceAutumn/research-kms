import { requireApiUser } from "../../../../../lib/api-user";
import { assertSameOrigin, audit, routeError } from "../../../../../lib/runtime";

export async function GET() {
  try {
    await requireApiUser();
    return Response.json({ sessions: [{ id: "current", current: true, client: "Web / system browser", lastSeenAt: new Date().toISOString() }], identityProviderManaged: true });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    await audit(user.userId, "account.signout_all.requested", "identity provider managed");
    return Response.json({ signOutUrl: "/signout-with-chatgpt?return_to=/", identityProviderManaged: true });
  } catch (error) { return routeError(error); }
}
