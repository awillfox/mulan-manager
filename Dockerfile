# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --production

# ---- run ----
FROM node:22-alpine
WORKDIR /app
# Tailscale static binaries
RUN apk add --no-cache ca-certificates iptables ip6tables curl \
 && curl -fsSL https://pkgs.tailscale.com/stable/tailscale_1.78.1_amd64.tgz -o ts.tgz \
 && tar xzf ts.tgz --strip-components=1 -C /usr/local/bin tailscale_1.78.1_amd64/tailscale tailscale_1.78.1_amd64/tailscaled \
 && rm ts.tgz
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENV PORT=3000
# adapter-node defaults BODY_SIZE_LIMIT to 512K — tighter than the backend's
# own 10 MiB image cap, so a downscaled 1920px phone photo (routinely
# 700-900 KB) was rejected with an opaque 500 before the request ever reached
# a route. Keep this just above the backend cap so the backend's explicit
# validation, not this proxy, is what rejects an oversized upload.
ENV BODY_SIZE_LIMIT=11M
EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
