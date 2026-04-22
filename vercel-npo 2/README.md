# Goodera NPO Media Processor

Internal tool for triggering the image scraper and Relay social-handle discovery workflow per NPO partner.

## What this does

1. Search a partner from the embedded list (2,170 NPOs from Goodera)
2. If the partner has no website URL, prompt the user to enter one
3. Click "Process NPO" — fires two webhooks in parallel:
   - **Cloud Run** → scrapes the NPO's website for images, uploads to Drive, updates the Sheet
   - **Relay.app** → discovers LinkedIn/Instagram/X/Facebook/YouTube handles, writes them to the Sheet

## Why a Next.js app (not a Claude artifact)

Claude artifacts have a strict network sandbox — `fetch()` can only call `api.anthropic.com`. This app runs Next.js API routes server-side on Vercel, which proxy to Relay and Cloud Run without CORS or sandbox restrictions.

## Local development

```bash
npm install
cp .env.example .env.local   # then edit .env.local with real values
npm run dev
```

Opens at http://localhost:3000

## Deployment to Vercel

### Option A: Via Vercel CLI (fastest)

```bash
npm install -g vercel
vercel login
vercel           # answers "yes" to all prompts, project gets deployed
```

Then set environment variables:
```bash
vercel env add RELAY_WEBHOOK production
# paste: https://hook.relay.app/api/v1/playbook/cmo8rdft005vb0qktd0u52jhp/trigger/VSF1dF_mbof7VsUMXqnVmg

vercel env add RELAY_TOKEN production
# paste: z1ykOiY4JLMlnc

vercel env add SCRAPER_WEBHOOK production
# paste your Cloud Run URL, or CLOUD_RUN_URL_PENDING for now

vercel env add SCRAPER_TOKEN production
# paste your scraper token, or any placeholder for now
```

Redeploy to pick up env vars:
```bash
vercel --prod
```

### Option B: Via GitHub + Vercel Dashboard

1. Push this folder to a new GitHub repo
2. Go to vercel.com → "New Project" → import the repo
3. Add environment variables in the "Configure" step:
   - `RELAY_WEBHOOK`
   - `RELAY_TOKEN`
   - `SCRAPER_WEBHOOK` (can leave as `CLOUD_RUN_URL_PENDING` for now)
   - `SCRAPER_TOKEN`
4. Click "Deploy"

Vercel gives you a URL like `goodera-npo-processor.vercel.app`. Share with your team.

## After Cloud Run is deployed

1. Go to Vercel dashboard → your project → Settings → Environment Variables
2. Update `SCRAPER_WEBHOOK` to the Cloud Run URL
3. Redeploy (or click "Redeploy" in the Deployments tab)

No code changes needed.

## When Goody MCP exposes partner endpoints

Edit `pages/api/partners.js`. Replace the `import` with an MCP call:

```js
// Before
import npos from "../../lib/npos.json";
export default function handler(req, res) {
  res.status(200).json({ partners: npos });
}

// After
export default async function handler(req, res) {
  const partners = await fetchFromGoodyMCP({
    endpoint: "listing-partners",
    token: process.env.GOODY_MCP_TOKEN,
  });
  res.status(200).json({ partners });
}
```

The React UI does not change — it keeps fetching `/api/partners`.

## Project structure

```
goodera-npo-processor/
├── pages/
│   ├── _app.js            # Next.js app wrapper
│   ├── index.js           # Main UI (NPO picker + process button)
│   └── api/
│       ├── partners.js    # GET /api/partners → NPO list (JSON or MCP)
│       ├── relay.js       # POST /api/relay → triggers Relay webhook
│       └── scrape.js      # POST /api/scrape → triggers Cloud Run
├── lib/
│   └── npos.json          # 2,170 NPO partners (embedded, swap for MCP later)
├── styles/
│   └── globals.css        # Dark theme, typography
├── .env.example           # Template for env vars
├── .gitignore
├── next.config.js
├── package.json
└── README.md
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RELAY_WEBHOOK` | Yes | Relay.app workflow trigger URL |
| `RELAY_TOKEN` | Yes | Token passed as a query param to Relay |
| `SCRAPER_WEBHOOK` | Yes (once deployed) | Cloud Run URL |
| `SCRAPER_TOKEN` | Yes (once deployed) | Token passed in scraper request body |
