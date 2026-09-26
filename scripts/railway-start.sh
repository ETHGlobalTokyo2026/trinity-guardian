#!/bin/sh
echo "railway service: ${RAILWAY_SERVICE_NAME:-unset}"
if [ "$RAILWAY_SERVICE_NAME" = "intercepta" ]; then
  exec pnpm --filter @trinity/intercepta start
fi
exec pnpm --filter @trinity/seller start
