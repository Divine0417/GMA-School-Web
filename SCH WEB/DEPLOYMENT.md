# Deployment Guide

Three separate deployments, one shared MongoDB Atlas database. Nothing is deployed yet — this doc is the checklist for when you're ready to go live. `netlify.toml` (in `frontend/` and `admin-frontend/`) and `render.yaml` (in `backend/`) are already in place so each step below is mostly "connect the repo and fill in env vars."

## 1. Database — MongoDB Atlas

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a database user (username/password) and note the connection string.
3. Under Network Access, allow access from anywhere (`0.0.0.0/0`) — Render/Railway use dynamic IPs, so IP allowlisting isn't practical here.
4. Copy the connection string — this becomes `MONGODB_URI`.

## 2. Backend — Render (or Railway)

`backend/render.yaml` describes the service already; on Render, "New > Blueprint" and pointing it at this repo will pick it up automatically. On Railway, skip the blueprint and just point a new project at the repo with root directory `backend/` — it auto-detects Node from `package.json` (`npm install` / `npm start`).

Required env vars (see `backend/.env.example` for the full annotated list):

| Variable | Where to get it |
|---|---|
| `MONGODB_URI` | Step 1 above |
| `JWT_SECRET` | Any long random string — generate with `openssl rand -base64 48` |
| `JWT_EXPIRE` | `7d` |
| `RESEND_API_KEY` | resend.com/api-keys |
| `SENDCHAMP_API_KEY` + `SENDCHAMP_SENDER_NAME` | sendchamp.com — sender name must be approved in the Sendchamp dashboard before SMS actually delivers |
| `PAYSTACK_SECRET_KEY` + `PAYSTACK_PUBLIC_KEY` | dashboard.paystack.com/#/settings/developer |
| `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` | cloudinary.com console |
| `FRONTEND_URL` | The deployed public site URL (step 3) — used to build links in emails, e.g. password reset |
| `NODE_ENV` | `production` |

After deploying, note the backend's public URL (e.g. `https://gma-backend.onrender.com`) — both frontends need it as `VITE_API_BASE_URL=<that-url>/api`.

Render's free tier spins down on inactivity (cold start delay on the first request after idling) — fine for a first deploy, worth upgrading before real admissions traffic.

## 3. Public site + student portal — Netlify

1. New site from Git, point it at this repo with **base directory** `frontend/`.
2. Build command and publish directory are already set via `frontend/netlify.toml` (`npm run build`, `dist`).
3. Set env var `VITE_API_BASE_URL` to the backend URL + `/api` (e.g. `https://gma-backend.onrender.com/api`).
4. Deploy. Netlify gives a `*.netlify.app` URL immediately — a custom domain (`gmaschool.edu.ng` or similar) can be attached later without redeploying anything.
5. Go back to the backend and set `FRONTEND_URL` to whatever this site's final URL is (needed for correct links in password-reset emails).

## 4. Admin console — Netlify (separate site)

Same as step 3, but base directory `admin-frontend/` and its own `VITE_API_BASE_URL` pointing at the same backend. This is intentionally a second, separate Netlify site — the whole point of splitting `admin-frontend/` out earlier was so it can live on its own subdomain (e.g. `admin.gmaschool.edu.ng`) once a domain exists, without being a route inside the public site.

## Suggested order

Database → Backend → Public site → Admin console. Each later step needs the URL from the one before it, so doing them in this order avoids having to circle back and update env vars twice.

## After first deploy

- Confirm a custom domain in Resend (currently sandboxed to one address) so transactional email works for real recipients.
- Confirm the `SENDCHAMP_SENDER_NAME` is approved in the Sendchamp dashboard so SMS credentials actually send.
- Point a real domain at both Netlify sites once purchased; a subdomain for the admin console is free with any domain registrar, no second purchase needed.
- Go through the Go-Live Checklist in `GMA_School_Website_Plan.md` (SSL is automatic via Netlify/Render once a custom domain is attached; the rest — Paystack test-mode payments, CBT, analytics — still need doing).
