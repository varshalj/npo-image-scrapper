// Server-side proxy to the Cloud Run scraper webhook.
// When Cloud Run is not yet deployed, returns a friendly error that the UI surfaces.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { nonprofit_name, npo_url } = req.body || {};
  if (!nonprofit_name || !npo_url) {
    return res.status(400).json({ error: "Missing nonprofit_name or npo_url" });
  }

  const webhookUrl = process.env.SCRAPER_WEBHOOK;
  const token = process.env.SCRAPER_TOKEN;

  if (!webhookUrl || webhookUrl === "CLOUD_RUN_URL_PENDING") {
    return res.status(503).json({
      error: "Scraper not deployed yet — add SCRAPER_WEBHOOK in Vercel env vars",
      pending: true,
    });
  }

  try {
    const scrapeRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonprofit_name, npo_url, token }),
    });
    const data = await scrapeRes.json().catch(() => ({}));
    if (!scrapeRes.ok) {
      return res.status(502).json({ error: data.error || `Scraper returned ${scrapeRes.status}` });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to reach Cloud Run" });
  }
}
