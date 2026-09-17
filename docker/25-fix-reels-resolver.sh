#!/bin/sh
# nginx.conf.template's /reels/ proxy resolves drive.usercontent.google.com
# at request time via `resolver 8.8.8.8 1.1.1.1`, nginx's own raw DNS
# client speaking straight to those IPs — some hosts (Render included)
# sandbox outbound traffic so only the container's own assigned resolver
# gets through, and raw queries to arbitrary public DNS servers just
# never come back. nginx then can't resolve the upstream host at all and
# every /reels/<id> request fails immediately with a flat 502 — before it
# ever reaches Google, so the clip never streams and the modal's autoplay
# (which only ducks the site's own music once a clip actually starts
# playing) never fires either. Symptom and root cause once traced back:
# both "reels won't autoplay" and "the music isn't muted" are this one
# broken resolver, not the client-side reels.js logic.
#
# Fix: prepend whatever nameserver this container was actually handed —
# the address every OTHER outbound call on this box already resolves
# through — ahead of the public pair, so nginx tries that first and only
# falls back to 8.8.8.8/1.1.1.1 if it's somehow unset.
#
# Runs after the base image's 20-envsubst-on-templates.sh has already
# rendered nginx.conf.template, so it patches the real, final config file
# nginx is about to load. Deliberately never fails (see 40-yt-config.sh's
# note on /docker-entrypoint.sh's `set -e`) — a missed patch here should
# leave the original hardcoded pair in place, not take the site down.

CONF=/etc/nginx/conf.d/default.conf

{
  [ -f "$CONF" ] || exit 0

  resolvers=$(awk '/^nameserver[ \t]/ { print $2 }' /etc/resolv.conf 2>/dev/null | tr '\n' ' ' | xargs)

  if [ -n "$resolvers" ]; then
    sed -i "s/resolver 8\.8\.8\.8 1\.1\.1\.1 /resolver $resolvers 8.8.8.8 1.1.1.1 /" "$CONF"
  fi
} || true
