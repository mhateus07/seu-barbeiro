import { expect, test, type Page } from '@playwright/test'

/** Próximo dia útil, a pelo menos 1 dia: o expediente padrão fecha aos domingos. */
function nextWorkday() {
  const d = new Date()
  do d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6)
  return d.toLocaleDateString('sv-SE')
}

async function untilDate(page: Page) {
  await page.goto('/agendar?salon=demo')
  await page.getByText('Corte e finalização').first().click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByText('Camila').first().click()
  await page.getByRole('button', { name: 'Continuar' }).click()
}

test('site apresenta o produto para barbearias', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('sistema da barbearia inteira')).toBeVisible()
  await expect(page.getByText(/salão de beleza/i)).toHaveCount(0)
})

test('cliente agenda pelo link', async ({ page }) => {
  await bookOnline(page, 'Paulo Teste', nextWorkday())
})

test('falha de rede nos horários oferece nova tentativa', async ({ page }) => {
  await untilDate(page)
  await page.route('**/slots**', (route) => route.abort())
  await page.locator('input[type="date"]').fill(nextWorkday())
  await expect(page.getByText('Não conseguimos carregar os horários')).toBeVisible()
  await page.unroute('**/slots**')
  await page.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect(page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first()).toBeVisible()
})

async function bookOnline(page: Page, name: string, day: string) {
  await untilDate(page)
  await page.locator('input[type="date"]').fill(day)
  await page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first().click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByPlaceholder('Seu nome').fill(name)
  await page
    .getByPlaceholder('(32) 99999-9999')
    .fill(`3298${String(Date.now()).slice(-7)}`)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Confirmar agendamento' }).click()
  await expect(page.getByText('Horário confirmado')).toBeVisible()
}

async function login(page: Page) {
  await page.goto('/login?salon=demo')
  await page.getByPlaceholder('voce@seusalao.com').fill('demo@salon.local')
  await page.getByPlaceholder('Sua senha').fill('Demo-salon-2026')
  await page.getByRole('button', { name: /entrar/i }).click()
  await page.waitForURL(/\/(operacao|painel|dashboard)/)
}

test('dono entra e vê a agenda', async ({ page }) => {
  await login(page)
  await page.goto('/operacao')
  await expect(page.getByRole('button', { name: 'Novo atendimento' })).toBeVisible()
})

test('dono abre o caixa, atende, recebe e fecha', async ({ page }) => {
  const day = nextWorkday()
  const stamp = Date.now()
    .toString()
    .slice(-5)
    .replace(/\d/g, (d) => 'abcdefghij'[Number(d)])
  const client = `Rui Caixa ${stamp}`
  await bookOnline(page, client, day)
  await login(page)

  await page.goto('/caixa')
  const open = page.getByRole('button', { name: 'Abrir caixa' })
  const close = page.getByRole('button', { name: 'Fechar caixa' })
  await expect(open.or(close)).toBeVisible()
  // Uma tentativa anterior pode ter deixado o caixa aberto.
  if (await open.isVisible()) {
    await page.getByPlaceholder('0,00').first().fill('100')
    await open.click()
  }
  await expect(close).toBeVisible()

  await page.goto('/operacao')
  await page.getByLabel('Ir para a data').evaluate((el, value) => {
    // Em telas largas o campo fica oculto (há calendário ao lado): define a data direto.
    const input = el as HTMLInputElement
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, day)
  await page.getByText(client).first().click()
  const panel = page.getByRole('dialog', { name: 'Detalhes do atendimento' })
  const dialog = page.locator('[role="dialog"][aria-modal="true"]')
  for (const step of ['Confirmar', 'Iniciar', 'Concluir']) {
    await panel.getByRole('button', { name: step, exact: true }).click()
    await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }

  await panel.getByRole('button', { name: 'Receber sinal / saldo' }).click()
  await dialog.locator('select[name="method"]').selectOption('CASH')
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText(/caixa está fechado/)).toHaveCount(0)

  await page.goto('/caixa')
  await close.click()
  const closing = page.getByRole('dialog').first()
  await closing.locator('input[type="number"]').first().fill('0')
  await closing.getByRole('button', { name: 'Fechar caixa' }).click()
  await expect(page.getByText(/Caixa fechado com falta/)).toBeVisible()
})
