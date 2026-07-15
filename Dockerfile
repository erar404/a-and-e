# Walong Buwan — static keepsake site
FROM nginx:alpine

# Cloud Run injects PORT (default 8080); Render injects PORT too.
# The nginx image runs envsubst on /etc/nginx/templates/*.template at startup.
ENV PORT=8080
ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d

COPY nginx.conf.template /etc/nginx/templates/default.conf.template

COPY index.html chat.html call-check.html \
     styles.css chat.css call-check.css \
     script.js monthsary.js monthsary-timer.js drive-show.js chat.js photos.js supabase.min.js call-check.js vdi-disguise.js \
     /usr/share/nginx/html/
COPY static/ /usr/share/nginx/html/static/

EXPOSE 8080
