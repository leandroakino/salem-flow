# Versões do Salém Flow

Cada atualização publicada ganha um número e fica registrada aqui com o commit correspondente. A versão aparece na tela de login e no menu do usuário.
Para voltar a uma versão: `git checkout <commit>` (ou peça ao Claude: "voltar para a v1.2").

## v1.5
- Sem "Aceitar na fila": o pedido liberado já entra em "Aguardando produção".
- Ficha de baixo sai na liberação do pedido; pendentes das últimas 24 h saem quando o computador volta; reimpressão se o pedido for alterado; aviso impresso de cancelamento.
- Aviso de pedido novo na tela da produção (mensagem + som).
- Grupos por data (Atrasados, Hoje, Amanhã, Próximos dias) na fila de produção e na TV.
- TV: pedidos com foto aparecem em card maior (até 2 por coluna), com a data quando não é hoje. Função tv_feed atualizada no Supabase.
- Recebimento enxuto: produção não inicia transporte; o atendimento recebe direto; uma única caixa de conferência.

## v1.4 (commit 7f895e1)
- Produção com 2 cliques: Iniciar produção e Pronto para subir.
- Sem conferência de montagem na produção (a conferência é feita no atendimento, no recebimento).
- A ficha não abre mais em pop-up ao iniciar a produção.

## v1.3 (commit f68238b)
- Número da versão visível no login e no menu do usuário.

## v1.2 (commit 30207cb)
- Ficha vira pop-up obrigatório (não some sozinha, Esc não fecha, Enter imprime).
- Produção também abre a ficha ao iniciar.

## v1.1 (commit 755c93a)
- Botão "Imprimir agora" na ficha.

## v1.0 (commit 5e68fbb)
- Primeira versão online definitiva (Supabase + Cloudflare, login simples, TV por link, estações de impressão, túnel /sb).
