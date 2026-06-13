#!/bin/sh
set -e

# Start tailscaled in userspace networking mode with an HTTP/SOCKS proxy on :1055.
/usr/local/bin/tailscaled \
	--tun=userspace-networking \
	--socks5-server=localhost:1055 \
	--outbound-http-proxy-listen=localhost:1055 \
	--state=mem: &

# Join the tailnet (ephemeral node, auto-removed on shutdown/redeploy).
/usr/local/bin/tailscale up \
	--authkey="${TS_AUTHKEY}" \
	--hostname="${TS_HOSTNAME:-mulan-manager}" \
	--accept-routes

echo "tailscale up; backend via ${BACKEND_URL}"
exec node build
