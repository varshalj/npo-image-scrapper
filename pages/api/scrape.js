// Fire-and-forget proxy to the Cloud Run scraper.
// Long scrapes (10+ minutes) exceed both Vercel's function timeout and the
// browser's HTTP timeout, so we kick off the request and return immediately.
// The scraper writes its final result to the Google Sheet directly.

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

  // Fire the request but don't await full completion — long scrapes exceed
  // Vercel's function timeout. The scraper writes to the Sheet on its own.
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nonprofit_name, npo_url, token }),
  }).catch(err => {
    console.error("[scrape] Cloud Run request error:", err.message);
  });

  return res.status(202).json({
    status: "running",
    message: "Scraper started. Results will appear in the Google Sheet when complete.",
  });
}
