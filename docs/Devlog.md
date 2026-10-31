# Devlog — Seu Barbeiro

Diário curto das sessões. O histórico detalhado das versões fica no `CHANGELOG.md`, as
pendências nas issues do GitHub e as notas de estudo no cofre do Obsidian.

## 31/10/2026 — Correções para o piloto

**Na prática:** os problemas encontrados na análise foram corrigidos. O Pix pago depois
do cancelamento agora é registrado, o cliente é avisado quando o horário muda, o barbeiro
opera a própria agenda, a comissão fecha certo em estorno, inativo e atendimento tardio,
e produtos, desconto e caixa ganharam controle. A demonstração ganhou um comando que completa
a agenda sem apagar nada, ainda não ligado no servidor. Testes com navegador percorrem o site, o agendamento e o caixa, no computador
e no celular.

**Técnico:** regra padrão da comissão: nasce do atendimento concluído; com estorno vale o
que ficou recebido; sem pagamento vale o preço do serviço. Migração
`20261031000000_commission_settlement_stock` (`commissionPaymentId`, `minStock`). Novos:
`worker-status`, `person-name`, `/operations/alerts`, `/health` com banco e último ciclo do
worker, Dependabot, auditoria e job `e2e` no CI, `renovar` e travas no `demo-data.cjs`.
58 testes de API e 10 de tela aprovados.

**Próximo passo:** decisões do Mateus: preço (#73), regra do sinal (#14) e confirmação da
regra da comissão, e autorização para rodar e agendar o `renovar` no servidor antes de
05/11 (#72). Depois: demo em banco próprio, monitor externo (#32) e piloto.

## 31/10/2026 — Análise de escopo e novo plano

**Na prática:** o sistema foi reavaliado com foco no piloto. Quinze problemas foram
reproduzidos num banco descartável; os mais sérios envolvem Pix pago depois do
cancelamento, cliente sem aviso de mudança no horário, barbeiro sem operar a própria
agenda e erros na comissão. Nada foi corrigido nesta sessão: as correções e as ideias
novas viraram issues. A proposta de ordem está no Roadmap do cofre.

**Técnico:** 39/39 testes aprovados antes da reprodução, que ficou fora do repositório.
`npm audit --omit=dev`: 8 alertas na API e 3 no painel. Issues #65 a #79 (tarefas) e
#80 a #89 (ideias); #14 e #32 complementadas; #28 encerrada (Belaza é produto separado).

**Próximo passo:** renovar a demo antes de 05/11 (#72) e definir preço e regra do sinal
(#73, #14).

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
