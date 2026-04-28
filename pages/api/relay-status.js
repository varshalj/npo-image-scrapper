// UI polls GET /api/relay-status?npo_url=... every 5 seconds after triggering Relay.
// Returns { done: false } until the callback arrives, then { done: true, ...data }

const store = global._relayResultStore || (global._relayResultStore = new Map());

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const npo_url = (req.query.npo_url || "").trim();
  if (!npo_url) {
    return res.status(400).json({ error: "npo_url is required" });
  }

  const result = store.get(npo_url);
  if (!result) {
    return res.status(200).json({ done: false });
  }

  // Clean up after reading so stale results don't persist
  store.delete(npo_url);
  return res.status(200).json({ done: true, ...result });
}
