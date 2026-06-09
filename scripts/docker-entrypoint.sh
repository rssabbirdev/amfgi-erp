#!/bin/sh
set -e

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
	cd /app/migrate
	node node_modules/prisma/build/index.js migrate deploy
	cd /app
fi

exec node server.js
