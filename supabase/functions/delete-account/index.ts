// Deletes the calling user's account (Google Play requires in-app account deletion).
// 1. prepare_account_deletion() runs as the user: removes solo weddings, hands over shared ones.
// 2. Photos and documents of the removed weddings are deleted from storage.
// 3. The auth user is deleted with the service role, which cascades to profile and memberships.
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const BUCKET = "wedding-files";

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers });

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers });

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user) return new Response("Unauthorized", { status: 401, headers });

  // Runs with the user's own rights (incl. second factor when the account uses one).
  const { data: removed, error: prepErr } = await asUser.rpc("prepare_account_deletion");
  if (prepErr) return new Response(JSON.stringify({ error: "prepare_failed" }), { status: 403, headers });

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  for (const wid of (removed as string[] | null) ?? []) {
    for (const area of ["ph", "vp", "pf"]) {
      for (;;) {
        const { data: files } = await admin.storage.from(BUCKET).list(`${wid}/${area}`, { limit: 1000 });
        if (!files || !files.length) break;
        await admin.storage.from(BUCKET).remove(files.map((f) => `${wid}/${area}/${f.name}`));
        if (files.length < 1000) break;
      }
    }
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) return new Response(JSON.stringify({ error: "delete_failed" }), { status: 500, headers });

  return new Response(JSON.stringify({ ok: true }), { headers: { ...headers, "Content-Type": "application/json" } });
});
