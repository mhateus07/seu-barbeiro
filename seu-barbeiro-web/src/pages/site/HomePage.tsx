import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/auth-state'
import { BrandLogo } from '../../components/ui/BrandMark'
import { LossCalculator } from './LossCalculator'
import { ScreenVideo } from './ScreenVideo'
import { videos } from './videos'

// Página de apresentação do Seu Barbeiro (raiz do site). Fundo claro, linhas
// finas e as gravações reais do sistema; nada de ilustração, selo ou efeito.
// Ordem: o produto, como funciona, faltas, o que o sistema faz, dúvidas e contato.

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

const MODULES: [string, string][] = [
  ['Agenda por profissional', 'Visão de dia e de semana, bloqueio de horário e arrastar para remarcar.'],
  ['Agendamento online', 'Página do salão com serviços, profissionais e horários livres.'],
  ['Lembrete no WhatsApp', 'Mensagem automática com link para confirmar, remarcar ou cancelar.'],
  ['Sinal no Pix', 'Cobrança pelo Mercado Pago, para todos ou só para quem já faltou.'],
  ['Lista de espera', 'Quando alguém cancela, a vaga é oferecida a quem estava esperando.'],
  ['Comanda e caixa', 'Abertura, sangria, reforço e fechamento por forma de pagamento.'],
  ['Comissões e vales', 'Porcentagem por profissional, com vales descontados no fechamento.'],
  ['Retorno de clientes', 'Prazo de volta por serviço e a lista de quem já passou do tempo.'],
  ['Planos mensais', 'Assinaturas com controle de uso e de vencimento.'],
  ['Financeiro', 'Receitas, despesas e relatórios do mês, com exportação em PDF.'],
  ['Acesso por função', 'O profissional vê a agenda; caixa e relatórios ficam com o dono.'],
  ['No celular', 'Funciona no navegador e pode ser instalado como aplicativo.'],
]

const FAQ: [string, string][] = [
  [
    'O cliente precisa baixar aplicativo?',
    'Não. A página de agendamento abre no navegador do celular, pelo link do seu salão.',
  ],
  [
    'Serve para salão de beleza?',
    'Sim. Cada profissional tem a própria agenda, e um serviço pode ter tempo de pausa, como na coloração, para encaixar outro cliente enquanto a tinta age.',
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
    'Ficam. Cada salão tem o próprio banco de dados.',
  ],
  [
    'Quanto custa?',
    'Fale com a gente no WhatsApp. Passamos os valores e mostramos o sistema com a agenda do seu salão.',
  ],
]

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6'

function ButtonLink({ href, primary, children }: { href: string; primary?: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex h-11 items-center justify-center rounded-md px-5 text-[15px] font-medium transition-colors ${
        primary
          ? 'bg-navalha text-white hover:bg-zinc-800'
          : 'border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-400 hover:bg-zinc-50'
      }`}
    >
      {children}
    </a>
  )
}

function Section({
  id,
  title,
  intro,
  children,
  className = '',
}: {
  id?: string
  title: string
  intro?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`scroll-mt-16 border-t border-zinc-200 ${className}`}>
      <div className={`${container} py-16 sm:py-24`}>
        <div className="grid gap-x-12 gap-y-4 lg:grid-cols-[1fr_2fr]">
          <h2 className="text-[1.75rem] font-semibold leading-tight text-zinc-900 sm:text-[2rem]">{title}</h2>
          {intro && <p className="max-w-2xl text-[17px] leading-relaxed text-zinc-600">{intro}</p>}
        </div>
        <div className="mt-10 sm:mt-14">{children}</div>
      </div>
    </section>
  )
}

export function HomePage() {
  // Quem já tem sessão aberta vê a apresentação também, com atalho para o painel.
  const { isAuthenticated } = useAuth()
  const panel = isAuthenticated ? { to: '/operacao', label: 'Abrir painel' } : { to: '/login', label: 'Entrar' }

  return (
    <div className="flex min-h-dvh flex-col bg-white text-zinc-900">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
        <nav className={`${container} flex h-16 items-center gap-8`}>
          <Link to="/" aria-label="Seu Barbeiro, página inicial" className="shrink-0">
            <BrandLogo />
          </Link>
          <div className="hidden items-center gap-6 text-[15px] text-zinc-600 md:flex">
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
              className="hidden h-9 items-center rounded-md bg-navalha px-4 text-[15px] font-medium text-white hover:bg-zinc-800 sm:inline-flex"
            >
              Agendar demonstração
            </a>
          </div>
        </nav>
      </header>

      <main className="flex-1 overflow-x-clip">
        {/* Abertura */}
        <section className="bg-zinc-50">
          <div className={`${container} pb-12 pt-14 sm:pb-16 sm:pt-20`}>
            <p className="text-[15px] text-zinc-500">Sistema de gestão para barbearias e salões</p>
            <h1 className="mt-4 max-w-4xl text-[2.25rem] leading-[1.1] tracking-[-0.025em] text-zinc-900 sm:text-[3.5rem]">
              Agenda, clientes e caixa do salão no mesmo sistema.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600">
              O cliente marca pelo link, recebe o lembrete no WhatsApp e paga o sinal no Pix. Você
              acompanha a agenda da equipe, as comissões e o caixa do dia.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={WHATSAPP_URL} primary>Agendar demonstração</ButtonLink>
              <ButtonLink href={WHATSAPP_URL}>Falar no WhatsApp</ButtonLink>
            </div>

            <figure className="mt-12 sm:mt-16">
              <div className="overflow-hidden rounded-lg border border-zinc-300 bg-white">
                <div className="aspect-[16/9]">
                  <ScreenVideo
                    video={videos.agenda}
                    label="Agenda do dia: um horário livre vira atendimento e a comanda de outro cliente é aberta"
                    priority
                    className="block h-full w-full object-cover"
                  />
                </div>
              </div>
              <figcaption className="mt-3 text-sm text-zinc-500">
                Agenda do dia no painel do salão. Gravação do sistema com dados de demonstração.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Como funciona */}
        <Section
          id="como-funciona"
          title="Como funciona"
          intro="Do horário marcado ao caixa fechado, sem caderno e sem responder mensagem no meio do corte."
        >
          <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
            <figure className="order-2 lg:order-1">
              <div className="mx-auto w-[62%] max-w-[260px] overflow-hidden rounded-[18px] border border-zinc-300 bg-zinc-950 lg:mx-0 lg:w-full">
                <div className="aspect-[660/1248]">
                  <ScreenVideo
                    video={videos.agendamento}
                    label="Cliente escolhendo serviço, profissional e horário no celular até o horário confirmado"
                    className="block h-full w-full object-cover object-top"
                  />
                </div>
              </div>
              <figcaption className="mx-auto mt-3 max-w-[260px] text-sm text-zinc-500 lg:mx-0">
                Agendamento pelo celular, na página do salão.
              </figcaption>
            </figure>
            <ol className="order-1 border-t border-zinc-200 lg:order-2">
              {STEPS.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-zinc-200 py-7 sm:grid-cols-[3.5rem_1fr]">
                  <span className="hora pt-0.5 text-sm text-zinc-400">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 className="text-xl font-semibold text-zinc-900">{s.title}</h3>
                    <p className="mt-2 max-w-xl leading-relaxed text-zinc-600">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        {/* Faltas */}
        <Section
          id="faltas"
          title="Quanto as faltas custam"
          intro="Cada cliente que não aparece deixa uma cadeira parada. Coloque os números do seu salão e veja o valor no mês e no ano."
          className="bg-zinc-50"
        >
          <LossCalculator />
        </Section>

        {/* Recursos */}
        <Section
          id="recursos"
          title="O que o sistema faz"
          intro="Tudo no mesmo painel, no computador do balcão, no tablet ou no celular."
        >
          <dl className="grid border-t border-zinc-200 sm:grid-cols-2 sm:gap-x-12">
            {MODULES.map(([name, text]) => (
              <div key={name} className="border-b border-zinc-200 py-5">
                <dt className="font-semibold text-zinc-900">{name}</dt>
                <dd className="mt-1 text-[15px] leading-relaxed text-zinc-600">{text}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Dúvidas */}
        <Section id="duvidas" title="Dúvidas frequentes" className="bg-zinc-50">
          <dl className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {FAQ.map(([q, a]) => (
              <div key={q}>
                <dt className="font-semibold text-zinc-900">{q}</dt>
                <dd className="mt-2 leading-relaxed text-zinc-600">{a}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Contato */}
        <section className="border-t border-zinc-200">
          <div className={`${container} grid gap-8 py-16 sm:py-20 lg:grid-cols-[2fr_1fr] lg:items-end`}>
            <div>
              <h2 className="text-[1.75rem] font-semibold leading-tight text-zinc-900 sm:text-[2rem]">
                Veja o sistema com a agenda do seu salão
              </h2>
              <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-zinc-600">
                Marcamos uma conversa pelo WhatsApp e mostramos o Seu Barbeiro funcionando na sua
                rotina.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <ButtonLink href={WHATSAPP_URL} primary>Agendar demonstração</ButtonLink>
              <p className="text-sm text-zinc-500 sm:self-center lg:self-auto">
                WhatsApp <span className="hora text-zinc-800">{WHATSAPP_DISPLAY}</span>
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 bg-zinc-50">
        <div className={`${container} flex flex-col gap-6 py-10 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="flex flex-col gap-3">
            <BrandLogo size="sm" />
            <p>Produto da Impulsio Digital, Juiz de Fora (MG).</p>
          </div>
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
      </footer>
    </div>
  )
}
