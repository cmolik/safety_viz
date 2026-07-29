#!/usr/bin/env sh
set -eu

envsubst '${API_URL} ${BASENAME}' < /etc/nginx/config.js.template > /var/www/config.js

exec "$@"
