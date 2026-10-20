import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/*
  Endereços externos que o servidor chama a pedido de um salão (provedor de
  WhatsApp, avisos push). Só HTTPS e nunca a rede interna da VPS: sem isso,
  quem configura o salão poderia usar o servidor para sondar outros serviços.
*/

function isPrivateAddress(address: string) {
  if (isIP(address) === 6) {
    const a = address.toLowerCase()
    if (a.startsWith('::ffff:')) return isPrivateAddress(a.slice(7))
    return a === '::' || a === '::1' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a)
  }
  const [a, b] = address.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

/** Confere só o texto do endereço (ao salvar a configuração). */
export function checkOutboundUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'Endereço inválido'
  }
  if (url.protocol !== 'https:') return 'Use um endereço https://'
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) ? isPrivateAddress(host) : !host.includes('.') || host.endsWith('.local') || host === 'localhost')
    return 'Endereço não permitido'
  return null
}

/**
 * Antes de cada chamada: confere o texto e, em produção, para onde o nome
 * aponta no DNS. Lança erro com mensagem genérica, que pode ir para o painel.
 */
export async function assertOutboundUrl(value: string) {
  const problem = checkOutboundUrl(value)
  if (problem) throw new Error(problem)
  if (process.env.NODE_ENV !== 'production') return
  const host = new URL(value).hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return
  const addresses = await lookup(host, { all: true }).catch(() => [])
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address)))
    throw new Error('Endereço não permitido')
}
