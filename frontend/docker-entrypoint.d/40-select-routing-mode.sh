#!/bin/sh
set -eu

if [ "${PROXY_API_TO_BACKEND:-false}" = "true" ]; then
  cp /etc/nginx/resumebuilder/nginx.compose.conf /etc/nginx/conf.d/default.conf
fi
