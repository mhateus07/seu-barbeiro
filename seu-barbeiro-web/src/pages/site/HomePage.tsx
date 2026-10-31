import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { MotionConfig, motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useAuth } from '../../contexts/auth-state'
import { BrandLogo, BrandWordmark } from '../../components/ui/BrandMark'
import { LossCalculator } from './LossCalculator'
import { ScreenVideo } from './ScreenVideo'
import { videos } from './videos'

// Página de apresentação do Seu Barbeiro (raiz do site). Fundo claro, linhas
// finas, tipografia grande e as gravações reais do sistema; o movimento vem da
// rolagem e nunca de ilustração, selo ou brilho.
// Ordem: abertura, a agenda gravada, como funciona, faltas, recursos, dúvidas e contato.

const WHATSAPP_DISPLAY = '(32) 99857-8057'
const WHATSAPP_URL = `https://wa.me/5532998578057?text=${encodeURIComponent(
  'Olá, quero conhecer o Seu Barbeiro.',
)}`

const STEPS = [
  {
    title: 'O cliente marca pelo seu link',
    text: 'Escolhe o serviço, o profissional e um horário livre, no celular. Não precisa baixar aplicativo nem criar conta. O link vai no WhatsApp e na bio do Instagram.',
  },
  {
    title: 'O lembrete sai sozinho',
    text: 'Antes do horário, o cliente recebe uma mensagem no WhatsApp com um link para confirmar, remarcar ou cancelar. Você define a antecedência.',
  },
  {
    title: 'O sinal no Pix segura o horário',
    text: 'Cobre sinal de todos os clientes ou só de quem já faltou. O pagamento é confirmado na hora e descontado no dia do atendimento.',
  },
  {
    title: 'Atendeu, recebeu, fechou o caixa',
    text: 'Cada atendimento vira um recebimento por forma de pagamento, com a comissão do profissional calculada. No fim do dia, o caixa fecha conferido.',
  },
]

const FACTS: [string, string][] = [
  ['0', 'aplicativo para o cliente baixar'],
  ['24h', 'de agenda aberta pelo link da barbearia'],
  ['1', 'painel para agenda, caixa e comissão'],
  ['12', 'recursos no mesmo sistema'],
]

const GROUPS: { name: string; text: string; items: [string, string][] }[] = [
  {
    name: 'Agenda',
    text: 'Horário marcado sem você parar o corte.',
    items: [
      ['Agenda por profissional', 'Visão de dia e de semana, bloqueio de horário e arrastar para remarcar.'],
      ['Agendamento online', 'Página da barbearia com serviços, profissionais e horários livres.'],
      ['Lembrete no WhatsApp', 'Mensagem automática com link para confirmar, remarcar ou cancelar.'],
      ['Lista de espera', 'Quando alguém cancela, a vaga é oferecida a quem estava esperando.'],
    ],
  },
  {
    name: 'Caixa',
    text: 'O dinheiro do dia conferido, centavo por centavo.',
    items: [
      ['Sinal no Pix', 'Cobrança pelo Mercado Pago, para todos ou só para quem já faltou.'],
      ['Comanda e caixa', 'Abertura, sangria, reforço e fechamento por forma de pagamento.'],
      ['Comissões e vales', 'Porcentagem por profissional, com vales descontados no fechamento.'],
      ['Financeiro', 'Receitas, despesas e relatórios do mês, com exportação em PDF.'],
    ],
  },
  {
    name: 'Clientes e equipe',
    text: 'Quem volta, quem sumiu e quem vê o quê.',
    items: [
      ['Retorno de clientes', 'Prazo de volta por serviço e a lista de quem já passou do tempo.'],
      ['Planos mensais', 'Assinaturas com controle de uso e de vencimento.'],
      ['Acesso por função', 'O profissional vê a agenda; caixa e relatórios ficam com o dono.'],
      ['No celular', 'Funciona no navegador e pode ser instalado como aplicativo.'],
    ],
  },
]

const FAQ: [string, string][] = [
  [
    'O cliente precisa baixar aplicativo?',
    'Não. A página de agendamento abre no navegador do celular, pelo link da sua barbearia.',
  ],
    [
    'E quando o cliente cancela?',
    'O horário volta para a agenda. Com a lista de espera ativa, a vaga é oferecida pelo WhatsApp a quem esperava por aquele dia.',
  ],
  [
    'Cada profissional tem acesso próprio?',
    'Tem. O profissional entra e vê a agenda. Faturamento, caixa e configurações ficam com o dono e a recepção.',
  ],
  [
    'Meus dados ficam separados dos outros salões?',
    'Ficam. Cada barbearia tem o próprio banco de dados.',
  ],
  [
    'Quanto custa?',
    'Fale com a gente no WhatsApp. Passamos os valores e mostramos o sistema com a agenda da sua barbearia.',
  ],
]

// Coluna central com as linhas finas laterais (no computador), que descem a página inteira.
const container = 'mx-auto w-full max-w-[1240px] px-4 sm:px-8'
const rails = 'lg:border-x lg:border-zinc-200'

const ease = [0.2, 0.8, 0.2, 1] as const

/** Entra de leve quando aparece na tela. */
function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.6, ease, delay }}
    >
      {children}
    </motion.div>
  )
}

/** Data e hora de agora no fuso do Brasil, como no topo da agenda. */
function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(t)
  }, [])
  const opts = { timeZone: 'America/Sao_Paulo' } as const
  const day = now.toLocaleDateString('pt-BR', { ...opts, weekday: 'short', day: '2-digit', month: '2-digit' })
  const time = now.toLocaleTimeString('pt-BR', { ...opts, hour: '2-digit', minute: '2-digit' })
  return (
    <span className="hora">
      {day.replace('.', '')} · {time}
    </span>
  )
}

function CtaButton({ children, large }: { children: ReactNode; large?: boolean }) {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center justify-center gap-3 rounded-md bg-navalha font-medium text-espuma transition-colors hover:bg-zinc-800 ${
        large ? 'h-14 px-7 text-[17px]' : 'h-12 px-6 text-[15px]'
      }`}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
    </a>
  )
}

function SectionHead({ index, label, title, intro }: { index: string; label: string; title: ReactNode; intro?: ReactNode }) {
  return (
    <Reveal className="grid gap-x-12 gap-y-6 lg:grid-cols-[1fr_2fr]">
      <p className="hora pt-2 text-sm text-zinc-500">
        <span className="text-zinc-900">{index}</span> / {label}
      </p>
      <div>
        <h2 className="max-w-3xl text-[clamp(2.1rem,5vw,4rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-zinc-900">
          {title}
        </h2>
        {intro && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">{intro}</p>}
      </div>
    </Reveal>
  )
}

/** Abertura: o título entra linha por linha, como texto subindo de uma régua. */
function Hero() {
  const lines = [
    { text: 'Cadeira cheia,', muted: false },
    { text: 'cliente lembrado', muted: false },
    { text: 'e caixa fechado.', muted: true },
  ]
  return (
    <section className="bg-espuma">
      <div className={`${container} ${rails} pt-10 sm:pt-16 lg:px-12`}>
        <div className="hora flex items-center justify-between gap-4 border-b border-zinc-300 pb-4 text-[13px] text-zinc-500">
          <span className="whitespace-nowrap">Barbearias e salões</span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-poste" aria-hidden="true" />
            <span className="hidden sm:inline">Agenda de hoje ·</span> <Clock />
          </span>
        </div>

        <h1 className="mt-10 text-[clamp(2.6rem,11.4vw,8rem)] font-semibold leading-[0.94] tracking-[-0.045em] sm:mt-14">
          {lines.map((l, i) => (
            <span key={l.text} className="block overflow-hidden pb-[0.06em]">
              <motion.span
                className={`block ${l.muted ? 'text-zinc-400' : 'text-zinc-900'}`}
                initial={{ y: '105%' }}
                animate={{ y: 0 }}
                transition={{ duration: 0.9, ease, delay: 0.08 + i * 0.09 }}
              >
                {l.text}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.div
          className="mt-10 grid gap-8 pb-14 sm:mt-14 sm:pb-20 lg:grid-cols-[1.3fr_1fr] lg:items-end"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.45 }}
        >
          <p className="max-w-xl text-lg leading-relaxed text-zinc-600 sm:text-xl">
            O Seu Barbeiro é o sistema da barbearia inteira. O cliente marca pelo link, recebe o
            lembrete no WhatsApp e paga o sinal no Pix. Você vê a agenda da equipe, as comissões e o
            caixa do dia.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:justify-end">
            <CtaButton>Agendar demonstração</CtaButton>
            <a
              href="#como-funciona"
              className="inline-flex h-12 items-center justify-center text-[15px] font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-[6px] hover:text-zinc-900 hover:decoration-zinc-900"
            >
              Ver como funciona
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/** A gravação real da agenda abre ao rolar, saindo da página clara para o Azul Navalha. */
function Stage() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 0.25'] })
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0.9, 1])

  return (
    <section className="bg-[linear-gradient(to_bottom,var(--color-espuma)_0,var(--color-espuma)_38%,var(--color-navalha)_38%)] text-espuma">
      <div className={`${container} lg:border-x lg:border-x-transparent`}>
        <motion.figure ref={ref} style={{ scale }} className="origin-top">
          <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white">
            <div className="aspect-[16/9]">
              <ScreenVideo
                video={videos.agenda}
                label="Agenda do dia: um horário livre vira atendimento e a comanda de outro cliente é aberta"
                priority
                className="block h-full w-full object-cover"
              />
            </div>
          </div>
          <figcaption className="hora mt-4 flex flex-wrap justify-between gap-x-6 gap-y-1 text-[13px] text-zinc-400">
            <span>Gravação do sistema · Agenda do dia</span>
            <span>Dados de demonstração</span>
          </figcaption>
        </motion.figure>
      </div>

      <div className="bg-navalha">
        <dl className={`${container} grid grid-cols-2 pb-16 pt-14 sm:pb-24 sm:pt-20 lg:grid-cols-4`}>
          {FACTS.map(([n, t], i) => (
            <Reveal
              key={t}
              delay={i * 0.06}
              className={`border-white/15 py-6 pr-4 sm:pr-8 ${i % 2 === 1 ? 'border-l pl-4 sm:pl-8' : ''} ${
                i > 1 ? 'border-t lg:border-t-0' : ''
              } ${i === 2 ? 'lg:border-l lg:pl-8' : ''}`}
            >
              <dt className="sr-only">{t}</dt>
              <dd>
                <span className="tabular block text-[clamp(3rem,6.5vw,5.5rem)] font-semibold leading-none tracking-[-0.045em] text-espuma">
                  {n}
                </span>
                <span className="mt-4 block max-w-[14rem] text-[15px] leading-snug text-[#a3abbc]">{t}</span>
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  )
}

/** Passos com o celular parado ao lado; o passo do meio da tela fica aceso. */
function HowItWorks() {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    refs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section id="como-funciona" className="scroll-mt-16 bg-white">
      <div className={`${container} ${rails} py-20 sm:py-28 lg:px-12`}>
        <SectionHead
          index="01"
          label="Como funciona"
          title="Do link no Instagram ao caixa fechado."
          intro="Sem caderno, sem planilha e sem responder mensagem no meio do corte."
        />

        <div className="mt-14 grid gap-12 sm:mt-20 lg:grid-cols-[1fr_2fr] lg:gap-x-12">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <figure>
              <div className="mx-auto w-[64%] max-w-[280px] overflow-hidden rounded-[22px] border border-zinc-300 bg-zinc-950 lg:mx-0 lg:w-full">
                <div className="aspect-[660/1248]">
                  <ScreenVideo
                    video={videos.agendamento}
                    label="Cliente escolhendo serviço, profissional e horário no celular até o horário confirmado"
                    className="block h-full w-full object-cover object-top"
                  />
                </div>
              </div>
              <figcaption className="hora mx-auto mt-4 max-w-[280px] text-[13px] text-zinc-500 lg:mx-0">
                Agendamento pelo celular, na página da barbearia.
              </figcaption>
            </figure>
          </div>

          <div className="relative">
            {/* Régua de progresso */}
            <div className="absolute inset-y-0 left-0 hidden w-px bg-zinc-200 lg:block" aria-hidden="true">
              <div
                className="w-px bg-navalha transition-[height] duration-500 ease-out"
                style={{ height: `${((active + 1) / STEPS.length) * 100}%` }}
              />
            </div>
            <ol className="border-t border-zinc-200 lg:border-t-0">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  ref={(el) => {
                    refs.current[i] = el
                  }}
                  data-step={i}
                  className={`grid grid-cols-[3rem_1fr] gap-x-4 border-b border-zinc-200 py-8 transition-opacity duration-500 sm:grid-cols-[5rem_1fr] lg:min-h-[44vh] lg:content-center lg:border-b-0 lg:pl-12 ${
                    active === i ? 'lg:opacity-100' : 'lg:opacity-25'
                  }`}
                >
                  <span className="hora pt-1 text-sm text-zinc-400 sm:text-base">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 className="text-[1.6rem] font-semibold leading-tight tracking-[-0.025em] text-zinc-900 sm:text-[2.25rem]">
                      {s.title}
                    </h3>
                    <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-zinc-600">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

export function HomePage() {
  // Quem já tem sessão aberta vê a apresentação também, com atalho para o painel.
  const { isAuthenticated } = useAuth()
  const panel = isAuthenticated ? { to: '/operacao', label: 'Abrir painel' } : { to: '/login', label: 'Entrar' }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh flex-col bg-white text-zinc-900">
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white">
          <nav className={`${container} ${rails} flex h-16 items-center gap-8 lg:px-12`}>
            <Link to="/" aria-label="Seu Barbeiro, página inicial" className="shrink-0">
              <BrandLogo />
            </Link>
            <div className="hidden items-center gap-7 text-[15px] text-zinc-600 md:flex">
              <a href="#como-funciona" className="hover:text-zinc-900">Como funciona</a>
              <a href="#faltas" className="hover:text-zinc-900">Faltas</a>
              <a href="#recursos" className="hover:text-zinc-900">Recursos</a>
              <a href="#duvidas" className="hover:text-zinc-900">Dúvidas</a>
            </div>
            <div className="ml-auto flex items-center gap-5">
              <Link to={panel.to} className="text-[15px] font-medium text-zinc-700 hover:text-zinc-900">
                {panel.label}
              </Link>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden h-9 items-center rounded-md bg-navalha px-4 text-[15px] font-medium text-espuma hover:bg-zinc-800 sm:inline-flex"
              >
                Agendar demonstração
              </a>
            </div>
          </nav>
        </header>

        <main className="flex-1 overflow-x-clip">
          <Hero />
          <Stage />
          <HowItWorks />

          {/* Faltas */}
          <section id="faltas" className="scroll-mt-16 border-t border-zinc-200 bg-espuma">
            <div className={`${container} ${rails} py-20 sm:py-28 lg:px-12`}>
              <SectionHead
                index="02"
                label="Faltas"
                title="Quanto custa a cadeira vazia."
                intro="Cada cliente que não aparece é um horário que ninguém mais pode usar. Coloque os números da sua barbearia e veja o valor no mês e no ano."
              />
              <Reveal className="mt-14 sm:mt-20">
                <LossCalculator />
              </Reveal>
            </div>
          </section>

          {/* Recursos */}
          <section id="recursos" className="scroll-mt-16 border-t border-zinc-200 bg-white">
            <div className={`${container} ${rails} py-20 sm:py-28 lg:px-12`}>
              <SectionHead
                index="03"
                label="Recursos"
                title="Tudo o que a barbearia usa, num painel só."
                intro="No computador do balcão, no tablet ou no celular. O que muda num lugar aparece em todos."
              />
              <div className="mt-14 border-t border-zinc-900 sm:mt-20">
                {GROUPS.map((g, gi) => (
                  <Reveal key={g.name} className="grid gap-x-12 gap-y-6 border-b border-zinc-200 py-10 sm:py-14 lg:grid-cols-[1fr_2fr]">
                    <div>
                      <p className="hora text-sm text-zinc-400">{String(gi + 1).padStart(2, '0')}</p>
                      <h3 className="mt-3 text-[2rem] font-semibold leading-none tracking-[-0.035em] text-zinc-900 sm:text-[2.75rem]">
                        {g.name}
                      </h3>
                      <p className="mt-4 max-w-xs text-zinc-500">{g.text}</p>
                    </div>
                    <dl className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
                      {g.items.map(([name, text]) => (
                        <div key={name} className="border-t border-zinc-200 pt-4">
                          <dt className="text-[17px] font-semibold text-zinc-900">{name}</dt>
                          <dd className="mt-1.5 text-[15px] leading-relaxed text-zinc-600">{text}</dd>
                        </div>
                      ))}
                    </dl>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* Dúvidas */}
          <section id="duvidas" className="scroll-mt-16 border-t border-zinc-200 bg-espuma">
            <div className={`${container} ${rails} py-20 sm:py-28 lg:px-12`}>
              <SectionHead index="04" label="Dúvidas" title="O que os donos perguntam antes." />
              <dl className="mt-14 border-t border-zinc-300 sm:mt-20">
                {FAQ.map(([q, a]) => (
                  <Reveal key={q} className="grid gap-x-12 gap-y-3 border-b border-zinc-300 py-7 sm:py-9 lg:grid-cols-[1fr_2fr]">
                    <dt className="text-lg font-semibold leading-snug text-zinc-900 sm:text-xl">{q}</dt>
                    <dd className="max-w-2xl text-[17px] leading-relaxed text-zinc-600">{a}</dd>
                  </Reveal>
                ))}
              </dl>
            </div>
          </section>

          {/* Contato */}
          <section className="border-t border-zinc-200 bg-white">
            <div className={`${container} ${rails} py-20 sm:py-32 lg:px-12`}>
              <Reveal>
                <p className="hora text-sm text-zinc-500">
                  <span className="text-zinc-900">05</span> / Contato
                </p>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group mt-8 block max-w-5xl text-[clamp(2.4rem,7vw,6rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-zinc-900"
                >
                  Veja o sistema com a agenda da sua{' '}
                  <span className="whitespace-nowrap">
                    barbearia
                    <ArrowUpRight
                      className="ml-2 inline h-[0.7em] w-[0.7em] align-[-0.05em] text-zinc-400 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-zinc-900"
                      strokeWidth={2.25}
                    />
                  </span>
                </a>
              </Reveal>
              <Reveal delay={0.1} className="mt-12 grid gap-8 border-t border-zinc-200 pt-8 sm:mt-16 lg:grid-cols-[1.3fr_1fr] lg:items-center">
                <p className="max-w-xl text-lg leading-relaxed text-zinc-600">
                  Marcamos uma conversa pelo WhatsApp e mostramos o Seu Barbeiro funcionando na sua
                  rotina, com os seus serviços e a sua equipe.
                </p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:justify-end">
                  <CtaButton large>Agendar demonstração</CtaButton>
                  <span className="hora text-center text-zinc-600 sm:text-left">{WHATSAPP_DISPLAY}</span>
                </div>
              </Reveal>
            </div>
          </section>
        </main>

        <footer className="border-t border-zinc-200 bg-espuma">
          <div className={`${container} ${rails} pt-12 lg:px-12`}>
            <div className="flex flex-col gap-6 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
              <p>Produto da Impulsio Digital, Juiz de Fora (MG).</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Link to={panel.to} className="hover:text-zinc-900">
                  {isAuthenticated ? 'Abrir painel' : 'Entrar no painel'}
                </Link>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-900">
                  Falar no WhatsApp
                </a>
                <Link to="/privacidade" className="hover:text-zinc-900">Privacidade</Link>
                <span>© {new Date().getFullYear()} Seu Barbeiro</span>
              </div>
            </div>
            <div className="mt-14 pb-8 sm:mt-20 sm:pb-12">
              <BrandWordmark fluid className="w-full" />
            </div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  )
}
