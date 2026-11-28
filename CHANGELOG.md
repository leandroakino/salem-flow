# Versões do Salém Flow

Cada atualização publicada ganha um número e fica registrada aqui com o commit correspondente. A versão aparece na tela de login e no menu do usuário.
Para voltar a uma versão: `git checkout <commit>` (ou peça ao Claude: "voltar para a v1.2").

## v1.11
- Sem "Resp.: nome" nos cartões da produção. No detalhe do pedido, "Responsável" aparece só para o administrador (o nome continua gravado no histórico e na auditoria).
- O botão "Trocar usuário" do menu do nome passa a se chamar "Sair do sistema".

## v1.10 (commit 7d0109c)
- Retirada em 1 clique: "Retirada confirmada" conclui direto, registrando o nome de "Quem retira" (ou o cliente). Novo botão "Retirada por outra pessoa" pergunta o nome.
- Ficha na liberação: com a estação de cima ligada, não abre mais o pop-up; mostra só um aviso curto de que a ficha foi enviada. Sem a estação (ou pedido que não passa pela produção), o pop-up abre como antes.
- Estação de cima também reimprime a ficha quando o pedido é alterado.

## v1.9 (commit f99aecd)
- Entrega em 1 clique: "Confirmar entrega" (atendimento) e "Entreguei" (entregador) concluem direto, registrando o destinatário do pedido como quem recebeu.
- Novo botão "Entregue a outra pessoa" ao lado, que pergunta o nome de quem recebeu.

## v1.8 (commit e273657)
- Recebimento em 1 clique: botão "Confirmar recebimento" no pedido que subiu, sem janela e sem caixas de conferência (o cartão passa a valer como conferido).
- "Registrar divergência" fica no detalhe do pedido, para quando algo estiver errado.
- Na aba Receber, o botão do número vira "Confirmar pelo número" e também recebe direto.

## v1.7 (commit 153e0e9)
- Volta ao túnel /sb (igual à v1.5 na conexão). Medição: túnel ~70 ms mais rápido e mais estável que o direto.

## v1.6 (commit 41c77fb)
- Conexão direta com o Supabase (caminho mais rápido). O túnel /sb continua no projeto, sem uso, caso a rede volte a bloquear.

## v1.5 (commit 8e3ab11)
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
