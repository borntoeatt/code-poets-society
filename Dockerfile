# ---- build stage ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- runtime stage ----
# Unprivileged image: runs as uid 101 and writes only to /tmp.
# Track the stable nginx line on the current Alpine; CI's Trivy scan fails the
# build when the base image falls behind on CRITICAL/HIGH fixes.
# The stage is named so CI can exclude it from layer caching
# (no-cache-filters=runtime), which keeps `apk upgrade` from becoming a
# cached no-op.
FROM nginxinc/nginx-unprivileged:1.30-alpine3.24 AS runtime

# Pull in any OS package fixes released since the base image was built.
USER root
RUN apk upgrade --no-cache
USER 101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Port 80 as a non-root user: Docker >= 20.10 allows this by default; on
# Kubernetes the pod sets the net.ipv4.ip_unprivileged_port_start=0 sysctl.
# Staying on 80 keeps the Service unchanged, so rollouts from the old
# root-based image are zero-downtime.
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1
