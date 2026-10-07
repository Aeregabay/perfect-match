// Local stand-in for Supabase Auth, Storage and Functions – end-to-end tests only, never deployed.
// Email codes are always "123456". Database access rules are the real ones (PostgREST + RLS + storage policies).
import http from "node:http"; import crypto from "node:crypto"; import fs from "node:fs"; import { execFileSync } from "node:child_process";
const SECRET = process.env.JWT_SECRET || "local-test-secret-local-test-secret-1234", DB = process.env.PMDB || "pme2e", FILES = process.env.FILES_DIR || "/tmp/pm-e2e-files";
const PGRST = process.env.PGRST_URL || "http://localhost:3001";
fs.mkdirSync(FILES, { recursive: true });
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const sign = (p) => { const h = b64({ alg: "HS256", typ: "JWT" }), b = b64(p); return `${h}.${b}.${crypto.createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url")}`; };
const psql = (sql) => execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAq", "-c", sql]).toString().trim();
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const asUser = (u, sql) => execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAq", "-c", "set role authenticated", "-c", "set request.jwt.claims = " + lit(JSON.stringify({ sub: u.id, role: "authenticated", aal: "aal1" })), "-c", sql], { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
const users = new Map(); // email -> {id, pw, confirmed}
const hash = (p) => crypto.createHash("sha256").update(p).digest("hex");
const userObj = (id, email) => ({ id, email, aud: "authenticated", role: "authenticated", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [{ id, provider: "email", identity_id: id, user_id: id, identity_data: { email } }], factors: [], created_at: new Date().toISOString() });
const session = (id, email) => { const now = Math.floor(Date.now() / 1000);
  return { access_token: sign({ sub: id, email, role: "authenticated", aud: "authenticated", aal: "aal1", amr: [{ method: "password", timestamp: now }], exp: now + 3600, iat: now, session_id: crypto.randomUUID() }), token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: id + "." + email, user: userObj(id, email) }; };
const userFrom = (req) => { try { const p = JSON.parse(Buffer.from((req.headers.authorization || "").split(" ")[1].split(".")[1], "base64url")); return p.sub ? { id: p.sub, email: p.email } : null; } catch { return null; } };
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
const ensureDbUser = (email) => { let id = psql(`select id from auth.users where email=${lit(email)}`); if (!id) { id = crypto.randomUUID(); psql(`insert into auth.users values ('${id}',${lit(email)})`); } return id; };
const PATH_RE = /^[0-9a-f-]{36}\/(ph|vp|pf)\/[A-Za-z0-9_-]{1,64}\.(jpg|pdf)$/;
http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
  const url = new URL(req.url, "http://x"); const P = url.pathname;
  const send = (s, o) => { res.writeHead(s, { ...cors, "content-type": "application/json" }); res.end(o === undefined ? "" : JSON.stringify(o)); };
  try {
  if (P.startsWith("/rest/v1")) {
    const headers = { ...req.headers }; delete headers.host; delete headers["content-length"];
    const r = await fetch(PGRST + P.slice(8) + url.search, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
    const out = Buffer.from(await r.arrayBuffer()); const h = { ...cors }; r.headers.forEach((v, k) => { if (!["content-encoding", "transfer-encoding", "content-length"].includes(k)) h[k] = v; });
    res.writeHead(r.status, h); return res.end(out);
  }
  if (P.startsWith("/storage/v1/object")) {
    const u = userFrom(req); if (!u) return send(401, { message: "Unauthorized" });
    let m;
    if (req.method === "POST" && (m = /^\/storage\/v1\/object\/list\/wedding-files$/.exec(P))) {
      const j = JSON.parse(body); const rows = asUser(u, `select name from storage.objects where bucket_id='wedding-files' and name like ${lit(j.prefix + "/%")}`);
      return send(200, rows ? rows.split("\n").map((n) => ({ name: n.split("/").pop(), id: n })) : []);
    }
    if (req.method === "DELETE" && P === "/storage/v1/object/wedding-files") {
      const j = JSON.parse(body); const done = [];
      for (const p of j.prefixes || []) { if (!PATH_RE.test(p)) continue; const n = asUser(u, `with d as (delete from storage.objects where bucket_id='wedding-files' and name=${lit(p)} returning 1) select count(*) from d`); if (n === "1") { fs.rmSync(FILES + "/" + p.replace(/\//g, "_"), { force: true }); done.push({ name: p }); } }
      return send(200, done);
    }
    if ((m = /^\/storage\/v1\/object\/(?:authenticated\/)?wedding-files\/(.+)$/.exec(P))) {
      const p = decodeURIComponent(m[1]); if (!PATH_RE.test(p)) return send(400, { message: "invalid path" });
      if (req.method === "GET") { const ok = asUser(u, `select count(*) from storage.objects where bucket_id='wedding-files' and name=${lit(p)}`); if (ok !== "1") return send(404, { message: "Object not found" });
        res.writeHead(200, { ...cors, "content-type": p.endsWith(".pdf") ? "application/pdf" : "image/jpeg" }); return res.end(fs.readFileSync(FILES + "/" + p.replace(/\//g, "_"))); }
      if (req.method === "POST" || req.method === "PUT") {
        if (body.length > 12582912) return send(413, { message: "Payload too large" });
        try { asUser(u, `insert into storage.objects (bucket_id,name,owner) values ('wedding-files',${lit(p)},'${u.id}')`); } catch { return send(403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" }); }
        fs.writeFileSync(FILES + "/" + p.replace(/\//g, "_"), body); return send(200, { Key: "wedding-files/" + p, Id: crypto.randomUUID() });
      }
    }
    return send(404, { message: "not found" });
  }
  const j = body.length && /json/.test(req.headers["content-type"] || "") ? JSON.parse(body) : {};
  if (P === "/auth/v1/signup") { const e = String(j.email).toLowerCase(); if (!users.has(e)) users.set(e, { pw: hash(j.password), confirmed: false }); return send(200, { id: crypto.randomUUID(), email: e, identities: [] }); }
  if (P === "/auth/v1/resend" || P === "/auth/v1/recover" || P === "/auth/v1/otp") return send(200, {});
  if (P === "/auth/v1/verify") {
    if (j.token !== "123456") return send(403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" });
    const e = String(j.email).toLowerCase(), rec = users.get(e) || { pw: "", confirmed: false }; rec.confirmed = true; users.set(e, rec);
    return send(200, session(ensureDbUser(e), e));
  }
  if (P === "/auth/v1/token") {
    const gt = url.searchParams.get("grant_type");
    if (gt === "password") { const e = String(j.email).toLowerCase(), rec = users.get(e);
      if (!rec || rec.pw !== hash(j.password)) return send(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      if (!rec.confirmed) return send(400, { code: 400, error_code: "email_not_confirmed", msg: "Email not confirmed" });
      return send(200, session(ensureDbUser(e), e)); }
    const [id, email] = String(j.refresh_token).split(/\.(.+)/); return send(200, session(id, email));
  }
  if (P === "/auth/v1/user") { const u = userFrom(req); if (!u) return send(401, { msg: "no" });
    if (req.method === "PUT") { const rec = users.get(u.email) || { confirmed: true }; if (j.password) rec.pw = hash(j.password); users.set(u.email, rec); }
    return send(200, userObj(u.id, u.email)); }
  if (P === "/auth/v1/logout") { res.writeHead(204, cors); return res.end(); }
  if (P === "/functions/v1/delete-account") { const u = userFrom(req); if (!u) return send(401, {});
    const ids = asUser(u, "select * from public.prepare_account_deletion()");
    for (const w of ids ? ids.split("\n") : []) for (const f of fs.readdirSync(FILES)) if (f.startsWith(w)) fs.rmSync(FILES + "/" + f);
    psql(`delete from storage.objects where split_part(name,'/',1) in (select unnest(string_to_array(${lit(ids)}, E'\\n')))`);
    psql(`delete from auth.users where id='${u.id}'`); users.delete(u.email); return send(200, { ok: true }); }
  send(404, { msg: "not found " + P });
  } catch (e) { console.error(e); send(500, { message: String(e.message || e) }); }
}).listen(+(process.env.GW_PORT || 54321), () => console.log("gateway ready"));
