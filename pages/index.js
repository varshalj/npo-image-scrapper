import { useState, useMemo, useRef, useEffect } from "react";

// Status enum for both webhook calls
const S = { IDLE: "idle", RUNNING: "running", QUEUED: "queued", DONE: "done", WARN: "warn", ERROR: "error" };

// How long to poll for Relay completion before giving up
const RELAY_POLL_TIMEOUT = 3 * 60 * 1000; // 3 minutes
const RELAY_POLL_INTERVAL = 5000;          // every 5 seconds

export default function Home() {
  const [partners, setPartners] = useState([]);
  const [partnersLoaded, setPartnersLoaded] = useState(false);
  const [partnersError, setPartnersError] = useState(null);

  const [query, setQuery] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const [selected, setSelected] = useState(null);
  const [urlOverride, setUrlOverride] = useState("");

  const [scraperStatus, setScraperStatus] = useState(S.IDLE);
  const [relayStatus, setRelayStatus] = useState(S.IDLE);
  const [scraperResult, setScraperResult] = useState(null);
  const [relayResult, setRelayResult] = useState(null);

  const inputRef = useRef(null);
  const relayPollRef = useRef(null); // holds the polling interval so we can clear it

  // Load partners from our own API route (easy to swap for MCP later)
  useEffect(() => {
    fetch("/api/partners")
      .then(r => r.json())
      .then(data => {
        setPartners(data.partners || []);
        setPartnersLoaded(true);
      })
      .catch(err => {
        setPartnersError(err.message);
        setPartnersLoaded(true);
      });
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return partners.slice(0, 8);
    const q = query.toLowerCase();
    return partners
      .filter(n => n.name.toLowerCase().includes(q) || (n.url && n.url.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [query, partners]);

  // ─── Determine "mode" ──────────────────────────────────────────────────
  // - matched:  user picked an existing partner from the dropdown
  // - manual:   user typed something not in the list (no dropdown matches)
  //             → treat the query as the NPO name, require URL input
  // - empty:    input is blank → nothing to do
  const trimmedQuery = query.trim();
  const hasMatch = filtered.length > 0;
  // Manual mode: user has typed 3+ chars and there are zero matches in the partner list.
  // This makes the URL field appear immediately so they can type a URL without needing
  // to click away first.
  const isManual = !selected && trimmedQuery.length >= 3 && !hasMatch;

  const npoName = selected ? selected.name : (isManual ? trimmedQuery : "");
  // urlOverride is always the source of truth — pre-filled from DB on select,
  // empty for manual entries until the user types one.
  const activeUrl = urlOverride.trim();

  // URL input is shown whenever an NPO name exists (matched or manual)
  const canProcess = npoName && activeUrl
    && scraperStatus !== S.RUNNING && relayStatus !== S.RUNNING;

  function selectNPO(npo) {
    setSelected(npo);
    setQuery(npo.name);
    setShowDrop(false);
    setUrlOverride(npo.url || "");  // pre-fill so user can see + edit the DB value
    setScraperStatus(S.IDLE);
    setRelayStatus(S.IDLE);
    setScraperResult(null);
    setRelayResult(null);
  }

  async function handleProcess() {
    if (!canProcess) return;
    const body = { nonprofit_name: npoName, npo_url: activeUrl };

    setScraperStatus(S.RUNNING);
    setRelayStatus(S.RUNNING);
    setScraperResult(null);
    setRelayResult(null);

    // Both calls go to our own API routes, which proxy to the real services server-side
    const scraperPromise = fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      return data;
    });

    const relayPromise = fetch("/api/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      return data;
    });

    scraperPromise
      .then(data => { setScraperStatus(S.DONE); setScraperResult(data); })
      .catch(e => { setScraperStatus(S.ERROR); setScraperResult({ error: e.message }); });

    // When Relay trigger succeeds, switch to QUEUED and start polling
    relayPromise
      .then(() => {
        setRelayStatus(S.QUEUED);
        const startedAt = Date.now();

        relayPollRef.current = setInterval(async () => {
          // Give up after timeout
          if (Date.now() - startedAt > RELAY_POLL_TIMEOUT) {
            clearInterval(relayPollRef.current);
            setRelayStatus(S.ERROR);
            setRelayResult({ error: "Timed out waiting for Relay to complete" });
            return;
          }
          try {
            const r = await fetch(`/api/relay-status?npo_url=${encodeURIComponent(activeUrl)}`);
            const data = await r.json();
            if (data.done) {
              clearInterval(relayPollRef.current);
              // Map Relay status to UI state
              const errorStatuses = ["invalid_token"];
              const warnStatuses  = ["skipped_duplicate"];
              const s = data.status || "completed";
              if (errorStatuses.includes(s))     setRelayStatus(S.ERROR);
              else if (warnStatuses.includes(s)) setRelayStatus(S.WARN);
              else                               setRelayStatus(S.DONE);
              setRelayResult(data);
            }
            // if data.done === false, keep polling
          } catch (e) {
            // network hiccup — keep polling, don't abort
          }
        }, RELAY_POLL_INTERVAL);
      })
      .catch(e => { setRelayStatus(S.ERROR); setRelayResult({ error: e.message }); });
  }

  // Clean up polling interval when component unmounts
  useEffect(() => () => clearInterval(relayPollRef.current), []);

  const statusIcon = s =>
    s === S.IDLE    ? "—"  :
    s === S.RUNNING ? "⏳" :
    s === S.QUEUED  ? "⏳" :
    s === S.DONE    ? "✅" :
    s === S.WARN    ? "⚠️" : "❌";
  const statusColor = s =>
    s === S.RUNNING ? "#a78bfa" :
    s === S.QUEUED  ? "#f59e0b" :
    s === S.DONE    ? "#34d399" :
    s === S.WARN    ? "#f59e0b" :
    s === S.ERROR   ? "#f87171" : "#6b7280";

  return (
    <div style={{
      minHeight: "100vh", background: "#0f0f13",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px"
    }}>
      <div style={{ width: "100%", maxWidth: 480 }}>

        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontSize: 13, letterSpacing: "0.12em", color: "#6b7280", textTransform: "uppercase", marginBottom: 8 }}>
            Goodera
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#f4f4f5", letterSpacing: "-0.02em" }}>
            NPO Media Processor
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6b7280" }}>
            Scrape website images &amp; discover social handles
          </p>
        </div>

        {/* NPO Picker */}
        <div style={{ marginBottom: 16, position: "relative" }}>
          <label style={{ display: "block", fontSize: 12, color: "#9ca3af", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Partner / NPO
          </label>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setShowDrop(true); if (!e.target.value) setSelected(null); }}
            onFocus={() => setShowDrop(true)}
            onBlur={() => setTimeout(() => setShowDrop(false), 150)}
            placeholder={partnersLoaded ? `Search ${partners.length} partners…` : "Loading partners…"}
            disabled={!partnersLoaded}
            style={{
              width: "100%", background: "#1c1c23", border: "1px solid #2d2d38",
              borderRadius: 10, padding: "12px 14px",
              color: "#f4f4f5", fontSize: 15, outline: "none",
              transition: "border-color 0.15s",
            }}
          />
          {partnersError && (
            <div style={{ marginTop: 6, fontSize: 12, color: "#f87171" }}>
              Failed to load partners: {partnersError}
            </div>
          )}
          {showDrop && filtered.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
              background: "#1c1c23", border: "1px solid #2d2d38", borderRadius: 10,
              marginTop: 4, overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
            }}>
              {filtered.map(npo => (
                <div
                  key={npo.id}
                  onMouseDown={() => selectNPO(npo)}
                  style={{
                    padding: "10px 14px", cursor: "pointer",
                    borderBottom: "1px solid #2d2d38",
                  }}
                  onMouseOver={e => e.currentTarget.style.background = "#252530"}
                  onMouseOut={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ fontSize: 14, color: "#f4f4f5", fontWeight: 500 }}>{npo.name}</div>
                  {npo.url && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {npo.url}
                    </div>
                  )}
                  {!npo.url && (
                    <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 2 }}>No website URL</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* URL field — always shown once an NPO is selected or typed.
            Pre-filled from DB, editable, with open-in-tab link to verify. */}
        {npoName && (
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: "block", fontSize: 12, marginBottom: 6,
              letterSpacing: "0.06em", textTransform: "uppercase",
              color: !activeUrl ? "#f59e0b" : "#9ca3af"
            }}>
              {!activeUrl
                ? "⚠ Website URL — required to continue"
                : isManual
                  ? "Website URL"
                  : "Website URL — verify or edit before processing"}
            </label>
            <div style={{ position: "relative" }}>
              <input
                value={urlOverride}
                onChange={e => setUrlOverride(e.target.value)}
                placeholder="https://example.org"
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "#1c1c23",
                  border: `1px solid ${!activeUrl ? "#f59e0b" : "#2d2d38"}`,
                  borderRadius: 10, padding: "12px 44px 12px 14px",
                  color: "#f4f4f5", fontSize: 14, outline: "none",
                  fontFamily: "monospace",
                }}
              />
              {activeUrl && (
                <a
                  href={activeUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in new tab to verify"
                  style={{
                    position: "absolute", right: 12, top: "50%",
                    transform: "translateY(-50%)",
                    color: "#6b7280", fontSize: 16, lineHeight: 1,
                    textDecoration: "none", transition: "color 0.15s",
                  }}
                  onMouseOver={e => e.currentTarget.style.color = "#a78bfa"}
                  onMouseOut={e => e.currentTarget.style.color = "#6b7280"}
                >
                  ↗
                </a>
              )}
            </div>
          </div>
        )}

        {/* Process button */}
        <button
          onClick={handleProcess}
          disabled={!canProcess}
          style={{
            width: "100%", padding: "14px",
            background: canProcess ? "#7c3aed" : "#2d2d38",
            color: canProcess ? "#fff" : "#6b7280",
            border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600,
            cursor: canProcess ? "pointer" : "not-allowed",
            transition: "background 0.15s",
          }}
        >
          {scraperStatus === S.RUNNING || relayStatus === S.RUNNING ? "Processing…" : "Process NPO"}
        </button>

        {/* Status panel */}
        {(scraperStatus !== S.IDLE || relayStatus !== S.IDLE) && (
          <div style={{
            marginTop: 20, background: "#1c1c23", border: "1px solid #2d2d38",
            borderRadius: 10, overflow: "hidden"
          }}>
            {/* Scraper row */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #2d2d38" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f4f5" }}>🌐 Website Scraper</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Cloud Run</div>
                </div>
                <span style={{ fontSize: 18, color: statusColor(scraperStatus) }}>
                  {statusIcon(scraperStatus)}
                </span>
              </div>
              {scraperStatus === S.DONE && scraperResult && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>
                  {scraperResult.images_uploaded !== undefined && (
                    <div>📸 {scraperResult.images_uploaded} images uploaded</div>
                  )}
                  {scraperResult.folder_link && (
                    <a href={scraperResult.folder_link} target="_blank" rel="noreferrer"
                      style={{ color: "#a78bfa", textDecoration: "none", display: "block", marginTop: 4 }}>
                      📁 View Drive folder →
                    </a>
                  )}
                </div>
              )}
              {scraperStatus === S.ERROR && scraperResult && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#f87171" }}>
                  {scraperResult.error}
                </div>
              )}
            </div>

            {/* Relay row */}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#f4f4f5" }}>📱 Social Handles</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Relay.app workflow</div>
                </div>
                <span style={{ fontSize: 18, color: statusColor(relayStatus) }}>
                  {statusIcon(relayStatus)}
                </span>
              </div>

              {/* Queued — workflow triggered, waiting for completion callback */}
              {relayStatus === S.QUEUED && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#f59e0b" }}>
                  Workflow running — discovering social handles…
                </div>
              )}

              {/* Relay completed — show handles for done/no_facebook/no_photos */}
              {(relayStatus === S.DONE) && relayResult && (() => {
                const HANDLES = [
                  { key: "linkedin_url",  label: "LinkedIn",  icon: "💼" },
                  { key: "instagram_url", label: "Instagram", icon: "📷" },
                  { key: "facebook_url",  label: "Facebook",  icon: "👤" },
                  { key: "x_url",         label: "X",         icon: "𝕏"  },
                  { key: "youtube_url",   label: "YouTube",   icon: "▶️" },
                ];
                const found = HANDLES.filter(h => relayResult[h.key]);
                const s = relayResult.status;
                return (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
                    {s === "no_facebook" && (
                      <div style={{ color: "#f59e0b", marginBottom: 6 }}>
                        ⚠ No Facebook page found — other handles discovered below.
                      </div>
                    )}
                    {s === "no_photos" && (
                      <div style={{ color: "#f59e0b", marginBottom: 6 }}>
                        ⚠ Facebook found but no photos — all handles discovered below.
                      </div>
                    )}
                    {found.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {found.map(h => (
                          <a key={h.key} href={relayResult[h.key]} target="_blank" rel="noreferrer"
                            style={{ color: "#a78bfa", textDecoration: "none" }}>
                            {h.icon} {h.label} →
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div>No social handles found for this NPO.</div>
                    )}
                  </div>
                );
              })()}

              {/* Skipped duplicate — amber warning */}
              {relayStatus === S.WARN && relayResult && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#f59e0b" }}>
                  Already enriched — this NPO's social handles are up to date in the Sheet.
                </div>
              )}

              {/* Error — invalid token or other failure */}
              {relayStatus === S.ERROR && relayResult && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#f87171" }}>
                  {relayResult.status === "invalid_token"
                    ? "Invalid Relay token — check RELAY_TOKEN in Vercel env vars."
                    : (relayResult.error || "Relay workflow failed.")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer note */}
        <div style={{ marginTop: 16, fontSize: 11, color: "#374151", textAlign: "center" }}>
          Results written to Google Sheets &amp; Drive automatically
        </div>
      </div>
    </div>
  );
}
