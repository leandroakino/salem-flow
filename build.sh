#!/bin/sh
# Monta dist/index.html a partir de src/ (mesma ordem usada na versão publicada)
cd "$(dirname "$0")" && cat src/01-head.html src/02-core.js src/03-views.js src/04-flows.js > dist/index.html && echo "ok: dist/index.html"
