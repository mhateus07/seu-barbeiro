#!/bin/sh
# Copia a BACKUP_PASSPHRASE do .env da VPS para a área de transferência do Mac,
# sem mostrar na tela. Cole num gerenciador de senhas: sem ela, nenhum backup
# do Seu Barbeiro (na VPS ou no Google Drive) abre.
set -eu
ssh -o BatchMode=yes impulsio "grep '^BACKUP_PASSPHRASE=' /opt/seu-barbeiro/.env | cut -d= -f2-" | tr -d '\n' | pbcopy
echo "Frase dos backups copiada. Cole no gerenciador de senhas e depois copie outra coisa por cima."
