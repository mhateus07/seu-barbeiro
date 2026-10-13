#!/bin/bash
# Deploy do Seu Barbeiro na VPS Contabo (Docker + Easypanel/Traefik).
# Primeira instalação: ADMIN_EMAIL=voce@exemplo.com ./deploy.sh
# Demais deploys:      ./deploy.sh
set -euo pipefail

VPS="${VPS:-impulsio}" # alias do ~/.ssh/config → root@173.212.208.109
REMOTE_DIR="/opt/seu-barbeiro"
APP_DOMAIN="seubarbeiro.impulsiodigital.com"
# Domínio anterior: continua no ar redirecionando para o novo (links já compartilhados).
OLD_DOMAIN="rei.impulsiodigital.com"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "======================================"
echo "  DEPLOY - Seu Barbeiro"
echo "======================================"

echo ""
echo "[1/3] Enviando código para $VPS:$REMOTE_DIR..."
ssh "$VPS" "mkdir -p $REMOTE_DIR"
# .env e backups ficam só no servidor (excluídos também do --delete).
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude 'backups' \
  --exclude '.claude' \
  --exclude 'Fotos_seu_barbeiro' \
  --exclude 'scripts/gravar-telas' \
  --exclude 'agenda-demo.png' \
  "$PROJECT_DIR/" "$VPS:$REMOTE_DIR/"

echo ""
echo "[2/3] Backup, build e subida dos containers..."
ssh "$VPS" REMOTE_DIR="$REMOTE_DIR" APP_DOMAIN="$APP_DOMAIN" \
  OLD_DOMAIN="$OLD_DOMAIN" ADMIN_EMAIL="${ADMIN_EMAIL:-}" bash << 'REMOTE'
  set -euo pipefail
  cd "$REMOTE_DIR"

  FIRST=0
  if [ ! -f .env ]; then
    if [ -z "$ADMIN_EMAIL" ]; then
      echo "  ✗ Primeira instalação: rode ADMIN_EMAIL=voce@exemplo.com ./deploy.sh" >&2
      exit 1
    fi
    echo "  → Primeira instalação: gerando .env com senhas aleatórias..."
    umask 077
    cat > .env << EOF
APP_DOMAIN=$APP_DOMAIN
OLD_DOMAIN=$OLD_DOMAIN
FRONTEND_URL=https://$APP_DOMAIN
PUBLIC_WEB_URL=https://$APP_DOMAIN
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
DEFAULT_SALON=seu-barbeiro
SALON_TIMEZONE=America/Sao_Paulo
NOTIFICATION_WORKER=true
SHOP_NAME="Seu Barbeiro"
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20)
EOF
    FIRST=1
  fi

  # Chaves das notificações push (VAPID): geradas uma vez e mantidas no .env.
  if ! grep -q '^VAPID_PUBLIC_KEY=' .env; then
    echo "  → Gerando chaves das notificações push..."
    KEYS=$(docker run --rm node:24-alpine node -e "
      const e = require('crypto').createECDH('prime256v1'); e.generateKeys();
      const k = e.getPrivateKey(); const p = Buffer.concat([Buffer.alloc(32 - k.length), k]);
      console.log(e.getPublicKey('base64url') + ' ' + p.toString('base64url'))" < /dev/null)
    umask 077
    printf 'VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\nVAPID_SUBJECT=https://%s\n' \
      "${KEYS% *}" "${KEYS#* }" "$APP_DOMAIN" >> .env
  fi

  # Chave que cifra os tokens do salão no banco e frase dos backups: geradas
  # uma vez. Sem a frase, nenhum backup abre: guarde uma cópia fora da VPS.
  if ! grep -q '^SETTINGS_KEY=' .env; then
    umask 077
    printf 'SETTINGS_KEY=%s\n' "$(openssl rand -hex 32)" >> .env
  fi
  if ! grep -q '^BACKUP_PASSPHRASE=' .env; then
    umask 077
    printf 'BACKUP_PASSPHRASE=%s\n' "$(openssl rand -base64 33 | tr -d '/+=' | head -c 40)" >> .env
    echo "  ! Frase dos backups gerada. Copie BACKUP_PASSPHRASE do .env da VPS para um lugar seguro fora dela."
  fi

  echo "  → Backup do banco (cifrado)..."
  bash scripts/backup.sh

  # Backup diário às 03:45 (hora do servidor; 03:00, 03:15 e 03:30 são dos
  # outros sistemas da VPS), além do feito em cada deploy.
  printf '45 3 * * * root cd %s && bash scripts/backup.sh >> /var/log/seu-barbeiro-backup.log 2>&1\n' \
    "$REMOTE_DIR" > /etc/cron.d/seu-barbeiro-backup
  chmod 644 /etc/cron.d/seu-barbeiro-backup

  echo "  → Build e subida (migrações rodam na inicialização do app)..."
  docker compose up -d --build

  echo "  → Aguardando o app ficar saudável..."
  for i in $(seq 1 60); do
    STATUS=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo starting)
    [ "$STATUS" = healthy ] && break
    if [ "$i" = 60 ] || [ "$STATUS" = unhealthy ]; then
      echo "  ✗ App não ficou saudável ($STATUS). Últimos logs:" >&2
      docker compose logs --tail 60 app >&2
      exit 1
    fi
    sleep 3
  done
  echo "  ✓ App saudável"

  if [ "$FIRST" = 1 ]; then
    echo "  → Criando o acesso do dono..."
    docker compose exec -T app npm run db:seed < /dev/null
    PASS=$(grep '^ADMIN_PASSWORD=' .env | cut -d= -f2-)
    umask 077
    printf 'Seu Barbeiro — acesso inicial\nURL: https://%s/login\nSalão: seu-barbeiro\nE-mail: %s\nSenha: %s\n' \
      "$APP_DOMAIN" "$ADMIN_EMAIL" "$PASS" > /root/seu-barbeiro-acesso-inicial.txt
    # A senha não fica no .env nem no ambiente do container.
    sed -i '/^ADMIN_PASSWORD=/d' .env
    docker compose up -d
    echo "  ✓ Acesso inicial salvo em /root/seu-barbeiro-acesso-inicial.txt"
  fi
REMOTE

echo ""
echo "[3/3] Verificando..."
ssh "$VPS" "cd $REMOTE_DIR && docker compose ps"

echo ""
echo "======================================"
echo "  DEPLOY CONCLUÍDO!"
echo "  Acesse: https://$APP_DOMAIN"
echo "======================================"
