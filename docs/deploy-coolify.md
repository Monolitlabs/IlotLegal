# Deploying Ilot to Coolify (Hostinger VPS)

This is the exact runbook that matches the `Dockerfile` + `.dockerignore` +
`next.config.ts (output: 'standalone')` committed to this repo. Links below
point to the official Coolify docs that were used to design it.

> **Coolify concepts refresher.** A *Project* is the top-level folder,
> a *Resource* is an app / database / service, and an *Environment* (e.g.
> `production`) groups Resources inside a Project.
> Docs: <https://coolify.io/docs/get-started/concepts>

---

## 0. Prerequisites

- Coolify is already installed, TLS on `coolify.<your-domain>` works, and the
  `*.<your-domain>` wildcard DNS points to the VPS IP.
  (All of this is the Phase 0 work in `docs/next-steps.md`.)
- GitHub repository `Shahab-hsni/Ilot` is reachable either as a public repo
  or via Coolify's **GitHub App** / **Deploy Key** integration.
- A Sanity project exists and you have a read token
  (`SANITY_API_READ_TOKEN`) — the dataset is **private**, so anonymous
  fetches will 401.

---

## 1. Commit the Docker setup

The files that just landed in the repo:

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build: deps → build → runner. Emits the standalone Next.js server on port 3000 as user `nextjs`. |
| `.dockerignore` | Keeps `node_modules`, `.next`, `.env*`, `docs/`, `tests/`, `.claude/`, `.superpowers/` out of the build context. |
| `next.config.ts` | Adds `output: 'standalone'` — required for the Dockerfile to find `.next/standalone/server.js`. |

```bash
git add Dockerfile .dockerignore next.config.ts docs/deploy-coolify.md
git commit -m "chore(deploy): add Coolify Dockerfile + standalone output"
git push origin main
```

---

## 2. Coolify Application — General tab

You already started this. The screenshot showed `Build Pack = Dockerfile`,
which is correct. Verify the other fields:

| Field | Value |
|---|---|
| **Name** | `Ilot Legal Frontend` (spelling — yours had "Froontend") |
| **Build Pack** | `Dockerfile` |
| **Base Directory** | `/` |
| **Dockerfile Location** | `/Dockerfile` |
| **Docker Build Stage Target** | _(empty — the Dockerfile's last stage `runner` is the default)_ |
| **Custom Docker Options** | **LEAVE EMPTY**. The `--cap-add SYS_ADMIN --device=/dev/fuse …` text shown in the UI is **placeholder example text**, not a default. If you leave it there it will try to run the container with fuse devices and fail. |
| **Ports Exposes** | `3000` |
| **Port Mappings** | Leave empty unless you need host-port binding (Coolify's Traefik routes domain → container:3000 already) |
| **Pre/Post-deployment commands** | **LEAVE EMPTY**. `php artisan migrate` is a placeholder for Laravel apps. This project has no migrations to run. |

Docs: <https://coolify.io/docs/applications/build-packs/dockerfile>

---

## 3. Environment Variables tab

Coolify injects every variable here **both** as a runtime env var *and* as
a Docker build `ARG` — meaning `NEXT_PUBLIC_*` values are baked into the
client bundle at build time, which is what Next.js requires.

| Key | Value | Scope |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://ilot.id` (or your real prod URL) | Public build-time |
| `NEXT_PUBLIC_WA_NUMBER` | `62812XXXXXXX` (no `+`, no spaces) | Public build-time |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | from Sanity dashboard → API | Public build-time |
| `NEXT_PUBLIC_SANITY_DATASET` | `production` | Public build-time |
| `SANITY_API_READ_TOKEN` | viewer token from Sanity → API → Tokens | Server-only runtime |
| `SANITY_API_WRITE_TOKEN` | _(only needed if you'll run `pnpm import:sanity` from a container — otherwise skip)_ | Server-only runtime |

**Don't** tick "Is Build Variable?" off on the `NEXT_PUBLIC_*` ones — they
must be available during `next build`.

Docs: <https://coolify.io/docs/knowledge-base/environment-variables>

### 3a. Google Analytics in the Studio (optional)

The **Analytics** tab in `/studio` (`sanity-plugin-analytics`, GA4 only) reads
GA through `/api/analytics`. That route only answers logged-in Studio users —
it checks the caller's Sanity token against our private dataset. Without the
three vars below, the tab shows an error and the rest of the site is unaffected.

1. Google Cloud Console → pick/create a project → **APIs & Services → Library**
   → enable **Google Analytics Data API**.
2. **IAM & Admin → Service Accounts → Create**. No roles needed. Open it →
   **Keys → Add key → JSON** and download the file.
3. GA4 → **Admin → Property access management → +** → add the service
   account's `client_email` as **Viewer**.
4. GA4 → **Admin → Property details** → copy the numeric **Property ID**.

| Key | Value | Scope |
|---|---|---|
| `GA_PROPERTY_ID` | numeric property ID (e.g. `123456789`) | Server-only runtime |
| `GA_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key | Server-only runtime |
| `GA_PRIVATE_KEY` | `private_key` from the JSON key, as-is on one line with `\n` | Server-only runtime |

Untick "Is Build Variable?" for all three — they must never reach the bundle.
Responses are cached per date range for 10 minutes, so new data can lag that
much. Editors log in to the Studio once more after this ships (the Studio
switched to token login so it can authenticate to the route).

---

## 4. Persistent Storage tab — the one thing easy to forget

Next.js 15's ISR cache lives in `.next/cache`. Without a volume, every
redeploy wipes the cache and the first hit on every page re-fetches from
Sanity → slow cold paths. Mount one volume:

1. Click **+ Add Volume**.
2. **Name:** `next-cache`
3. **Destination Path:** `/app/.next/cache`
4. Leave **Source Path** empty (Docker-managed volume — Coolify auto-appends
   the resource UUID so it's unique per app).

That's it. One volume, done.

Docs: <https://coolify.io/docs/knowledge-base/persistent-storage>

> **Why `/app/.next/cache`?** The Coolify docs state verbatim: *"The base
> directory inside the container is `/app`."* The `WORKDIR` in our Dockerfile
> matches, and the `chown -R nextjs:nodejs .next` line in the runner stage
> ensures the mounted volume is writable by the non-root user.

---

## 5. Domains tab

Set the primary domain, e.g. `https://ilot.id`. Coolify's Traefik proxy
will request a Let's Encrypt cert automatically on the first request
(same flow as `n8n.ilot.example` in your existing `next-steps.md`).

If you want `www.ilot.id` to redirect to the apex, set
**Direction = "Allow www & non-www"** in the General tab → **Set Direction**.

---

## 6. Sanity CORS — 30-second step

Sanity's dashboard → **API → CORS Origins → Add Origin** → paste your new
production URL (e.g. `https://ilot.id`). Without this the in-page
`/studio` route will 401 on browsers outside Sanity's own origin list.

You don't need to touch CORS for server-side GROQ — those requests come
from your container, not the browser.

---

## 7. Deploy

Click the big **Deploy** button (top-right in the Coolify UI).

Watch **Deployments** tab → **Logs**. The first build is slow (~3–5 min)
because Alpine has to download Node and the deps layer. Subsequent builds
will reuse the `deps` layer unless `package-lock.json` changes.

**Expected final log lines:**
```
▲ Next.js 15.5.14
- Local:        http://0.0.0.0:3000
✓ Ready in …ms
```

Then visit either the generated `*.sslip.io` URL (Coolify auto-assigns one
— you already have it: `nuy3v2h400jw7272uhdo19cp.76.13.211.156.sslip.io`)
or your custom domain once TLS is ready.

---

## 8. Smoke tests to run after the first green deploy

1. `GET /` — homepage renders the scroll-linked hero on desktop.
2. `GET /visa` — a category page renders with the real Sanity data
   (proves `SANITY_API_READ_TOKEN` is correct).
3. `GET /visa/investor-kitas-2-years` — a service page renders with
   category color banner.
4. `GET /sitemap.xml` — returns a populated sitemap (proves ISR-at-build
   worked).
5. `GET /studio` — the Sanity Studio shell loads (proves the webpack shims
   for React 19 + Sanity are working in the built bundle).
6. WhatsApp floating button opens `wa.me/<NEXT_PUBLIC_WA_NUMBER>` with
   the correct number.

---

## 9. Turning off Vercel

Once everything above is green for 24 hours and DNS for `ilot.id` points
to the VPS (not Vercel's edge), delete the Vercel project so you don't
pay twice. Nothing in the codebase needs to change.

---

## Common failure modes & fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Container shows **Exited** / **Unhealthy** immediately after build | `Dockerfile` missing or standalone output not produced | Verify `output: 'standalone'` is in `next.config.ts` (it now is) and that this commit is pushed to the branch Coolify tracks |
| Build succeeds but pages are blank / show 401 data | `SANITY_API_READ_TOKEN` not set | Add it in Environment Variables → redeploy |
| Client-side JS throws `projectId is undefined` | A `NEXT_PUBLIC_*` var wasn't set at build time | Set it in Environment Variables → click **Deploy** again (not just **Restart**) |
| `/studio` crashes with "c is not a function" | React 19 / Sanity shims didn't run | Don't change `next.config.ts`'s webpack block — it's load-bearing |
| Cold ISR on every page after restart | `.next/cache` volume not mounted | Re-check Persistent Storage step |
| Deploy eats all VPS memory | 2 vCPU / 2 GB is the minimum that reliably builds Next.js 15 + Sanity Studio together | Upsize the droplet, or use Coolify's **Use a Build Server** feature on the General tab to offload the build |
| Container runs but "No Available Server" at the domain | Port mismatch | `Ports Exposes` must be `3000` (matches the Dockerfile `EXPOSE 3000` + `PORT=3000`) |

---

## Reference links

- Coolify Next.js page: <https://coolify.io/docs/applications/nextjs>
- Coolify Dockerfile build pack: <https://coolify.io/docs/applications/build-packs/dockerfile>
- Coolify Persistent Storage: <https://coolify.io/docs/knowledge-base/persistent-storage>
- Coolify Env Vars: <https://coolify.io/docs/knowledge-base/environment-variables>
- Next.js standalone output: <https://nextjs.org/docs/app/api-reference/config/next-config-js/output>
- Official Next.js Dockerfile the one in this repo is derived from:
  <https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile>
