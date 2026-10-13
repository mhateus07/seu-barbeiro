const R = require('./rec-common.cjs')
const { execFileSync } = require('child_process')
const OUT = __dirname + '/.work'
;(async () => {
  execFileSync('sh', ['-c', `docker exec -i salon-operations-test pg_restore -U postgres -d salon_rec --clean --if-exists --single-transaction < ${OUT}/base.dump`])
  const b = await R.chromium.launch({ channel: 'chrome' })
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
  const auth = await R.token()
  await ctx.addInitScript(([t, a]) => { localStorage.setItem('salon', 'demo'); localStorage.setItem('token', t); localStorage.setItem('admin', JSON.stringify(a)); localStorage.setItem('sb-theme', 'light') }, [auth.token, auth.admin])
  await ctx.addInitScript(R.CURSOR_JS)
  const page = await ctx.newPage()
  await page.clock.install({ time: R.tomorrowAt(10, 40) }); await page.clock.resume()
  await page.goto(R.WEB + '/operacao', { waitUntil: 'networkidle' })
  await page.mouse.move(1180, 760)
  await R.sleep(1500)
  // Antes de gravar, acha um atendimento que ainda pode ser confirmado (os
  // dados de demonstração variam a cada geração).
  const cards = page.getByText(/^\d{2}:\d{2}–\d{2}:\d{2}$/).filter({ visible: true })
  const lucas = await page.getByText('Lucas Andrade', { exact: true }).filter({ visible: true }).first().boundingBox()
  let target = null
  for (let i = 0, n = await cards.count(); i < n && target === null; i++) {
    const box = await cards.nth(i).boundingBox()
    // Fora da coluna do Lucas (onde a cena agenda) e dentro da tela.
    if (!box || box.x > lucas.x - 120 || box.y > 820) continue
    await cards.nth(i).click().catch(() => {})
    await R.sleep(600)
    if (await page.getByLabel('Detalhes do atendimento').getByRole('button', { name: 'Confirmar', exact: true }).count())
      target = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const close = page.getByLabel('Fechar atendimento')
    if (await close.count()) await close.click()
    await R.sleep(400)
  }
  if (target === null) throw new Error('Nenhum atendimento para confirmar nos dados de demonstração')
  // Serviço que o Lucas faz (de preferência corte + barba), lido da própria API.
  const agenda = await (await fetch(`${R.API}/operations/agenda?date=${new Date(R.tomorrowAt(10, 40)).toLocaleDateString('sv-SE')}`, {
    headers: { authorization: `Bearer ${auth.token}`, 'x-salon': 'demo' },
  })).json()
  const lucasBarber = agenda.barbers.find((x) => x.name === 'Lucas Andrade')
  const offered = agenda.services.filter((x) => !lucasBarber.serviceIds.length || lucasBarber.serviceIds.includes(x.id))
  const serviceName = (offered.find((x) => x.name === 'Corte + barba') || offered[0]).name
  await page.mouse.move(1180, 760)
  await R.sleep(800)
  const rec = await R.startRec(page, OUT + '/frames-agenda')
  await R.wait(1300)
  // Clica num horário livre do Lucas às 11:15 e agenda um serviço dele. A
  // posição sai da tela (cabeçalho do profissional e marcas das horas), para
  // não depender do tamanho da fonte.
  const col = lucas
  const h11 = await page.getByText('11:00', { exact: true }).first().boundingBox()
  const h12 = await page.getByText('12:00', { exact: true }).first().boundingBox()
  await R.moveTo(page, col.x + col.width / 2, h11.y + (h12.y - h11.y) * 0.25 + 10, 900)
  await R.wait(250)
  await page.mouse.down(); await R.wait(90); await page.mouse.up()
  await R.wait(900)
  const dlg = page.locator('form').filter({ has: page.locator('select[name=clientId]') })
  await R.clickSmooth(page, dlg.locator('select[name=clientId]'), { ms: 700 })
  await dlg.locator('select[name=clientId]').selectOption({ index: 3 })
  await R.wait(600)
  await R.clickSmooth(page, dlg.locator('select[name=serviceId]'), { ms: 600 })
  await dlg.locator('select[name=serviceId]').selectOption({ label: serviceName })
  await R.wait(700)
  await R.clickSmooth(page, dlg.getByRole('button', { name: 'Confirmar' }), { ms: 650 })
  await R.wait(1800)
  // Abre o atendimento ainda não confirmado escolhido antes de gravar.
  const panel = page.getByLabel('Detalhes do atendimento')
  const confirm = panel.getByRole('button', { name: 'Confirmar', exact: true })
  await R.moveTo(page, target.x, target.y, 800)
  await R.wait(200)
  await page.mouse.down(); await R.wait(90); await page.mouse.up()
  await R.wait(1500)
  await R.clickSmooth(page, confirm, { ms: 700 })
  await R.wait(900)
  const c = page.locator('section[role=dialog] form button', { hasText: 'Confirmar' })
  if (await c.count()) { await R.clickSmooth(page, c, { ms: 600 }); await R.wait(1500) }
  await R.wait(1200)
  await R.clickSmooth(page, page.getByLabel('Fechar atendimento'), { ms: 700 })
  await R.wait(700)
  await R.moveTo(page, 1180, 760, 900)
  await R.wait(1200)
  console.log(await rec.stop())
  R.encode(OUT + '/frames-agenda', OUT + '/agenda', { width: 1920 })
  await b.close()
})().catch(async (e) => { console.error(e.message.slice(0,300)); process.exit(1) })
