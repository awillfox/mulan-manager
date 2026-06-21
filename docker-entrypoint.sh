#!/bin/sh
set -e

# Start tailscaled in userspace networking mode with an HTTP/SOCKS proxy on :1055.
/usr/local/bin/tailscaled \
	--tun=userspace-networking \
	--socks5-server=localhost:1055 \
	--outbound-http-proxy-listen=localhost:1055 \
	--state=mem: &
TS_PID=$!

# State is mem: (no persistent disk), so identity is reborn every restart and an
# ephemeral key only deletes nodes AFTER they go offline (~30min lag). On
# shutdown (Render sends SIGTERM on redeploy) cleanly leave the tailnet so this
# node is removed NOW — that lag is what stacked up duplicate -2/-3/-4 devices.
cleanup() {
	/usr/local/bin/tailscale logout 2>/dev/null || true
	[ -n "$NODE_PID" ] && kill "$NODE_PID" 2>/dev/null || true
	kill "$TS_PID" 2>/dev/null || true
}
trap cleanup TERM INT

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
# Run node in the background (not exec) so the trap above still fires on SIGTERM.
node build &
NODE_PID=$!
wait "$NODE_PID"
