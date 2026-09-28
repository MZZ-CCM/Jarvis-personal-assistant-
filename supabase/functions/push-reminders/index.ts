// push-reminders — sends reminder notifications to people's devices, even when
// Jarvis is closed. Called once a minute by pg_cron (see migrations).
//
//   GET  …/push-reminders/vapid   → { publicKey } for browsers to subscribe (public)
//   POST …/push-reminders         → send everything that's due (requires x-cron-secret)
//
// VAPID signing keys are generated on first use and stored in private.push_config;
// only the public half ever leaves the database.

import * as webpush from "jsr:@negrel/webpush@0.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-cron-secret, apikey, authorization",
};

// deno-lint-ignore no-explicit-any
type Config = { vapid: any; public_key: string | null; cron_secret: string };

let appServer: webpush.ApplicationServer | null = null;
let publicKey: string | null = null;

async function loadConfig(): Promise<Config> {
  const { data, error } = await admin.rpc("push_config_get");
  if (error || !data?.[0]) throw new Error(`config: ${error?.message ?? "missing"}`);
  return data[0] as Config;
}

/** Imports (or creates, the first time) the VAPID keys and the application server. */
async function ensureServer(cfg: Config) {
  if (appServer && publicKey) return;
  let exported = cfg.vapid;
  if (!exported) {
    const keys = await webpush.generateVapidKeys({ extractable: true });
    const jwks = await webpush.exportVapidKeys(keys);
    const pub = await webpush.exportApplicationServerKey(keys);
    const { data, error } = await admin.rpc("push_config_set_vapid", { p_vapid: jwks, p_public_key: pub });
    if (error) throw new Error(`save keys: ${error.message}`);
    exported = data[0].vapid; // another instance may have won the race — use what's stored
  }
  const keys = await webpush.importVapidKeys(exported!, { extractable: false });
  publicKey = await webpush.exportApplicationServerKey(keys);
  appServer = await webpush.ApplicationServer.new({ contactInformation: "mailto:jarvis-push@example.com", vapidKeys: keys });
}

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sendDue() {
  const { data: due, error } = await admin.rpc("claim_due_pushes");
  if (error) throw new Error(`claim: ${error.message}`);
  if (!due?.length) return { reminders: 0, sent: 0, removed: 0 };

  const userIds = [...new Set(due.map((r: { user_id: string }) => r.user_id))];
  const { data: subs, error: subErr } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
  if (subErr) throw new Error(`subs: ${subErr.message}`);

  let sent = 0;
  const gone = new Set<string>();
  const used = new Set<string>();

  await Promise.all(due.flatMap((r: { id: string; user_id: string; title: string; notes: string; time: string | null }) =>
    (subs ?? []).filter((s) => s.user_id === r.user_id).map(async (s) => {
      const payload = JSON.stringify({
        title: r.title,
        body: r.notes || (r.time ? `Due at ${r.time}` : "Due today"),
        tag: r.id,
        data: { id: r.id },
      });
      try {
        await appServer!.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(payload, { urgency: webpush.Urgency.High, ttl: 6 * 3600, topic: r.id.replace(/-/g, "") });
        sent++;
        used.add(s.id);
      } catch (e) {
        const status = (e as { response?: Response }).response?.status;
        if (e instanceof webpush.PushMessageError && (e.isGone() || status === 404)) gone.add(s.id);
        else console.error("push failed", status ?? "", String(e));
      }
    })));

  if (gone.size) await admin.from("push_subscriptions").delete().in("id", [...gone]);
  if (used.size) await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", [...used]);
  return { reminders: due.length, sent, removed: gone.size };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  try {
    const cfg = await loadConfig();
    await ensureServer(cfg);

    if (req.method === "GET" && url.pathname.endsWith("/vapid")) {
      return Response.json({ publicKey }, { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
    }

    if (req.method === "POST") {
      if (!safeEqual(req.headers.get("x-cron-secret") ?? "", cfg.cron_secret)) {
        return new Response("Forbidden", { status: 403, headers: CORS });
      }
      return Response.json(await sendDue(), { headers: CORS });
    }
    return new Response("Not found", { status: 404, headers: CORS });
  } catch (e) {
    console.error(String(e));
    return new Response("Server error", { status: 500, headers: CORS });
  }
});
