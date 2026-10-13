#!/bin/bash
# Backup diário do Seu Barbeiro, rodado na VPS pelo cron (instalado pelo deploy.sh)
# e antes de cada deploy.
#
# - pg_dumpall: todos os bancos do Postgres (um por salão) num arquivo só;
# - cifrado com AES-256 (openssl, PBKDF2) usando BACKUP_PASSPHRASE do .env.
#   Sem essa frase o arquivo não abre: guarde uma cópia dela FORA da VPS;
# - mantém os últimos 14 na VPS (backups/);
# - envia a cópia (já cifrada) para o Google Drive pelo rclone, no mesmo
#   remoto "gdrive:" do Pedeli e do AmigoFit (pasta seu-barbeiro-backups, ou
#   BACKUP_REMOTE no .env) e apaga lá as de mais de 60 dias.
#
# Restaurar (num Postgres vazio):
#   openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in ARQUIVO.sql.gz.enc \
#     | gunzip | docker compose exec -T postgres psql -U seubarbeiro -d postgres
set -euo pipefail
cd "$(dirname "$0")/.."

env_value() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
export BACKUP_PASSPHRASE="$(env_value BACKUP_PASSPHRASE)"
REMOTE="$(env_value BACKUP_REMOTE || true)"
REMOTE="${REMOTE:-gdrive:seu-barbeiro-backups}"
if [ -z "$BACKUP_PASSPHRASE" ]; then
  echo "BACKUP_PASSPHRASE não está no .env; rode o deploy.sh para gerar." >&2
  exit 1
fi
if [ -z "$(docker compose ps -q postgres 2>/dev/null)" ]; then
  echo "Postgres não está rodando; nada a copiar."
  exit 0
fi

mkdir -p backups && chmod 700 backups
FILE="backups/seu-barbeiro-$(date +%Y%m%d-%H%M%S).sql.gz.enc"
umask 077
# < /dev/null: o exec não pode consumir o stdin de quem chamou (deploy.sh).
docker compose exec -T postgres pg_dumpall -U seubarbeiro --clean --if-exists < /dev/null \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$FILE"
# Confere que o arquivo abre antes de apagar os antigos.
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$FILE" | gunzip -t
echo "Backup: $FILE ($(du -h "$FILE" | cut -f1))"

ls -1t backups/*.sql.gz.enc 2>/dev/null | tail -n +15 | xargs -r rm -f
# Backups antigos, sem cifra, de antes de 13/10/2026.
ls -1t backups/*.sql.gz 2>/dev/null | xargs -r rm -f

if command -v rclone > /dev/null && rclone listremotes | grep -q "^${REMOTE%%:*}:$"; then
  rclone copy "$FILE" "$REMOTE/"
  rclone delete "$REMOTE/" --min-age 60d --include 'seu-barbeiro-*.sql.gz.enc' || true
  echo "Cópia cifrada enviada para $REMOTE"
else
  echo "AVISO: destino $REMOTE indisponível; o backup só existe nesta VPS." >&2
fi
