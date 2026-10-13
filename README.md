# Seu Barbeiro

Gestão para salões e barbearias.

React + Vite no painel, Express + Prisma + PostgreSQL na API. A tela **Agenda e
operação** reúne agenda por profissional, escalas, bloqueios, serviços por etapas,
recursos, fichas técnicas, comanda, retornos, reativação e lista de espera.

## Preparação

Use Node 22.12+ (LTS recomendado) e PostgreSQL. Em cada pasta, execute `npm ci`.
Copie os arquivos `.env.example` para `.env` e configure as credenciais localmente.

Na API:

```sh
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

O seed exige `ADMIN_EMAIL`, `ADMIN_PASSWORD` com pelo menos 10 caracteres e
`SHOP_NAME`. Não existe senha administrativa padrão no novo provisionamento.
Em banco já existente, não execute o seed para atualizar a versão: aplique somente
as migrações e confira as configurações existentes.

No painel:

```sh
npm run dev
```

Entre em `/login`, informe o identificador do salão e as credenciais criadas.
O agendamento público usa `/agendar?salon=identificador`.

## Vários salões e acessos

Cada salão tem um banco PostgreSQL próprio. Configure `SALON_DATABASES` como um
objeto JSON que associa slug a URL de conexão. O servidor recusa dois slugs com a
mesma identidade de banco (host, porta e nome). `DATABASE_URL` continua sendo
usada pelo CLI para migrar e provisionar um banco específico.

Execute `npm run db:deploy:all` para migrar os bancos registrados. Cadastre novos
salões criando um banco vazio, aplicando as migrações, executando o seed com os
dados daquele salão e adicionando sua conexão à configuração do servidor.
Reinicie a API após alterar a lista. Não coloque URLs de banco no frontend.

A seleção pública via `X-Salon` não concede acesso administrativo. O JWT está
vinculado ao salão; a cada requisição, o usuário é consultado no respectivo banco.

- **Dono:** configurações e gestão de acessos, além da operação.
- **Recepção:** agenda, clientes, comanda, financeiro e relacionamento; não altera
  configurações nem administra usuários.
- **Profissional:** sua agenda, sua comissão do mês e fichas dos clientes que atende.

A implantação atual usa o mesmo fuso `SALON_TIMEZONE` para todos os bancos do
processo (padrão `America/Sao_Paulo`). Para fusos diferentes, use processos separados.

## Regras da operação

- Mudanças de agenda, reservas temporárias e recebimentos são serializados por
  bloqueio transacional PostgreSQL dentro de cada salão. Não há bloqueio entre bancos.
- A criação pública, interna e o reagendamento validam expediente, escala,
  especialidade, sobreposições, equipamentos e vagas temporariamente reservadas.
- Aplicação, pausa e finalização são etapas distintas. A pausa libera o profissional,
  mas mantém o recurso associado ao serviço reservado.
- Uma visita pode criar atendimentos de profissionais diferentes numa transação.
  Cada atendimento mantém sua comanda e comissão; não há comanda unificada da visita.
- Preço e duração podem variar por profissional. Reagendar preserva os snapshots do
  atendimento; substituir serviços atualiza os valores e exige estorno prévio.
- Concluir credita fidelidade uma única vez. Resgates concorrentes não deixam saldo
  negativo. Atendimentos encerrados não podem voltar a estados anteriores.
- Recebimentos aceitam sinal e divisão entre meios, com limite pelo saldo. O sistema
  registra o pagamento; o único Pix cobrado pelo sistema é o do sinal e o das
  assinaturas (ver abaixo), e cartão não é processado. Estornos são registros
  integrais: a devolução real é feita no provedor/caixa.
- Receita, no painel e no financeiro, é o que entrou: pagamentos no dia em que foram
  feitos, menos estornos no dia do estorno, sempre no fuso `SALON_TIMEZONE`.
- Comissões usam a taxa registrada na reserva e o valor de serviços após desconto.
  Produtos não geram comissão nesta versão. Pagamento de comissão gera despesa e
  impede sobreposição de períodos já pagos.
- A taxa histórica anterior à migração não existia: a migração usa a taxa atual como
  referência para esses registros antigos. Mudanças passadas não são reconstruídas.

## WhatsApp e relacionamento

O dono configura URL, chave e instância de um provedor compatível com o endpoint
Evolution `POST /message/sendText/:instance`, autenticação `apikey`. Valide o contrato
com o provedor contratado antes de habilitar o envio. Nenhuma credencial acompanha o
repositório. O WhatsApp inicia desabilitado.

O worker roda a cada minuto, persiste a fila e tenta enviar até cinco vezes com
intervalos crescentes. `NOTIFICATION_WORKER=false` desliga o worker, por exemplo em
uma demonstração. `PUBLIC_WEB_URL` é obrigatório para links de retorno e ofertas.
`SENT` significa aceito pelo provedor, não confirmação de entrega ao aparelho.
Uma queda após o provedor aceitar e antes do registro local pode duplicar mensagens
se o provedor não respeitar o cabeçalho `Idempotency-Key`.

- Configure retorno em dias por serviço. A lista de oportunidades exclui clientes
  com nova visita marcada. Convites exigem autorização registrada e intervalo mínimo
  de sete dias entre contatos. Revogar autorização também impede convites pendentes.
- O link identifica reservas originadas por reativação por até 30 dias. Os indicadores
  medem atribuição, não causalidade nem lucro.
- A lista de espera registra serviço, intervalo e profissional opcional. Ofertas
  reservam a vaga por 15 minutos e a aceitação é transacional.
- O dono pode habilitar ofertas automáticas: a cada minuto, cancelamentos futuros
  dos próximos 14 dias são cruzados com candidatos por ordem de inscrição. Serviços
  precisam caber integralmente na vaga. Uma pessoa não recebe novamente a mesma vaga
  expirada automaticamente. Também é possível oferecer manualmente.
- Fotos da ficha técnica são links HTTPS com autorização registrada; esta versão
  não faz upload nem gerencia armazenamento de imagens. Use armazenamento privado
  apropriado para conteúdo restrito.

## Pix, assinaturas e caixa

- **Mercado Pago**: o dono cola o Access Token em Configurações → Pix e cliente. O token
  fica só no servidor. O aviso de pagamento chega em
  `PUBLIC_WEB_URL/api/v1/webhooks/mercadopago/<salão>` e o pagamento é sempre
  reconsultado na API; se o aviso não chegar, a situação é atualizada quando a página do
  Pix é consultada e pelo worker antes de liberar o horário.
- **Sinal**: só no agendamento online. O horário fica reservado até o prazo; sem
  pagamento, o atendimento é cancelado e o Pix cancelado no Mercado Pago. Sinal pago
  vira um recebimento Pix na comanda. Devoluções continuam sendo feitas no provedor.
- **Assinaturas**: a mensalidade é gerada alguns dias antes do vencimento e enviada pelo
  WhatsApp. Sem pagamento após o vencimento a assinatura fica em atraso. Na comanda,
  "Usar assinatura" abate os serviços cobertos; a comissão continua sobre o valor do serviço.
- **Vales e caixa**: vales entram como despesa na hora e são descontados no pagamento da
  comissão. O caixa considera recebimentos em dinheiro, estornos, reforços e sangrias.
- **Avisos push**: exigem `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (o `deploy.sh` gera).
  No iPhone, o painel precisa estar instalado na tela inicial.

## Dados de demonstração

`scripts/demo-data.cjs` transforma um salão vazio numa barbearia em funcionamento, com
dados fictícios: 4 profissionais, 9 serviços, 72 clientes, 60 dias de histórico e 14 de
agenda, recebimentos, despesas, comissões, vales, caixas fechados, planos e assinantes,
lista de espera e fichas técnicas. WhatsApp e Pix não são ligados e os telefones usam a
faixa 9 0000-xxxx, que não é atribuída.

```sh
# No servidor (dentro do container do app)
docker compose exec -T app node scripts/demo-data.cjs criar        # só com o salão vazio
docker compose exec -T app node scripts/demo-data.cjs limpar --sim # apaga tudo, menos acessos e configurações
```

Rode `limpar --sim` antes de começar a usar o salão de verdade.

## Atualização de instalação existente

Faça backup e ensaie a atualização em uma cópia antes do deploy. A migração inclui
restrições de saldo, horários e papéis; dados antigos inválidos precisam ser
corrigidos antes da aplicação. A identidade existente é preservada. Tokens antigos
não têm vínculo de salão, portanto será necessário entrar novamente após atualizar.

## Produção (Docker)

A produção roda na VPS com Easypanel/Traefik: um container serve a API e o painel
(`Dockerfile` na raiz) e outro roda o PostgreSQL (`docker-compose.yml`). O Traefik
emite os certificados e redireciona o domínio antigo (`OLD_DOMAIN`) para o atual
(`APP_DOMAIN`). As migrações rodam a cada inicialização do container.

O `deploy.sh` envia o código para `/opt/seu-barbeiro`, faz backup do banco,
reconstrói e sobe os containers e espera o app ficar saudável. Na primeira instalação, rode `ADMIN_EMAIL=voce@exemplo.com
./deploy.sh`: ele gera o `.env` do servidor com senhas aleatórias (modelo em
`.env.production.example`), cria o acesso do dono e salva a senha inicial em
`/root/seu-barbeiro-acesso-inicial.txt`, fora do `.env`.

### Backups

`scripts/backup.sh` copia todos os bancos (`pg_dumpall`), cifra com AES-256 usando
`BACKUP_PASSPHRASE` e guarda os 14 mais recentes em `backups/`. Roda em cada deploy
e todo dia às 03:45 pelo cron (`/etc/cron.d/seu-barbeiro-backup`, instalado pelo
`deploy.sh`). **Guarde a `BACKUP_PASSPHRASE` fora da VPS**: sem ela nenhum backup
abre (para copiá-la sem mostrar na tela: `sh scripts/copiar-chave-backup.sh`).
A cópia cifrada vai para o Google Drive pelo `rclone` já configurado na VPS
(remoto `gdrive:`, o mesmo do Pedeli e do AmigoFit), na pasta
`seu-barbeiro-backups`; outra pasta pode ser escolhida com `BACKUP_REMOTE`. No
Drive ficam 60 dias. A restauração está no topo do script.

### Segurança e LGPD

- Login: 5 senhas erradas para o mesmo e-mail bloqueiam o acesso por 15 minutos.
  Trocar a senha, desativar o acesso ou "Sair de todos os aparelhos"
  (Configurações → Segurança) derruba as sessões abertas (`admins.tokenVersion`).
- Tokens do Mercado Pago e do WhatsApp ficam cifrados no banco (AES-256-GCM, chave
  `SETTINGS_KEY` do `.env`, gerada pelo `deploy.sh`) e nunca voltam ao navegador.
- Pelo site, um telefone tem no máximo 3 horários em aberto e cada aparelho faz até
  10 agendamentos por hora (`PUBLIC_BOOKING_LIMIT`).
- O dono baixa os dados de um cliente ou remove os dados pessoais (histórico do
  cliente → Dados pessoais). Atendimentos e valores ficam como "Cliente removido".
- Mensagens de WhatsApp com mais de 12 meses são apagadas pelo worker; ações
  sensíveis ficam em `audit_logs` por 5 anos (Configurações → Segurança).
- Política de privacidade em `/privacidade`, com links no agendamento, no site e
  na entrada.

## Verificação

```sh
# API
npm run build
# Painel
npm run build
npm run lint
```

Os testes de integração exigem dois bancos locais descartáveis cujo nome começa com
`salon_test_`. Nunca usam a `DATABASE_URL` de produção:

```sh
TEST_DATABASE_URL=postgresql://usuario:senha@127.0.0.1:5432/salon_test_a \
TEST_DATABASE_URL_B=postgresql://usuario:senha@127.0.0.1:5432/salon_test_b npm test
```

Para o contêiner local `salon-operations-test` na porta 55439, use
`sh scripts/test-local.sh` dentro da API. A suíte aplica as migrações e usa dados de
teste com identificadores únicos; chamadas de envio são simuladas, sem mensagens
reais. Abrange concorrência, permissões, filas, dinheiro, inventário e agendamento.

Após os testes, `node scripts/preview-demo.cjs` inicia uma API de demonstração usando
somente o banco descartável `salon_test_b`. Inicie o Vite em paralelo e acesse
`/login?salon=demo` com `demo@salon.local` / `Demo-salon-2026`. O worker fica desligado.
As credenciais de demonstração não são criadas em nenhum banco real.
