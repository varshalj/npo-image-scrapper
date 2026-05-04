// Server-side proxy to Relay.app webhook.
// Called by the browser client, runs on Vercel, calls Relay — no CORS issues.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { nonprofit_name, npo_url } = req.body || {};
  if (!nonprofit_name || !npo_url) {
    return res.status(400).json({ error: "Missing nonprofit_name or npo_url" });
  }

  const webhookUrl = process.env.RELAY_WEBHOOK;
  const token = process.env.RELAY_TOKEN;

  if (!webhookUrl || !token) {
    return res.status(500).json({ error: "Relay webhook not configured on server" });
  }

  // Build GET URL with query params (matches the Relay workflow trigger)
  const params = new URLSearchParams({ nonprofit_name, npo_url, token });
  const triggerUrl = `${webhookUrl}?${params.toString()}`;

  try {
    const relayRes = await fetch(triggerUrl, { method: "GET" });
    if (!relayRes.ok) {
      const text = await relayRes.text().catch(() => "");
      return res.status(502).json({ error: `Relay returned ${relayRes.status}`, body: text });
    }
    const data = await relayRes.json().catch(() => ({}));
    return res.status(200).json({
      status: "triggered",
      runId: data.runId,
      runLink: data.runLink,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to reach Relay" });
  }
}
