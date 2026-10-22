# Belaza — guia de marca (versão 1, outubro de 2026)

Belaza é a marca do sistema para **salões de beleza**. O sistema é o mesmo do Seu
Barbeiro (agenda por profissional, clientes, comanda, Pix e caixa); o salão escolhe o
segmento em Configurações → Informações e o painel e as páginas do cliente passam a
mostrar a marca Belaza. Barbearias continuam com o Seu Barbeiro.

O nome se escreve sempre **Belaza**, com a inicial maiúscula.

## Logo

Mesma construção da versão 2 do Seu Barbeiro, para as duas marcas parecerem da mesma
casa:

- **Monograma**: a letra `B` em IBM Plex Serif SemiBold, centrada num quadrado de
  cantos pouco arredondados (raio de 1/8 do lado).
- **Nome**: `Belaza` em IBM Plex Serif SemiBold. A serifa é usada só no logo.
- Uma tinta só: Ameixa com a letra em Linho no claro; Linho com a letra em Ameixa no
  escuro.

Arquivos nesta pasta: `belaza-horizontal.svg` e `-negativo` (versão principal),
`belaza-vertical.svg`, `belaza-simbolo.svg` e `-negativo`, `belaza-icone-app.svg` e
`belaza-logotipo.svg`. Os ícones do app ficam em `seu-barbeiro-web/public/icons/belaza-*`.

As regras de uso são as do Seu Barbeiro: use os arquivos (as letras já estão em
desenho), meia altura do monograma de área livre, monograma com no mínimo 16px, sem
girar, sombra, contorno, degradê, brilho ou dourado.

## Cor

| Cor | Valor | Uso |
| --- | --- | --- |
| Ameixa | `#3A1C32` | Logo, botões principais, barra lateral do painel. |
| Linho | `#F7F3F0` | Papel e logo negativo. |
| Rosé | `#E7D0E0` | Fundos suaves de apoio (no lugar do Azul Toalha). |
| Cobre | `#B5532F` | Destaque: linha da hora atual na agenda. Nunca botão nem erro. |

No painel, as cores entram redefinindo as mesmas variáveis do tema do Seu Barbeiro
(`seu-barbeiro-web/src/index.css`, bloco `data-brand='belaza'`). Cada tom neutro tem a
luminosidade do tom equivalente do Seu Barbeiro, então os contrastes já conferidos
continuam valendo, no claro e no escuro.

## Tipografia e forma

Iguais às do Seu Barbeiro: IBM Plex Sans no texto, IBM Plex Mono em horários e valores,
IBM Plex Serif só no logo. Valem as mesmas proibições: nada com cara de gerado (texto em
degradê, brilho, vidro fosco, emoji, moldura falsa) e nenhum clichê de "salão feminino"
(rosa-chiclete, flor, silhueta, letra cursiva).
