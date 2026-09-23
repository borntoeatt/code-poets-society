# ---- build stage ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
# Unprivileged image: runs as uid 101, listens on 8080, writes only to /tmp.
# Track the stable nginx line on the current Alpine; CI's Trivy scan fails the
# build when the base image falls behind on CRITICAL/HIGH fixes.
FROM nginxinc/nginx-unprivileged:1.30-alpine3.24

# Pull in any OS package fixes released since the base image was built.
USER root
RUN apk upgrade --no-cache
USER 101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1
