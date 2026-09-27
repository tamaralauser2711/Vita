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

// Supabase prüft die Signatur des Tokens bereits. Hier stellen wir nur sicher,
// dass es ein angemeldeter Nutzer ist und nicht bloß der öffentliche Schlüssel.
function role(req: Request): string | null {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part)).role ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);
  if (role(req) !== "authenticated") return json({ error: "Bitte in der App anmelden." }, 401);

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
