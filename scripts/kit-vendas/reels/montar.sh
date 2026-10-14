#!/usr/bin/env bash
# Monta o Reels "do link à comissão" (1080x1920, ~27 s, H.264 + AAC mudo).
# Rode dentro de scripts/kit-vendas/reels. Requer python3 (playwright, Pillow) e ffmpeg.
set -euo pipefail
# agenda.mp4 já está no repositório; as duas gravações novas ficam em ../assets/videos
V=${VIDEOS_REPO:-../../../seu-barbeiro-web/public/videos}
N=../assets/videos
O=${OUT:-../out}
python3 gen.py
for k in c1 c2 c3 c4 c5 c6; do python3 ../render.py $k.html 1080 1920 $k.png - 1; done
python3 -c "
from PIL import Image, ImageDraw
def mask(w,h,r,name):
    m=Image.new('L',(w,h),0); ImageDraw.Draw(m).rounded_rectangle((0,0,w-1,h-1),r,fill=255); m.save(name)
mask(410,887,22,'m2.png'); mask(960,737,14,'m3.png'); mask(960,820,14,'m4.png'); mask(960,696,14,'m5.png')"
still(){ ffmpeg -v error -y -loop 1 -framerate 30 -t $3 -i $2 -vf format=yuv420p -c:v libx264 -crf 16 $1.mp4; }
# vid saida fundo duracao video "filtro" x y mascara
vid(){ ffmpeg -v error -y -loop 1 -framerate 30 -t $3 -i $2 -i $4 -loop 1 -framerate 30 -t $3 -i $8 -filter_complex \
  "[1:v]$5,fps=30,tpad=stop_mode=clone:stop_duration=10,format=rgba[v];[2:v]format=gray[m];[v][m]alphamerge[va];[0:v][va]overlay=$6:$7:shortest=1,format=yuv420p" -t $3 -c:v libx264 -crf 16 $1.mp4; }
still s1 c1.png 3
# 1. cliente agenda no celular (390x844 -> 410x887)
vid s2 c2.png 7 $N/seu-barbeiro-agendamento-celular.mp4 "trim=0:12.6,setpts=(PTS-STARTPTS)/1.8,scale=410:887:flags=lanczos" 335 568 m2.png
# 2. agenda: só as 3 colunas inteiras (a 4a fica de fora)
vid s3 c3.png 5 $V/agenda.mp4 "trim=8.4:13.4,setpts=PTS-STARTPTS,crop=904:694:336:380,scale=960:737:flags=lanczos" 60 620 m3.png
# 3. atendimento aberto com a comanda (recorte da gaveta lateral)
vid s4 c4.png 5 $V/agenda.mp4 "trim=17.8:22.8,setpts=PTS-STARTPTS,crop=770:658:1150:20,scale=960:820:flags=lanczos" 60 580 m4.png
# 4. financeiro (resumo) e comissões, parando na tabela de comissões
vid s5 c5.png 5.5 $N/seu-barbeiro-gestao-financeiro.mp4 "split[a][b];[a]trim=3.6:5.0,setpts=PTS-STARTPTS[a1];[b]trim=6.95:8.0,setpts=PTS-STARTPTS[b1];[a1][b1]concat=n=2:v=1,crop=800:580:266:92,scale=960:696:flags=lanczos" 60 620 m5.png
still s6 c6.png 3.5
mkdir -p $O
ffmpeg -v error -y -i s1.mp4 -i s2.mp4 -i s3.mp4 -i s4.mp4 -i s5.mp4 -i s6.mp4 -f lavfi -t 27 -i anullsrc=r=44100:cl=stereo -filter_complex \
"[0][1]xfade=transition=fade:duration=0.4:offset=2.6[a];[a][2]xfade=transition=slideleft:duration=0.4:offset=9.2[b];[b][3]xfade=transition=slideleft:duration=0.4:offset=13.8[c];[c][4]xfade=transition=slideleft:duration=0.4:offset=18.4[d];[d][5]xfade=transition=fade:duration=0.4:offset=23.5,format=yuv420p[v]" \
-map "[v]" -map 6:a -c:v libx264 -crf 19 -preset slow -profile:v high -movflags +faststart -c:a aac -b:a 128k -shortest $O/reels-do-link-a-comissao.mp4
ffmpeg -v error -y -i $O/reels-do-link-a-comissao.mp4 -frames:v 1 -q:v 2 $O/reels-capa.jpg
rm -f s?.mp4 c?.png c?.html m?.png
