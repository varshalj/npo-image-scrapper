// Relay.app POSTs here when the social handles workflow completes.
// Status values from Relay:
//   invalid_token     — bad token, workflow didn't run
//   skipped_duplicate — NPO was already enriched, skipped
//   no_facebook       — no Facebook found, but other handles may exist
//   no_photos         — Facebook found but no photos, all handles present
//   completed         — full success, all handles + folder_link present

const store = global._relayResultStore || (global._relayResultStore = new Map());

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const data = req.body || {};
  const npo_url = (data.npo_url || "").trim();

  if (!npo_url) {
    return res.status(400).json({ error: "npo_url is required" });
  }

  store.set(npo_url, {
    ...data,
    status: data.status || "completed",
    completed_at: new Date().toISOString(),
  });

  console.log(`[relay-callback] ${data.status} for ${npo_url}`);
  return res.status(200).json({ ok: true });
}
