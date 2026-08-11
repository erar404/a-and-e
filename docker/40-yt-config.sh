#!/bin/sh
# renders yt-config.js from its template using the YOUTUBE_API_KEY env var
# Render/Cloud Run injects at deploy time — mirrors how the built-in
# 20-envsubst-on-templates.sh script handles nginx.conf.template for PORT.
set -eu

envsubst '${YOUTUBE_API_KEY}' \
  < /usr/share/nginx/html/yt-config.js.template \
  > /usr/share/nginx/html/yt-config.js
