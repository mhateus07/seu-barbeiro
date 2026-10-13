# Seu Barbeiro

## Documentação no Obsidian

Depois de mudanças relevantes, atualizar as notas correspondentes em ~/obsidian/Projetos_Dev/SeuBarbeiro.

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
