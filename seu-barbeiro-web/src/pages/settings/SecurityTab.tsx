import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/axios'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useAuth } from '../../contexts/auth-state'

/*
  Segurança da conta: encerrar as sessões abertas em todos os aparelhos e,
  para o dono, o registro das ações sensíveis (LGPD): quem entrou, quem baixou
  ou removeu dados de cliente, quem mudou acessos e configurações.
*/

type AuditRow = {
  id: string
  action: string
  adminName: string | null
  entity: string | null
  entityId: string | null
  createdAt: string
}

const ACTIONS: Record<string, string> = {
  'login.success': 'Entrou no painel',
  'login.locked': 'Acesso bloqueado por senhas erradas',
  'sessions.revoke': 'Encerrou as sessões em todos os aparelhos',
  'settings.update': 'Alterou configurações',
  'user.create': 'Criou um acesso',
  'user.update': 'Alterou um acesso',
  'client.export': 'Baixou os dados de um cliente',
  'client.anonymize': 'Removeu os dados pessoais de um cliente',
  'client.delete': 'Excluiu um cliente',
  'client.records.view': 'Abriu fichas técnicas de um cliente',
}

export function SecurityTab() {
  const { admin, logout } = useAuth()
  const isOwner = admin?.role === 'OWNER'
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)

  const { data: rows, isLoading } = useQuery({
    queryKey: ['audit', page],
    queryFn: async () => (await api.get<AuditRow[]>('/operations/audit', { params: { page } })).data,
    enabled: isOwner,
  })

  async function logoutEverywhere() {
    if (!confirm('Encerrar o acesso em todos os aparelhos, inclusive neste?')) return
    setBusy(true)
    try {
      await api.post('/auth/logout-all')
    } finally {
      logout()
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-base font-semibold text-zinc-900">Sessões abertas</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Perdeu o celular ou entrou num computador que não é seu? Encerre o acesso em todos os
          aparelhos. Trocar a senha de alguém também encerra as sessões dessa pessoa.
        </p>
        <Button variant="secondary" className="mt-4" disabled={busy} onClick={logoutEverywhere}>
          Sair de todos os aparelhos
        </Button>
      </section>

      {isOwner && (
        <section>
          <h2 className="text-base font-semibold text-zinc-900">Registro de ações</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Entradas no painel e ações sobre dados de clientes, acessos e configurações. Guardado
            por 5 anos.
          </p>
          {isLoading ? (
            <div className="flex h-24 items-center justify-center"><Spinner /></div>
          ) : !rows?.length ? (
            <p className="mt-4 text-sm text-zinc-500">Nada registrado ainda.</p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-200 border-y border-zinc-200 text-sm">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                  <span className="text-zinc-900">
                    {ACTIONS[r.action] ?? r.action}
                    <span className="text-zinc-500"> · {r.adminName ?? 'sem login'}</span>
                  </span>
                  <span className="hora text-xs text-zinc-500">
                    {new Date(r.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Mais recentes
            </Button>
            <Button variant="ghost" disabled={(rows?.length ?? 0) < 50} onClick={() => setPage((p) => p + 1)}>
              Mais antigos
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
