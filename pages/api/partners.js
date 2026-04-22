// Returns the list of NPO partners.
// Phase 1: Reads from embedded JSON file.
// Phase 2 (when Goody MCP exposes partners): Replace with an MCP call here.
//         The React UI does not change — it just fetches /api/partners.

import npos from "../../lib/npos.json";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.status(200).json({ partners: npos });
}
