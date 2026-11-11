# Salém Flow
Sistema interno da Floricultura Salém (pedidos, produção, painel TV, estoque, entregas).

- `src/` — fontes (head/CSS, core, views, flows). `./build.sh` gera `dist/index.html` (arquivo único).
- `tests/` — testes Playwright com mock do banco (`node tests/test.js`; os scripts leem `page.html`, ajuste o caminho para `dist/index.html`).
- `seed/` — dados de demonstração.
- Versão atual = v26 do Artifact (painel TV interativo, como na v24).

## Próximos passos (versão definitiva)
Trocar `window.claude.use('db')` por Supabase, hospedar em Vercel/Cloudflare Pages, login real, impressão silenciosa (Bematech MP-4200) e painel TV por link sem login.
