import { getChatGPTUser } from "../app/chatgpt-auth";
import { HttpError, touchProfile } from "./runtime";

export async function requireApiUser() {
  const user = await getChatGPTUser();
  if (!user) throw new HttpError(401, "请先登录。");
  await touchProfile(user);
  return user;
}
