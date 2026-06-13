#!/bin/sh
set -e

# Start tailscaled in userspace networking mode with an HTTP/SOCKS proxy on :1055.
/usr/local/bin/tailscaled \
	--tun=userspace-networking \
	--socks5-server=localhost:1055 \
	--outbound-http-proxy-listen=localhost:1055 \
	--state=mem: &

# Wait for the tailscaled daemon socket before `up` (avoids a cold-start race
# where `up` runs before the daemon is listening).
for i in $(seq 1 50); do
	/usr/local/bin/tailscale status 2>&1 | grep -q "failed to connect" || break
	sleep 0.2
done

# Join the tailnet (ephemeral node, auto-removed on shutdown/redeploy).
/usr/local/bin/tailscale up \
	--authkey="${TS_AUTHKEY}" \
	--hostname="${TS_HOSTNAME:-mulan-manager}" \
	--accept-routes

echo "tailscale up; backend via ${BACKEND_URL}"
exec node build
