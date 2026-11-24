#!/bin/sh
# Monta as duas versões a partir de src/:
#  dist/index.html  -> versão de teste (Artifact do Claude)
#  web/index.html   -> versão online (Supabase + Cloudflare Pages)
cd "$(dirname "$0")" || exit 1
mkdir -p dist web
cat src/01-head.html src/02-core.js src/03-views.js src/04-flows.js src/09-end.js > dist/index.html && echo "ok: dist/index.html"
# na versão online, o supabase-js e o adaptador vêm antes do script principal
SB='<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>'
awk -v sb="$SB" 'BEGIN{while((getline l < "src/web/adapter.js")>0) ad=ad l "\n"} /^<script>$/ && !done {print sb; printf "%s", ad; done=1} {print}' src/01-head.html > /tmp/head-web.html
cat /tmp/head-web.html src/02-core.js src/03-views.js src/04-flows.js src/05-web.js src/09-end.js > web/index.html && echo "ok: web/index.html"
# carimba o número da versão (arquivo VERSION) nas duas saídas
V=$(cat VERSION)
sed -i "s/__VERSION__/$V/g" dist/index.html web/index.html && echo "versão: v$V"
