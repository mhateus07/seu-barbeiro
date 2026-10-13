import { getSalon } from '../api/salon'
import { useState } from 'react'
import { isAxiosError } from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/auth-state'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Store,
  AlertCircle,
} from 'lucide-react'
import { BrandLogo } from '../components/ui/BrandMark'

const field =
  'w-full rounded-md border border-zinc-400 bg-white py-3 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 outline-hidden transition-colors hover:border-zinc-500 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [salon, setSalon] = useState(getSalon())
  const [editSalon, setEditSalon] = useState(!salon)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      try {
        localStorage.setItem('salon', salon)
      } catch {
        // Sem armazenamento: o salão vale só nesta sessão.
      }
      await login(email, password)
      navigate('/operacao')
    } catch (err) {
      setError(
        (isAxiosError(err) && err.response?.status === 429 && err.response.data?.error?.message) ||
          'E-mail ou senha não conferem. Confira também o identificador do salão.',
      )
      setAttempt((n) => n + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh bg-zinc-50 font-sans text-zinc-900">
      {/* Painel da marca */}
      <aside className="on-ink hidden w-[44%] flex-col justify-between gap-10 bg-navalha px-12 py-10 lg:flex xl:px-16 xl:py-12">
        <Link to="/" aria-label="Seu Barbeiro, apresentação" className="self-start">
          <BrandLogo negative size="lg" />
        </Link>

        <div className="max-w-md">
          <h2 className="text-[32px] font-semibold leading-[40px] text-espuma">
            Gestão para barbearias e salões
          </h2>
          <p className="mt-4 text-base leading-relaxed text-toalha/80">
            Agenda, clientes, Pix e caixa no mesmo painel, no computador do balcão ou no celular.
          </p>
        </div>

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>Cada salão tem o próprio banco de dados.</span>
          <Link to="/privacidade" className="underline underline-offset-2 hover:text-espuma">Privacidade</Link>
          <span>© {new Date().getFullYear()} Seu Barbeiro</span>
        </p>
      </aside>

      {/* Formulário */}
      <main className="flex flex-1 flex-col">
        <div className="on-ink bg-navalha px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 lg:hidden">
          <Link to="/" aria-label="Seu Barbeiro, apresentação">
            <BrandLogo negative />
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <h1 className="text-[28px] leading-8 text-zinc-900">Entrar no painel</h1>
              <p className="mt-2 text-sm text-zinc-500">
                Use o e-mail e a senha da sua conta no salão.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {editSalon ? (
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-zinc-700">Identificador do salão</span>
                  <div className="relative">
                    <Store className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      required
                      pattern="[a-z0-9\-]+"
                      title="Use letras minúsculas, números e hífen"
                      autoCapitalize="none"
                      value={salon}
                      onChange={(e) => setSalon(e.target.value.toLowerCase())}
                      placeholder="ex.: seu-barbeiro"
                      className={field}
                    />
                  </div>
                </label>
              ) : (
                <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-100 px-3.5 py-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-zinc-500">
                    <Store className="h-4 w-4 shrink-0" />
                    Salão <strong className="truncate font-semibold text-zinc-900">{salon}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditSalon(true)}
                    className="text-xs font-semibold text-zinc-900 underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-900"
                  >
                    Trocar
                  </button>
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-zinc-700">E-mail</span>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@seusalao.com"
                    required
                    className={field}
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-zinc-700">Senha</span>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Sua senha"
                    required
                    className={`${field} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 transition-colors hover:text-zinc-900"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {error && (
                <div
                  key={attempt}
                  role="alert"
                  className="flex animate-pop-in gap-2 rounded-md border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-navalha px-4 text-[15px] font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-70"
              >
                {loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  'Entrar'
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-sm text-zinc-500">
          É cliente?{' '}
          <Link
            to={`/agendar?salon=${encodeURIComponent(salon || getSalon())}`}
            className="font-medium text-zinc-900 underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-900"
          >
            Agende seu horário
          </Link>
        </p>
      </main>
    </div>
  )
}
