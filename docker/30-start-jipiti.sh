#!/bin/sh
# starts the "jipiti" chatgpt bridge in the background before nginx starts
# (nginx proxies /api/jipiti to it — see nginx.conf.template). Runs as one
# of the base nginx image's own /docker-entrypoint.d/ scripts, so no
# custom ENTRYPOINT override is needed.
#
# Deliberately never fails: /docker-entrypoint.sh runs every script here
# under `set -e`, so any non-zero exit would take the whole site down.
# main.py itself exits immediately if its required secrets aren't set
# (an intentionally optional feature) — that must never reach this shell
# as a failure, so `|| true` and explicit backgrounding keep this script
# always exiting 0.

python3 /opt/jipiti/main.py &
true
