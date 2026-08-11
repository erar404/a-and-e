#!/bin/sh
# renders yt-config.js from its template using the YOUTUBE_API_KEY env var
# Render/Cloud Run injects at deploy time — mirrors how the built-in
# 20-envsubst-on-templates.sh script handles nginx.conf.template for PORT.
#
# Deliberately never fails: /docker-entrypoint.sh (the base nginx image's
# entrypoint, which runs every script in this directory) uses `set -e`, so
# any non-zero exit here would take the whole site down over an optional,
# best-effort feature. `|| true` keeps this script's own exit code at 0
# no matter what happens inside.

envsubst '${YOUTUBE_API_KEY}' \
  < /usr/share/nginx/html/yt-config.js.template \
  > /usr/share/nginx/html/yt-config.js 2>/dev/null || true
