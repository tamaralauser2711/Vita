// Supabase Edge Function "ai" für Vita.
// Leitet KI-Anfragen der App an Claude weiter. Der API-Schlüssel bleibt hier auf dem Server
// (Secret ANTHROPIC_API_KEY) und landet nie im Handy.

const MODELS: Record<string, string> = {
  quick: "claude-haiku-4-5-20251001", // schnelle Schätzungen, z.B. Kalorien
  default: "claude-sonnet-5",          // aufwendigere Aufgaben, z.B. Wochenpläne
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Prüft bei Supabase, ob die Anfrage von einem angemeldeten Nutzer (eurem Haushalts-Login) kommt.
async function isLoggedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const url = Deno.env.get("SUPABASE_URL");
  if (!auth || !url) return false;
  const r = await fetch(url + "/auth/v1/user", { headers: { Authorization: auth, apikey } });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  if (!(await isLoggedIn(req))) return json({ error: "Bitte in der App anmelden." }, 401);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ANTHROPIC_API_KEY ist nicht hinterlegt." }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }

  const prompt = String(body?.prompt ?? "").slice(0, 20000);
  if (!prompt) return json({ error: "Kein Text übergeben" }, 400);
  const tier = body?.tier === "default" ? "default" : "quick";
  const maxTokens = Math.min(Math.max(Number(body?.maxTokens) || 1024, 64), 8000);

  const content: any[] = [];
  if (body?.image && typeof body.image.data === "string") {
    content.push({ type: "image", source: { type: "base64", media_type: body.image.mediaType || "image/jpeg", data: body.image.data } });
  }
  content.push({ type: "text", text: prompt });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELS[tier], max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: data?.error?.message || "KI nicht erreichbar" }, 502);

  const text = (data.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  return json({ text });
});
