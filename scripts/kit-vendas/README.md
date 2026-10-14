# Kit de prospecção — Seu Barbeiro (one-pager, posts e Reels)

Peças geradas a partir de HTML com a identidade oficial (guia de marca v2): IBM Plex Sans/Mono,
Azul Navalha `#15233F`, Espuma `#F5F4F0`, Azul Toalha `#C9DAEE` e o Vermelho Poste `#D8462A` só na "linha da hora".
Telas reais com borda fina e legenda (sem moldura de navegador). Dados da barbearia-exemplo "Barbearia Aurora".
Sem preço do sistema em lugar nenhum: o CTA é "Agende uma demonstração" pelo WhatsApp (32) 99857-8057.

Requisitos: Python 3 com `playwright` (Chromium), `Pillow`, `qrcode` e `ffmpeg`.

    cd scripts/kit-vendas
    mkdir -p out
    python3 render.py one-pager.html 794 1123 out/one-pager.png out/one-pager.pdf 2
    python3 render.py post-1-link.html 1080 1350 out/post-1-link.png - 1
    python3 render.py post-2-agenda.html 1080 1350 out/post-2-agenda.png - 1
    python3 render.py post-3-comissao.html 1080 1350 out/post-3-comissao.png - 1
    cd reels && ./montar.sh        # gera out/reels-do-link-a-comissao.mp4 e out/reels-capa.jpg

O Reels usa `seu-barbeiro-web/public/videos/agenda.mp4` (já no repositório; outro caminho: `VIDEOS_REPO=...`)
e as gravações novas em `assets/videos/`. Saída em `../out` (mude com `OUT=...`).
`reels/gen.py` gera as cenas; as posições das telas nele precisam bater com os recortes do `montar.sh`.

Recortes de tela em `assets/` vêm das capturas 1440x900 (2x) e 390x844 (2x). A agenda foi recortada só nas
3 colunas inteiras. Para trocar texto, edite o HTML e rode de novo. O QR (`assets/qr.svg`) abre o WhatsApp
com a mensagem "Quero agendar uma demonstração do Seu Barbeiro".
