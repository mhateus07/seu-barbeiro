#!/bin/sh
# Confere, na VPS, que o backup mais recente do Google Drive restaura:
# baixa, decifra com a BACKUP_PASSPHRASE, restaura num Postgres temporário e
# conta os atendimentos. Também confere que sem a frase o arquivo não abre.
# Não toca no banco de produção. Uso: sh scripts/testar-backup.sh
set -eu
ssh -o BatchMode=yes impulsio 'set -eu
cd /opt/seu-barbeiro
export BACKUP_PASSPHRASE="$(grep "^BACKUP_PASSPHRASE=" .env | cut -d= -f2-)"
REMOTE="$(grep "^BACKUP_REMOTE=" .env | cut -d= -f2- || true)"; REMOTE="${REMOTE:-gdrive:seu-barbeiro-backups}"
T=$(mktemp -d); trap "rm -rf $T; docker rm -f sb-restore-test >/dev/null 2>&1 || true" EXIT
LAST=$(rclone lsf "$REMOTE" --include "seu-barbeiro-*.sql.gz.enc" | sort | tail -1)
[ -n "$LAST" ] || { echo "ERRO: nenhum backup em $REMOTE"; exit 1; }
rclone copy "$REMOTE/$LAST" "$T/"
echo "Baixado do Drive: $LAST"
if openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:senha-errada -in "$T/$LAST" 2>/dev/null | gunzip -t 2>/dev/null; then
  echo "ERRO: abriu sem a frase"; exit 1
else echo "Sem a frase: não abre (ok)"; fi
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$T/$LAST" | gunzip > "$T/dump.sql"
docker run -d --name sb-restore-test -e POSTGRES_PASSWORD=t -e POSTGRES_USER=seubarbeiro postgres:17-alpine >/dev/null
for i in $(seq 1 30); do docker exec sb-restore-test pg_isready -U seubarbeiro >/dev/null 2>&1 && break; sleep 1; done
sleep 2
docker exec -i sb-restore-test psql -q -U seubarbeiro -d postgres < "$T/dump.sql" > /dev/null 2>&1 || true
N=$(docker exec sb-restore-test psql -tA -U seubarbeiro -d seu_barbeiro -c "select count(*) from appointments")
C=$(docker exec sb-restore-test psql -tA -U seubarbeiro -d seu_barbeiro -c "select count(*) from clients")
echo "Restaurado num Postgres temporário: $N atendimentos, $C clientes"
[ "$C" -gt 0 ] || { echo "ERRO: restauração vazia"; exit 1; }
echo "Backup do Drive ok."'
