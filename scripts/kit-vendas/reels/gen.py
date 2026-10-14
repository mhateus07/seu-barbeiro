# Gera os fundos (HTML 1080x1920) de cada cena do Reels. Rode dentro de reels/.
# As posições (x, y, w, h) das telas precisam bater com o montar.sh.
scenes = {
    'c1': dict(kind='hook'),
    'c2': dict(n='1', t='O cliente marca sozinho pelo link', s='Escolhe serviço, barbeiro e horário livre. Sem baixar app.',
               x=335, y=568, w=410, h=887, cap='Agendamento online no celular do cliente', r=22),
    'c3': dict(n='2', t='A agenda da equipe numa tela só', s='Uma coluna por barbeiro. Clique no horário livre para marcar.',
               x=60, y=620, w=960, h=737, cap='Agenda do dia, com a linha da hora atual', r=14),
    'c4': dict(n='3', t='Cada atendimento tem sua comanda', s='Serviço, produto vendido, desconto e recebimento.',
               x=60, y=580, w=960, h=820, cap='Atendimento aberto ao lado da agenda', r=14),
    'c5': dict(n='4', t='A comissão já sai calculada', s='Receitas, despesas e quanto pagar a cada barbeiro, com os vales descontados.',
               x=60, y=620, w=960, h=696, cap='Financeiro: resumo do mês e comissões', r=14, linha_unica=True),
    'c6': dict(kind='end'),
}
head = '''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../base.css"><style>
body{width:1080px;height:1920px;overflow:hidden;position:relative;background:var(--navalha);color:var(--espuma)}
.a{position:absolute}
h1{font-weight:600;letter-spacing:-0.025em}
</style></head><body>'''
for k, c in scenes.items():
    if c.get('kind') == 'hook':
        body = '''<img class="a" src="../assets/seu-barbeiro-horizontal-negativo.svg" style="left:90px;top:220px;height:58px">
<h1 class="a" style="left:90px;right:90px;top:600px;font-size:124px;line-height:1.02">Sua agenda ainda mora no caderno?</h1>
<div class="a" style="left:90px;right:0;top:1060px;display:flex;align-items:center;gap:22px">
  <span class="mono" style="font-size:30px;color:rgba(245,244,240,.7)">10:40</span>
  <div class="hora" style="flex:1"></div></div>
<p class="a" style="left:90px;right:90px;top:1130px;font-size:44px;line-height:1.35;color:rgba(245,244,240,.74)">Veja como fica a barbearia com agenda, comanda e caixa no mesmo sistema.</p>'''
    elif c.get('kind') == 'end':
        items = ['Cliente marca pelo link, sem baixar app', 'Agenda de cada barbeiro numa tela', 'Comissão, vales e caixa na conta']
        li = ''.join(f'<div style="display:flex;gap:26px;align-items:baseline;padding:18px 0;border-bottom:1px solid var(--line-dark)"><span class="mono" style="color:var(--toalha);font-size:30px">0{i+1}</span><span>{t}</span></div>' for i, t in enumerate(items))
        body = f'''<img class="a" src="../assets/seu-barbeiro-horizontal-negativo.svg" style="left:90px;top:250px;height:70px">
<h1 class="a" style="left:90px;right:90px;top:430px;font-size:92px;line-height:1.05">Agenda, clientes e caixa da barbearia no mesmo sistema.</h1>
<div class="a" style="left:90px;right:90px;top:860px;font-size:38px;font-weight:500;border-top:1px solid var(--line-dark)">{li}</div>
<div class="a" style="left:90px;right:90px;top:1220px;background:var(--espuma);color:var(--navalha);border-radius:8px;padding:38px 44px">
  <div style="font-size:44px;font-weight:600">Agende uma demonstração</div>
  <div class="mono" style="font-size:36px;font-weight:500;margin-top:14px">seubarbeiro.impulsiodigital.com</div>
  <div style="font-size:30px;margin-top:10px;color:var(--muted)">WhatsApp <span class="mono">(32) 99857-8057</span></div>
</div>'''
    else:
        x, y, w, h, r = c['x'], c['y'], c['w'], c['h'], c['r']
        body = f'''<div class="a mono" style="left:90px;top:210px;font-size:30px;color:var(--toalha)"><b style="font-weight:600;color:var(--espuma)">{c['n']}</b> de 4</div>
<h1 class="a" style="left:90px;right:90px;top:262px;font-size:74px;line-height:1.04">{c['t']}</h1>
<p class="a" style="left:90px;right:90px;top:{262 + (88 if c.get('linha_unica') else 166)}px;font-size:36px;line-height:1.3;color:rgba(245,244,240,.72)">{c['s']}</p>
<div class="a" style="left:{x-2}px;top:{y-2}px;width:{w+4}px;height:{h+4}px;border-radius:{r+2}px;background:rgba(245,244,240,.22)"></div>
<div class="a" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;border-radius:{r}px;background:#fff"></div>
<div class="a" style="left:{x if w > 600 else 90}px;width:{w if w > 600 else 900}px;top:{y+h+26}px;font-size:24px;color:rgba(245,244,240,.6);text-align:{'center' if w < 600 else 'left'}">{c['cap']} · dados ilustrativos</div>'''
    open(f'{k}.html', 'w').write(head + body + '</body></html>')
