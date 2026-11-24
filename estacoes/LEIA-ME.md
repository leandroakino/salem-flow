# Estações de impressão (Windows)

Cada computador com uma Bematech vira uma **estação**: ele imprime a ficha sozinho, sem abrir a janela de impressão.

| Computador | Arquivo | Imprime quando |
|---|---|---|
| Notebook de **baixo** (TV + Bematech) | `embaixo-tv-e-producao.bat` | a produção toca em **Iniciar produção** |
| Computador de **cima** (atendimento + Bematech) | `em-cima-atendimento.bat` | o atendimento **libera** o pedido |

## Instalação (uma vez por computador)
1. Instale o driver da Bematech e deixe-a como **impressora padrão** do Windows (Configurações > Impressoras).
2. Instale o Google Chrome.
3. Copie o `.bat` do computador para a Área de Trabalho. Na versão de baixo, troque `COLE_AQUI_A_CHAVE_DA_TV` pela chave do link da TV (o `#tv=...` do link). Não publique essa chave.
4. Dê dois cliques no `.bat`. Na janelinha pequena, entre com um usuário da equipe (ex.: `producao` embaixo, `atendimento` em cima). O login fica salvo.
5. Para abrir sozinho ao ligar o computador: tecle `Win+R`, digite `shell:startup` e coloque ali um atalho do `.bat`.
6. Nas configurações de energia do Windows: **nunca suspender** e, no notebook, **não fazer nada ao fechar a tampa**.

## Como funciona
- A estação só imprime pedidos de até 10 minutos atrás e marca cada um como impresso, então nunca sai ficha repetida e nada antigo é reimpresso ao ligar.
- Deixe a janelinha pequena aberta (pode ficar atrás de outras, mas **não feche**).
- Para desligar a impressão automática de um computador: abra `https://salem-flow.pages.dev/?estacao=off`.
