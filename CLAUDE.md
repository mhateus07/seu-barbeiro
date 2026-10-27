# Seu Barbeiro

## Cofre do Obsidian (segundo cérebro da Impulsio)

Documentação de estudo e de apresentação em `~/obsidian/Projetos_Dev/02 Produtos/Seu Barbeiro/`. Regras completas: `~/obsidian/Projetos_Dev/03 Compartilhado/Como manter o cofre.md`.

- **Ao concluir uma mudança relevante** (código, funcionalidade, banco, infra, preço, plano, material de venda ou decisão), atualize o cofre na mesma sessão, sem esperar o Mateus pedir:
  - entrada nova no topo de `Seu Barbeiro — Devlog.md` (**Na prática** / **No técnico** / Ref.: commit, PR ou issue);
  - a nota do tema em `Técnico/` (funcionalidade nova sem nota → crie e ligue no guia de estudo);
  - `Seu Barbeiro — Comercial.md`, `Seu Barbeiro — Financeiro.md` e as propriedades do topo de `Seu Barbeiro (Mapa).md` se mudou preço, plano, custo ou oferta;
  - `Seu Barbeiro — Apresentação.md` se mudou o pitch, o público ou o material de venda;
  - `Seu Barbeiro — Roadmap.md` e a propriedade `status` do Mapa se mudou a fase ou os próximos passos.
- Escreva sempre em dois níveis: o que muda na prática e o que mudou no código. Mude só o que mudou, não apague notas, não invente (use `⚠️ a confirmar`) e mantenha `atualizado:` no topo.
- **Nunca** coloque senhas, tokens, chaves, IPs, caminhos do servidor ou dados de clientes no cofre.
- Ajuste trivial (texto, estilo) não precisa. Revisão completa: `/atualizar-vault`.
- Se o cofre não estiver acessível (ex.: sessão na nuvem), avise no fim da tarefa em vez de pular em silêncio.

## Painel de produtos (GitHub Issues + Projects)

O que está feito, o que falta e as ideias deste produto ficam nas **Issues deste repositório**, reunidas no quadro **"Seu Barbeiro"** do GitHub Projects (conta `mhateus07`), que é só deste produto. Mantenha isso atualizado por conta própria, sem esperar o Mateus pedir:

- **Antes de começar uma tarefa:** procure a issue (`gh issue list --search "<palavras>"`). Se não existir e a tarefa não for um ajuste trivial, crie com as etiquetas certas.
- **Ao concluir:** referencie a issue no commit ou no PR com `Closes #N` (ela fecha sozinha e o cartão vai para Feito). Trabalho parcial: comente na issue o que foi feito e o que falta.
- **Pendência descoberta no caminho:** crie uma issue `tarefa`. Se ela impede vender ou fazer piloto, adicione `bloqueia-venda` e o marco "🎯 Primeira venda".
- **Ideia que o Mateus mencionar na conversa:** crie uma issue `ideia` com o título começando por "💡".
- **Colunas do quadro (em português):** "A fazer", "Fazendo", "Feito" e "💡 Ideias". Issue `ideia` vai para "💡 Ideias"; ao começar uma tarefa, mova o cartão para "Fazendo" (`gh project item-edit` no campo Status). Fechar a issue leva o cartão para "Feito" sozinho.
- **Toda issue nova entra no quadro:**
  `gh project item-add "$(gh project list --owner mhateus07 --format json --jq '.projects[] | select(.title=="Seu Barbeiro") | .number')" --owner mhateus07 --url <url-da-issue>`
  Se der erro de permissão, peça ao Mateus para rodar uma vez `gh auth refresh -s project`.
- **Etiquetas:** tipo (`tarefa`, `ideia`, `concluido`), área (`config`, `seguranca`, `comercial`, `juridico`), urgência (`prioridade:alta`, `prioridade:media`, `prioridade:baixa`) e `bloqueia-venda`.
- O diário das sessões continua no arquivo de contexto do projeto; a **lista de pendências** passa a viver nas issues.
- Nunca coloque senhas, chaves, IPs, caminhos do servidor ou dados de clientes no texto das issues.

> Este repositório é **público**: as issues também são. Escreva pendências de forma genérica.

## Deploy
<!-- Lido pela rotina /finalizar (regras globais em ~/.claude/CLAUDE.md). Edite à vontade. -->
deploy automático: sim
merge automático: sim
branch principal: main
build/teste: (cd seu-barbeiro-api && npm test) && (cd seu-barbeiro-web && npm run lint && npm run build)
comando de deploy: ./deploy.sh
verificação: o deploy.sh já espera o container ficar saudável; depois: curl -fsS -o /dev/null https://seubarbeiro.impulsiodigital.com
contexto: CHANGELOG.md e docs/Devlog.md
