const R = require('./rec-common.cjs')
const OUT = __dirname + '/.work'
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
async function scrollBy(page, dy, ms = 900) {
  const n = Math.max(1, Math.round(ms / 16)); let done = 0
  for (let i = 1; i <= n; i++) { const t = Math.round(dy * ease(i / n)); await page.mouse.wheel(0, t - done); done = t; await R.wait(ms / n) }
}
async function toTop(page) {
  const y = await page.evaluate(() => scrollY)
  if (y > 0) await scrollBy(page, -y, 700)
}
async function reveal(page, loc) {
  const box = await loc.boundingBox(); const vh = 737
  if (box.y + box.height > vh - 20) await scrollBy(page, box.y + box.height - vh + 120, 800)
  if (box.y < 0) await scrollBy(page, box.y - 120, 800)
}
async function tap(page, loc, ms = 650) { await reveal(page, loc); await R.clickSmooth(page, loc, { ms }) }
;(async () => {
  const b = await R.chromium.launch({ channel: 'chrome' })
  const ctx = await b.newContext({ viewport: { width: 390, height: 737 }, deviceScaleFactor: 2 })
  await ctx.addInitScript(() => { window.__touchMode = true })
  await ctx.addInitScript(R.CURSOR_JS)
  const page = await ctx.newPage()
  await page.goto(R.WEB + '/agendar?salon=demo', { waitUntil: 'networkidle' })
  await page.mouse.move(300, 600)
  await R.sleep(1200)
  const rec = await R.startRec(page, OUT + '/frames-agendamento')
  await R.wait(1100)
  await tap(page, page.getByRole('button', { name: /Corte \+ barba/ }).first())
  await R.wait(900)
  await tap(page, page.getByRole('button', { name: /Continuar/ }))
  await R.wait(500); await toTop(page); await R.wait(500)
  await tap(page, page.getByRole('button', { name: /Rafael Souza/ }).first())
  await R.wait(700)
  const cont = page.getByRole('button', { name: /Continuar/ })
  if (await cont.isEnabled()) { await tap(page, cont); await R.wait(400) }
  await toTop(page); await R.wait(400)
  const date = page.locator('input[type=date]')
  await tap(page, date)
  const d = new Date(); d.setDate(d.getDate() + 1)
  await date.fill(d.toLocaleDateString('sv-SE'))
  await R.wait(1300)
  // Fim da tarde, se estiver livre nos dados de demonstração; senão, o último horário livre.
  const late = page.getByRole('button', { name: '18:30', exact: true })
  const slot = (await late.count()) ? late : page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).last()
  await tap(page, slot)
  await R.wait(700)
  await tap(page, page.getByRole('button', { name: /Continuar/ }))
  await R.wait(500); await toTop(page); await R.wait(400)
  await tap(page, page.getByPlaceholder('Seu nome'))
  await R.typeSlow(page, 'Lucas Pereira', 60)
  await R.wait(300)
  const phone = page.locator('input[type=tel]').first()
  await tap(page, phone)
  await R.typeSlow(page, '32900001234', 60)
  await R.wait(500)
  await tap(page, page.getByRole('button', { name: /Continuar/ }))
  await R.wait(600); await toTop(page); await R.wait(900)
  await tap(page, page.getByRole('button', { name: /Confirmar agendamento/ }))
  await R.wait(600); await toTop(page)
  await R.wait(2600)
  console.log(await rec.stop())
  R.encode(OUT + '/frames-agendamento', OUT + '/agendamento', { width: 660, crf: 23 })
  await b.close()
})().catch((e) => { console.error(e.message.slice(0, 400)); process.exit(1) })
