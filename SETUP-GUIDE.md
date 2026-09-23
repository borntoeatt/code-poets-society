# Code Poets Society — Setup Guide

A React + Vite single-page app backed by Supabase (Auth, Postgres, Edge
Functions) and protected by Cloudflare Turnstile. Served by nginx in a
container on Kubernetes.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint
npm run build      # outputs dist/
```

Public config (Supabase URL, anon key, Turnstile site key) lives in
`src/config.js`. To point at another project, copy `.env.example` to `.env`
and set the `VITE_*` variables. These values are public by design: all access
control is enforced by Row Level Security in Postgres.

## Supabase

### 1. Database

Run these in the Supabase **SQL Editor**, in order:

1. `supabase-schema.sql` — tables, indexes, base policies, triggers
2. `migrations/002_rls_and_constraints.sql`
3. `migrations/003_comment_reports.sql`
4. `migrations/004_lock_down_rls.sql` — **required**: closes the ownership,
   newsletter-privacy and URL-injection holes in the base schema

(`001_add_rate_limiting.sql` is already included in `supabase-schema.sql`.)

On an existing project, run only the migrations you haven't applied yet.
`004` is safe to re-run.

### 2. Auth settings

Dashboard → **Authentication → Settings**:

- Enable **Captcha protection**, provider **Turnstile**, and paste the
  Turnstile *secret* key. Sign-up sends the token as `captchaToken`; without
  this setting the CAPTCHA is decorative.
- Set **Site URL** to `https://codepoetssociety.info` so password-reset links
  return to the app (the app shows a "set new password" form on arrival).

### 3. Newsletter Edge Function

The browser cannot write to `newsletter_subscribers`. Sign-ups go through
`supabase/functions/verify-turnstile`, which verifies the CAPTCHA and inserts
with the service role.

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set TURNSTILE_SECRET_KEY=<turnstile secret>
supabase functions deploy verify-turnstile --no-verify-jwt
```

If you host on a different domain, add it to `ALLOWED_ORIGINS` in the
function first.

### 4. Keep the free project awake

Free-tier projects pause after about a week of inactivity. The
`supabase-keepalive` GitHub Actions workflow queries the API twice a week.
Add two repository secrets: `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Cloudflare Turnstile

Dashboard → Turnstile → your widget. Hostnames must include
`codepoetssociety.info` (and `localhost` for development). The site key goes
in `src/config.js`; the secret key goes to Supabase (Auth captcha setting and
the `TURNSTILE_SECRET_KEY` function secret). Never put the secret in the app.

## Container and Kubernetes

```bash
docker build -t code-poets-society .
docker run --rm -p 8080:8080 code-poets-society
```

The image is `nginxinc/nginx-unprivileged` (non-root, port 8080, read-only
root filesystem with `/tmp` as an `emptyDir`). Security headers live in
`nginx-security-headers.conf` and are included in every location block.

CI (`.github/workflows/docker.yml`) lints, builds, scans the image with Trivy
(fails on CRITICAL/HIGH) and only then pushes to Docker Hub on `main`.
`k8s/deployment.yaml` pins the image by digest — update it after each push:

```bash
docker buildx imagetools inspect borntoeatt/code-poets-society:latest
```

## Verify a deployment

1. Home page shows real numbers for projects / members / subscribers.
2. Sign up → confirmation email → log in.
3. Submit a project; open it via its `#/projects/<id>` link; comment on it.
4. Newsletter sign-up succeeds and the subscriber count increases.
5. In the SQL Editor, this should return **0 rows** when run as `anon`
   (Dashboard → SQL → "Run as anon" is not available; use the API instead):

   ```bash
   curl "$SUPABASE_URL/rest/v1/newsletter_subscribers?select=email" \
     -H "apikey: $ANON" -H "Authorization: Bearer $ANON"   # expect []
   ```
