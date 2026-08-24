import { requireApiUser } from "../../../../../lib/api-user";
import { audit, productEnv, routeError } from "../../../../../lib/runtime";

export async function POST() {
  try {
    const user = await requireApiUser();
    const db = productEnv().DB;
    const [profile, papers, notes, annotations, conversations, messages, runs, steps, plugins, auditLog] = await Promise.all([
      db.prepare("SELECT user_id,email,display_name,created_at,last_seen_at FROM profiles WHERE user_id=?").bind(user.userId).first(),
      db.prepare("SELECT id,title,authors,year,doi,abstract_text,filename,size_bytes,collection_name,tags,favorite,reading_progress,revision,created_at,updated_at FROM papers WHERE user_id=?").bind(user.userId).all(),
      db.prepare("SELECT id,stable_id,title,content,folder,properties,pinned,revision,created_at,updated_at FROM notes WHERE user_id=?").bind(user.userId).all(),
      db.prepare("SELECT id,paper_id,page,type,color,text,comment,rects_json,revision,created_at,updated_at FROM annotations WHERE user_id=?").bind(user.userId).all(),
      db.prepare("SELECT id,title,archived,created_at,updated_at FROM conversations WHERE user_id=?").bind(user.userId).all(),
      db.prepare("SELECT id,mode,role,content,conversation_id,created_at FROM ai_messages WHERE user_id=?").bind(user.userId).all(),
      db.prepare("SELECT id,conversation_id,status,prompt,paper_id,note_id,step_count,answer,error_code,created_at,updated_at FROM agent_runs WHERE user_id=?").bind(user.userId).all(),
      db.prepare("SELECT run_id,sequence,tool_name,input_json,output_json,status,permission,created_at,updated_at FROM agent_steps WHERE user_id=?").bind(user.userId).all(),
      db.prepare("SELECT id,name,version,kind,manifest_json,permissions_json,enabled,installed_at FROM plugins WHERE user_id=?").bind(user.userId).all(),
      db.prepare("SELECT action,detail,created_at FROM audit_events WHERE user_id=? ORDER BY id DESC LIMIT 1000").bind(user.userId).all(),
    ]);
    const payload = { format: "research-kms-export", version: "0.5.0", exportedAt: new Date().toISOString(), profile, papers: papers.results, notes: notes.results, annotations: annotations.results, conversations: conversations.results, messages: messages.results, agentRuns: runs.results, agentSteps: steps.results, plugins: plugins.results, audit: auditLog.results, files: "PDF binaries are retained in private object storage and can be downloaded from the library." };
    await audit(user.userId, "account.exported", "json");
    return new Response(JSON.stringify(payload, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="research-kms-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return routeError(error); }
}
