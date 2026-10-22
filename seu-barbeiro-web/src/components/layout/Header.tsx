import { LogOut, Menu, Moon, Sun, Monitor, Bell, BellRing, BellOff } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/auth-state'
import { useTheme, type ThemePreference } from '../../hooks/useTheme'
import { usePush } from '../../hooks/usePush'

interface HeaderProps {
  onMenuClick: () => void
}

const themes: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Tema claro', icon: Sun },
  { id: 'dark', label: 'Tema escuro', icon: Moon },
  { id: 'system', label: 'Tema do sistema', icon: Monitor },
]

const roleLabels: Record<string, string> = {
  OWNER: 'Dono',
  RECEPTION: 'Recepção',
  PROFESSIONAL: 'Profissional',
}

export function Header({ onMenuClick }: HeaderProps) {
  const { admin, logout } = useAuth()
  const { preference, setPreference } = useTheme()
  const push = usePush()
  async function togglePush() {
    if (push.state === 'needs-install')
      return toast.info(
        'No iPhone, toque em Compartilhar → "Adicionar à Tela de Início" e abra pelo ícone para ativar os avisos.',
      )
    if (push.state === 'denied')
      return toast.error('As notificações estão bloqueadas. Libere nas configurações do navegador.')
    try {
      if (push.state === 'on') {
        await push.disable()
        toast.success('Avisos desligados neste aparelho.')
      } else {
        await push.enable()
        toast.success('Pronto! Você vai receber avisos de novos agendamentos aqui.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível ativar.')
    }
  }
  const themeIndex = Math.max(0, themes.findIndex((t) => t.id === preference))
  const currentTheme = themes[themeIndex]
  const nextTheme = themes[(themeIndex + 1) % themes.length]
  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const initials = (admin?.name || '?')
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part))
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?'

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] md:px-6 md:py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-xl p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 md:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <p className="hidden text-sm font-medium first-letter:uppercase text-zinc-600 sm:block">{today}</p>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        {push.state !== 'unsupported' && push.state !== 'loading' && (
          <button
            onClick={togglePush}
            aria-label={push.state === 'on' ? 'Desligar avisos neste aparelho' : 'Receber avisos neste aparelho'}
            title={push.state === 'on' ? 'Avisos ligados neste aparelho' : 'Receber avisos de novos agendamentos'}
            className={`relative rounded-xl p-2 transition-colors ${push.state === 'on' ? 'text-zinc-900 hover:bg-zinc-100' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'}`}
          >
            {push.state === 'on' ? (
              <BellRing className="h-4 w-4" />
            ) : push.state === 'denied' ? (
              <BellOff className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            {push.state === 'off' && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>
        )}
        <button
          onClick={() => setPreference(nextTheme.id)}
          aria-label={`${currentTheme.label}. Trocar para ${nextTheme.label.toLowerCase()}`}
          title={currentTheme.label}
          className="rounded-xl p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 sm:hidden"
        >
          <currentTheme.icon className="h-4 w-4" />
        </button>
        <div
          role="radiogroup"
          aria-label="Tema"
          className="hidden items-center rounded-xl border border-zinc-200 bg-zinc-100 p-0.5 sm:flex"
        >
          {themes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="radio"
              aria-checked={preference === id}
              aria-label={label}
              title={label}
              onClick={() => setPreference(id)}
              className={`rounded-lg p-1.5 transition-colors ${
                preference === id
                  ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgb(21_35_63/0.12)]'
                  : 'text-zinc-400 hover:text-zinc-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-1 sm:pr-3">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-zinc-900 font-display text-xs font-bold text-white">
            {initials}
          </div>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-semibold text-zinc-800">{admin?.name}</p>
            <p className="text-[11px] text-zinc-500">
              {roleLabels[admin?.role || ''] || 'Equipe'}
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          aria-label="Sair"
          className="flex items-center gap-1.5 rounded-xl p-2 text-sm sm:px-2.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:block">Sair</span>
        </button>
      </div>
    </header>
  )
}
