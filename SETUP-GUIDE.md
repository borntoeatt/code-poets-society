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
5. `migrations/005_protect_timestamps.sql` — **required**: makes created_at /
   updated_at / starred_at server-set, so rate limits can't be back-dated
6. `migrations/006_concurrency_and_bounds.sql` — **required**: rate limits
   and username generation are safe under concurrent requests; project
   columns are size-bounded so one row can't break the list page

(`001_add_rate_limiting.sql` is already included in `supabase-schema.sql`.)

On an existing project, run only the migrations you haven't applied yet.
`004`, `005` and `006` are safe to re-run.

### 2. Auth settings

Dashboard → **Authentication → Attack Protection** (under *Configuration*):

- Enable **Captcha protection**, provider **Turnstile**, and paste the
  Turnstile *secret* key. This setting is project-wide: it gates sign-up,
  password login and password reset. The auth modal shows the widget in all
  three modes and sends the token with every request, so nothing breaks
  when you turn it on. Without the setting the CAPTCHA is decorative.
- Under **Authentication → URL Configuration**, set **Site URL** to
  `https://codepoetssociety.info` so password-reset links return to the app
  (the app shows a "set new password" form on arrival).

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
docker run --rm -p 8080:80 code-poets-society
```

The image is `nginxinc/nginx-unprivileged` (uid 101, read-only root
filesystem with `/tmp` as an `emptyDir`, all capabilities dropped). nginx
still listens on **port 80** so the Service never changes; the pod grants the
non-root bind with the safe `net.ipv4.ip_unprivileged_port_start=0` sysctl.
Security headers live in `nginx-security-headers.conf` and are included in
every location block.

### Deploy flow (Argo CD auto-sync from `k8s/` on `main`)

1. Merge to `main`. CI (`.github/workflows/docker.yml`) lints, builds the
   image once, scans it with Trivy (fails on CRITICAL/HIGH), pushes that
   exact image to Docker Hub tagged `latest` and `<sha>`.
2. CI then rewrites the digest in `k8s/deployment.yaml` and commits it to
   `main` as `github-actions[bot]`. It skips this when a newer
   image-producing commit is already on `main` (that commit's run pins
   instead), so a late or re-run job can never roll production back.
3. Argo CD syncs the new digest; Kubernetes rolls the pods. The Deployment
   uses `maxSurge: 100%` / `maxUnavailable: 0` and the Service pins each
   visitor to one pod (Traefik sticky cookie `cps_srv`), so nobody loads
   HTML from a new pod and its hashed assets from an old one.

The Deployment deliberately has no `replicas` field: the HPA owns the count.
This relies on the Argo `Application` using `ServerSideApply=true` (it does):
the HPA's scale subresource co-owns `spec.replicas`, so Argo dropping the
field leaves the live count alone. Check before changing the manifest's
replica handling:

```bash
kubectl -n codepoets apply --server-side --force-conflicts \
  --field-manager=argocd-controller --dry-run=server \
  -f k8s/deployment.yaml -o jsonpath='{.spec.replicas}'
```

If Argo is ever switched to client-side apply, first add this to the
`Application` (it lives in the k3s-apps repo, not here), otherwise the first
sync after removing `replicas` drops the Deployment to 1 pod:

```yaml
spec:
  ignoreDifferences:
    - group: apps
      kind: Deployment
      name: code-poets-society
      jsonPointers: [/spec/replicas]
  syncPolicy:
    syncOptions: [RespectIgnoreDifferences=true]
```

When a merge changes both code and `k8s/`, Argo applies the manifest change
first (still with the previous digest) and the digest commit a few minutes
later, so you'll see two quick rollouts. To watch:

```bash
kubectl -n codepoets rollout status deploy/code-poets-society
```

If CI is broken and you need to pin a digest by hand:

```bash
docker buildx imagetools inspect dporkov/code-poets-society:latest
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
