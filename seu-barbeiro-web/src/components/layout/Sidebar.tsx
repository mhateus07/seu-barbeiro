import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/axios'
import { bookingLink } from '../../api/salon'
import { useAuth } from '../../contexts/auth-state'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { BrandLogo } from '../ui/BrandMark'
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Scissors,
  Sparkles,
  Wallet,
  ImageIcon,
  Settings,
  X,
  Link2,
  Check,
  ExternalLink,
  ClipboardList,
  Repeat,
  Landmark,
} from 'lucide-react'
import { formatPhone } from '../../utils/formatPhone'

const navItems = [
  { to: '/operacao', label: 'Agenda e operação', icon: CalendarDays },
  { to: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { to: '/agendamentos', label: 'Agendamentos', icon: ClipboardList },
  { to: '/caixa', label: 'Caixa', icon: Landmark },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/assinaturas', label: 'Assinaturas', icon: Repeat },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/barbeiros', label: 'Profissionais', icon: Scissors },
  { to: '/servicos', label: 'Serviços', icon: Sparkles },
  { to: '/vitrine', label: 'Vitrine', icon: ImageIcon },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { admin } = useAuth()
  const BOOKING_URL = bookingLink()
  const { data: identity } = useQuery({
    queryKey: ['identity'],
    queryFn: async () => (await api.get('/operations/identity')).data,
  })
  const [copied, setCopied] = useState(false)

  function copyLink() {
    navigator.clipboard.writeText(BOOKING_URL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <aside
      className={`
        on-ink fixed inset-y-0 left-0 z-50 flex h-dvh w-64 shrink-0 flex-col bg-navalha text-espuma
        transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:z-auto
      `}
    >
      {/* Logo */}
      <div className="px-5 pb-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          {identity?.logo ? (
            <>
              <img
                src={identity.logo}
                alt="Logo do salão"
                className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/15"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold leading-tight text-espuma">
                  {identity?.name || 'Meu salão'}
                </p>
                <p className="text-xs leading-tight text-zinc-500">Painel do salão</p>
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1">
              <BrandLogo negative />
              <p className="mt-2.5 truncate text-xs text-zinc-500">
                {identity?.name || 'Painel do salão'}
              </p>
            </div>
          )}
          {/* Botão fechar no mobile */}
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-espuma md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1" aria-label="Menu principal">
        <p className="label-caps px-3 pb-2 text-zinc-500">Menu</p>
        {navItems
          .filter((item) =>
            admin?.role === 'PROFESSIONAL'
              ? item.to === '/operacao'
              : item.to !== '/configuracoes' || admin?.role === 'OWNER',
          )
          .map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-espuma font-semibold text-navalha'
                      : 'text-toalha/80 hover:bg-white/[0.06] hover:text-espuma'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-navalha' : 'text-toalha/60 group-hover:text-toalha'}`}
                      strokeWidth={isActive ? 2.25 : 1.75}
                    />
                    {item.label}
                  </>
                )}
              </NavLink>
            )
          })}
      </nav>

      {/* Agendamento online */}
      <div className="px-3 pb-3">
        <div className="rounded-xl border border-white/10 p-3">
          <p className="label-caps mb-2.5 text-toalha">Agendamento online</p>
          <div className="flex gap-1.5">
            <button
              onClick={copyLink}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-500 py-2 text-xs font-semibold text-navalha transition-colors hover:bg-amber-400"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              {copied ? 'Link copiado' : 'Copiar link'}
            </button>
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir a página de agendamento"
              className="flex items-center justify-center rounded-lg border border-white/15 px-2.5 text-toalha transition-colors hover:bg-white/10 hover:text-espuma"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Rodapé */}
      <div className="space-y-1 border-t border-white/10 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {identity?.address && <p className="text-[11px] leading-snug text-zinc-500">{identity.address}</p>}
        {identity?.phone && <p className="hora text-[11px] text-zinc-500">{formatPhone(identity.phone)}</p>}
        {identity?.logo && (
          <p className="pt-1 text-[11px] text-zinc-500">Feito com Seu Barbeiro</p>
        )}
      </div>
    </aside>
  )
}
