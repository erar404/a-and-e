# Walong Buwan — static keepsake site
FROM nginx:alpine

# python3 backs the "jipiti <prompt>" chatgpt bridge (docker/30-start-jipiti.sh
# runs it alongside nginx); stdlib-only, so no pip install needed.
RUN apk add --no-cache python3

# Cloud Run injects PORT (default 8080); Render injects PORT too.
# The nginx image runs envsubst on /etc/nginx/templates/*.template at startup.
ENV PORT=8080
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d

COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# yt-config.js.template holds the YOUTUBE_API_KEY placeholder for the
# "play <text>" search feature; 40-yt-config.sh renders it into
# yt-config.js at container startup, same envsubst trick as PORT above.
COPY yt-config.js.template /usr/share/nginx/html/yt-config.js.template
COPY docker/40-yt-config.sh /docker-entrypoint.d/40-yt-config.sh
RUN chmod +x /docker-entrypoint.d/40-yt-config.sh

# jipiti bot backend. No custom ENTRYPOINT: 30-start-jipiti.sh is just
# another /docker-entrypoint.d/ script — the stock nginx image already
# runs everything in that directory (in sorted order) before it execs
# nginx itself, so this launches alongside it the same proven way
# 40-yt-config.sh does, without needing to touch the entrypoint chain.
COPY jipiti/main.py /opt/jipiti/main.py
COPY docker/30-start-jipiti.sh /docker-entrypoint.d/30-start-jipiti.sh
RUN chmod +x /docker-entrypoint.d/30-start-jipiti.sh

COPY index.html chat.html call-check.html \
     styles.css chat.css call-check.css \
     script.js monthsary.js monthsary-timer.js letters-archive.js drive-show.js chat.js photos.js supabase.min.js call-check.js vdi-disguise.js yt-player.js jipiti.js sound-check.js chat-counter.js sw.js \
     /usr/share/nginx/html/
COPY static/ /usr/share/nginx/html/static/

EXPOSE 8080
