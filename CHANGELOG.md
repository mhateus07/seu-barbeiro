# Changelog — Seu Barbeiro

## [04/10/2026] — Visual novo e 7 funcionalidades para a equipe

### Visual
- Tailwind 4 com tema central (`src/index.css`), fontes Inter e Plus Jakarta Sans embutidas, sombras e animações
- Modo **claro, escuro ou do sistema** no painel (seletor no topo)
- Avisos rápidos (Sonner), telas de carregamento, painel do atendimento com animação (Motion)
- Telas carregadas sob demanda; restos do modelo do Vite removidos; ícone novo
- **Agenda**: visão Dia e Semana, calendário pequeno, cores por situação e por profissional, linha da hora atual, faixa fora da escala, arrastar para reagendar e clicar no horário livre para agendar
- **Tela de login** nova (foto, destaques do produto, mostrar senha, link para o cliente agendar)

### Novas funcionalidades
- **Sinal via Pix (Mercado Pago)**: no agendamento online o cliente paga o sinal pelo QR Code; sem pagamento no prazo o horário é liberado e o Pix cancelado. Configurável em Configurações → Pix e cliente (todos, só quem faltou, % ou valor fixo, prazo)
- **Assinaturas (clube do corte)**: planos com usos por mês e serviços incluídos, mensalidade por Pix enviada pelo WhatsApp alguns dias antes do vencimento, baixa manual, inadimplência automática e "Usar assinatura" na comanda
- **Link do cliente** (`/meu-horario`): confirmar, remarcar ou cancelar sozinho, respeitando a antecedência mínima; vai na confirmação e no lembrete do WhatsApp
- **Vales do barbeiro**: lançados em Financeiro → Comissões e descontados automaticamente no pagamento da comissão (do mais antigo ao mais novo, enquanto couberem)
- **Caixa**: abertura com troco, reforço, sangria, dinheiro esperado, recebido por forma de pagamento e fechamento com diferença
- **Profissional bloqueia a própria agenda** (e só a dele)
- **Avisos no celular (push) e app instalável (PWA)**: novo agendamento online, cliente confirmou/remarcou/cancelou, sinal e mensalidade pagos

### Demonstração
- `scripts/demo-data.cjs` (`criar` / `limpar --sim`): o salão principal em produção foi preenchido com uma barbearia fictícia em funcionamento para apresentação
- A agenda passa a abrir no modo Dia (uma coluna por profissional)

### Técnico
- Migração `20261004000000_professional_features` (somente adições; um único caixa aberto garantido no banco)
- Webhook `POST /api/v1/webhooks/mercadopago/:salon`: o pagamento é sempre reconsultado na API do Mercado Pago
- O token do Mercado Pago nunca volta ao navegador
- `deploy.sh` gera as chaves VAPID das notificações quando faltam no `.env`
- Testes: 9 novos (Mercado Pago simulado por servidor local), 30 no total; a suíte roda em sequência

---

## [03/10/2026] — Seu Barbeiro no ar

### Novo nome e domínio
- Sistema renomeado de Barbearia do Rei para **Seu Barbeiro** (pastas `seu-barbeiro-api/` e `seu-barbeiro-web/`, pacotes, títulos, tela de login)
- Slug do salão `barbearia-do-rei` → `seu-barbeiro`; links e navegadores com o slug antigo são redirecionados no painel
- Migração `20261003000000_rename_shop_seu_barbeiro` troca o nome gravado nas configurações
- Domínio **seubarbeiro.impulsiodigital.com**; `rei.impulsiodigital.com` redireciona (301) mantendo caminho e query

### Produção na VPS Contabo (Docker + Easypanel/Traefik)
- `Dockerfile` único: o container serve a API e o painel no mesmo domínio e aplica as migrações ao iniciar
- `docker-compose.yml` com PostgreSQL próprio e labels do Traefik (certificados Let's Encrypt automáticos)
- `deploy.sh` refeito: envia para `/opt/seu-barbeiro`, faz backup do banco, reconstrói, espera o healthcheck; na primeira instalação gera o `.env` com senhas aleatórias e o acesso do dono
- A VPS antiga da Hostinger foi desativada; o banco de produção começou vazio na Contabo

### Correções
- Rate limit usa o IP real do cliente atrás do proxy (`trust proxy`)
- `npm audit fix` na API e no painel
- Rotas públicas com tratamento de erros único: mensagens amigáveis, falhas internas ocultadas; JSON malformado retorna 400
- CSP libera imagens HTTPS externas (logos e fotos)
- `deploy.sh`: o `docker compose exec` do backup consumia o restante do script remoto e o build nunca rodava (saía com sucesso); corrigido com `< /dev/null`
- Painel: botão **Trocar senha** em Agenda e operação → Equipe e serviços → Acessos da equipe (a API já aceitava, faltava a opção)

### Organização
- O sistema paralelo `saas-multi-tenant` foi arquivado na tag `arquivo/saas-multi-tenant` e removido da Contabo (backup em `/root/arquivo/`); só a `main` é desenvolvida

---

## [31/03/2026] — Sessão de desenvolvimento

### Agendamento Online pelo Cliente (link público)
- Nova página pública `/agendar` sem necessidade de login
- Wizard em 5 passos: Serviços → Barbeiro → Data & Hora → Seus Dados → Confirmar
- Tela de sucesso com resumo do agendamento após confirmação
- Design próprio (tema escuro premium, botões âmbar) — independente do painel admin
- Cliente pode selecionar múltiplos serviços com cálculo automático de duração e valor total
- Opção "Sem preferência" de barbeiro: sistema escolhe automaticamente o primeiro disponível
- Slots de horário gerados com base nos horários de funcionamento cadastrados nas configurações
- Slots já ocupados são filtrados automaticamente (sem sobreposição de agendamentos)
- Horários passados (antes do momento atual) não são exibidos
- Clientes novos são criados automaticamente pelo telefone; clientes existentes são identificados sem duplicar cadastro

### API Pública (sem autenticação)
- `GET /api/v1/public/info` — informações da barbearia e horários de funcionamento
- `GET /api/v1/public/services` — serviços ativos com preço e duração
- `GET /api/v1/public/barbers` — barbeiros ativos
- `GET /api/v1/public/barbers/:id/slots?date=&duration=` — horários disponíveis no dia para um barbeiro
- `POST /api/v1/public/appointments` — cria cliente (se novo) + agendamento

### Botão de compartilhamento no Sidebar
- Card "Agendamento Online" no rodapé do menu lateral do painel admin
- Botão "Copiar link" copia a URL de agendamento para o clipboard (com feedback "Copiado!")
- Botão de ícone abre a página `/agendar` em nova aba

### Correções
- Import de interfaces TypeScript alterado para `import type` na BookingPage (compatibilidade com `verbatimModuleSyntax`)
- Cast explícito com `String()` nos parâmetros de query do controller público (compatibilidade com Express 5 types)

---

## [26/03/2026] — Sessão de desenvolvimento

### Módulo Financeiro
- Lançamento de pagamentos por forma (Dinheiro, Pix, Cartão de Crédito, Cartão de Débito)
- Contas a Pagar com categorias (Aluguel, Utilities, Materiais, Salários, Equipamentos, Marketing, Outros), vencimento e status (Pendente / Pago / Vencido)
- Fluxo de Caixa com gráfico de área (receita × despesas por dia)
- Cards de resumo: Receita, Despesas Pagas, Saldo, Contas Pendentes
- Pizza de receita por forma de pagamento
- Barras de despesas por categoria
- Filtro de período (data inicial / data final)
- Rota: `/financeiro`

### Comissões dos Barbeiros
- Campo `commissionRate (%)` no cadastro e edição de cada barbeiro
- Taxa exibida no card do barbeiro
- Tab **Comissões** no Financeiro com tabela: atendimentos, receita gerada, taxa e valor da comissão por barbeiro
- Totalizador no rodapé da tabela

### Relatório PDF
- Botão "Exportar PDF" no cabeçalho do Financeiro
- PDF gerado com: cards de resumo, tabela de fluxo de caixa por dia e tabela de comissões
- Arquivo salvo como `financeiro-AAAA-MM-DD-AAAA-MM-DD.pdf`

### Edição de Agendamentos
- Botão de lápis nos agendamentos com status `SCHEDULED` ou `CONFIRMED`
- Abre o modal preenchido com os dados existentes (cliente, barbeiro, serviços, data/hora)
- Salva via PATCH no backend

### Histórico do Cliente
- Ícone de histórico na linha de cada cliente
- Modal com: total de agendamentos, concluídos, total gasto e lista completa de atendimentos com status e valor

### Vitrine
- Página `/vitrine` com logo, avaliação 5 estrelas e slogan
- Card com endereço completo, telefone, Instagram e horários de funcionamento
- Mapa do Google embutido (Rua Jose Narcisio Silva 1003, Fábricas, São João del Rei — MG)
- Galeria com 20 fotos do portfólio em grid
- Lightbox com navegação por setas e contador ao clicar nas fotos

### Logo
- Logo real da barbearia (`logo.jpeg`) no topo do sidebar substituindo o ícone genérico

### Correções
- Bug de timezone no filtro de agendamentos e dashboard: datas `YYYY-MM-DD` eram interpretadas como UTC midnight, deslocando o intervalo de busca um dia para trás no horário do Brasil (UTC-3). Corrigido com `T00:00:00` para forçar interpretação em horário local.
- Imports de tipo (`import type`) nos componentes UI para compatibilidade com `verbatimModuleSyntax`
- Ícone `Instagram` substituído por `AtSign` (não existe no lucide-react)
- Variável `deleteMutation` não utilizada removida da AppointmentsPage

---

## Stack
- **Backend**: Node.js + Express 5 + Prisma 7 + PostgreSQL + JWT + Zod
- **Frontend**: React + Vite + Tailwind CSS 3 + React Query + Recharts + jsPDF
- **Produção**: VPS Contabo (Docker + Easypanel/Traefik) — https://seubarbeiro.impulsiodigital.com
- **Domínios/DNS**: Hostinger (impulsiodigital.com)
- **Repositório**: https://github.com/mhateus07/seu-barbeiro

## Próximos passos planejados
- Trocar a senha inicial do dono pelo painel e apagar `/root/seu-barbeiro-acesso-inicial.txt` na VPS
- Cadastrar serviços, profissionais e horários em produção
- Configurar o provedor de WhatsApp e validar os lembretes
- Recuperar os dados antigos da Barbearia do Rei, se a Hostinger tiver backup
