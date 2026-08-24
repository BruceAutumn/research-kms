import { productEnv } from "./runtime";

export async function indexEntity(userId: string, type: "paper" | "note" | "annotation" | "conversation", id: string | number, title: string, body: string) {
  const db = productEnv().DB;
  await db.batch([
    db.prepare("DELETE FROM search_index WHERE user_id=? AND entity_type=? AND entity_id=?").bind(userId, type, String(id)),
    db.prepare("INSERT INTO search_index (entity_type,entity_id,user_id,title,body) VALUES (?,?,?,?,?)")
      .bind(type, String(id), userId, title.slice(0, 1000), body.slice(0, 500_000)),
  ]);
}

export async function removeIndexedEntity(userId: string, type: string, id: string | number) {
  await productEnv().DB.prepare("DELETE FROM search_index WHERE user_id=? AND entity_type=? AND entity_id=?").bind(userId, type, String(id)).run();
}
