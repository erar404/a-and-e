#!/bin/sh
# starts the jipiti chatgpt-bridge in the background, then hands off to
# the stock nginx image entrypoint (still runs /docker-entrypoint.d/*,
# including our own 40-yt-config.sh, before exec-ing nginx as before).
set -e

python3 /opt/jipiti/main.py &

exec /docker-entrypoint.sh "$@"
