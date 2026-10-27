# Devlog — Seu Barbeiro

Diário curto das sessões. O histórico detalhado das versões fica no `CHANGELOG.md`, as
pendências nas issues do GitHub e as notas de estudo no cofre do Obsidian.

## 27/10/2026 — Vídeo de demonstração e revert da Belaza

**Na prática:** o sistema foi conferido de ponta a ponta para o vídeo, do agendamento
online ao painel, como visitante, dono, recepção e profissional, no computador e no
celular. Os dados de demonstração foram renovados e valem até 05/11. A marca Belaza
saiu do Seu Barbeiro, que continua só para barbearias.

**Técnico:** `017fe9c` (duração total no agendamento, cartão compacto na agenda,
painel do atendimento atualizado após cada ação, saldo pré-preenchido no recebimento,
redirecionamento do profissional, caixa aberto no `demo-data.cjs`); `8e33931` reverte
`ec643fa` (Belaza); `cc7b7bf` (confirmação em um toque e datas legíveis). Instruções
do projeto (`CLAUDE.md`/`AGENTS.md`) ganharam a seção `## Deploy` e as regras do cofre.

**Próximo passo:** antes de 05/11, regerar os dados de demonstração se o vídeo ainda
não tiver sido gravado (`demo-data.cjs limpar --sim` e depois `criar` no servidor).
