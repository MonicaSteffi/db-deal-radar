# Sparpreis Radar

Installable web app that shows the cheapest Deutsche Bahn Sparpreise from a starting station, sorted from lowest price, and sends weekly price alerts for saved destinations via [ntfy](https://ntfy.sh).

- **web/** – the app (plain HTML/CSS/JS, no build step). Hosted free on GitHub Pages. Installable on Android and iPhone from the browser.
- **worker/** – small backend on Cloudflare Workers (free tier). Looks up prices on bahn.de, caches them, stores alerts, and sends ntfy messages every Saturday and Sunday.

Not affiliated with Deutsche Bahn. Prices come from bahn.de's unofficial web API (the same one bahn.de's own page uses). See "Before going public" below.

## Setup (about 20 minutes, all free)

### 1. Put the code on GitHub
1. Create a new repository called `db-deal-radar` at https://github.com/new (account `Monicasteffi`, public).
2. Upload the contents of this folder, including the hidden `.github` folder. Easiest with git:
   ```bash
   cd db-deal-radar
   git init -b main && git add . && git commit -m "First version"
   git remote add origin https://github.com/MonicaSteffi/db-deal-radar.git
   git push -u origin main
   ```

### 2. Backend on Cloudflare
1. Sign up at https://dash.cloudflare.com (free plan).
2. **Workers KV → Create**, name it `sparpreis-alerts`, and put its ID into `worker/wrangler.toml` (done for this repo).
3. **Workers & Pages → Create → Import a repository**, pick this repo, set **Root directory** to `worker`, and deploy.
   Cloudflare then redeploys the backend on every push to `main`. No API token needed.
4. Check it: `<worker-url>/api/stations?q=Freising` should return JSON.

### 3. App on GitHub Pages
1. Put the worker URL into `web/config.js`.
   Fill in the placeholders in square brackets in `web/impressum.html` and `web/datenschutz.html` (address, email, phone, date). The Impressum must show a postal address where you can receive mail.
2. GitHub: **Settings → Pages → Source: GitHub Actions**.
3. Push. The app goes live at **https://monicasteffi.github.io/db-deal-radar/**.

### 4. Install on a phone
- **Android (Chrome):** open the link and tap "App installieren" (or menu → *Install app*).
- **iPhone (Safari):** Share → *Add to Home Screen*.

## How it works
- **Deals:** for the chosen station and day, the worker checks up to 70 major German stations (nearest first, 20 per request) using bahn.de's day best-price search. Results are cached for 3 hours, so repeat visits don't hit bahn.de again.
- **Saved destinations:** show Monday–Sunday of the coming week, lowest day highlighted.
- **Alerts:** each phone gets a random ntfy channel name. Saving a destination with alerts on sends the current best price right away. Then every Saturday/Sunday (hourly batches, `crons` in `wrangler.toml`) each alert gets the lowest price for the following week, matching the Super Sparpreis Last Minute booking window.
- Prices: one-way, 2nd class, 1 adult, no BahnCard.

## Free-tier limits to know
| Resource | Free limit | Used by |
|---|---|---|
| Worker requests | 100,000/day | every app call |
| KV writes | 1,000/day | cache entries + alerts (cache silently stops when reached) |
| Subrequests | 50 per request | max ~22 per deals page, 8 per week view |
| Cron | 30 runs/weekend × 5 alerts | ~150 alerts/week. Raise `ALERTS_PER_CRON` or run more often if you need more |

When the app grows, the Workers Paid plan ($5/month) lifts all of these.

## Before going public
- bahn.de has no official public price API. This app uses the internal endpoint bahn.de's own website calls. DB can block it or change it without notice, and heavy traffic from a public app makes that more likely. The caching keeps traffic low, but it can't remove the risk.
- If DB blocks requests coming from Cloudflare, `/api/deals` returns errors. That is the first thing to check if prices stop loading.
- Before charging money, ask DB for permission or a data partnership (DB's API Marketplace / Vertrieb). Running a paid product on an unofficial endpoint can lead to a cease-and-desist.
- Don't use the DB logo, DB red or "DB" in the app name.
- If you add accounts or analytics later, you'll need an Impressum and Datenschutzerklärung (German law requires them for public websites).

## Develop locally
```bash
cd worker
npm test                 # runs the backend tests (no network needed)
npx wrangler dev         # runs the worker locally
```
Serve `web/` with any static server and point `web/config.js` at the local worker.
