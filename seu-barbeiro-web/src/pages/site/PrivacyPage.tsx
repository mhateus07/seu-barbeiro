import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandLogo } from '../../components/ui/BrandMark'
import { hostBrand, useApplyBrand, useBrand } from '../../brand/brand'

// Política de privacidade (LGPD) do Seu Barbeiro, aberta a qualquer pessoa em
// /privacidade. Vale para os clientes dos salões e para as equipes que usam o
// painel. Ao mudar o que o sistema guarda, atualize também este texto.

const UPDATED = '13 de outubro de 2026'
const WHATSAPP_DISPLAY = '(32) 99857-8057'
const WHATSAPP_URL = 'https://wa.me/5532998578057'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-200 py-8">
      <h2 className="text-xl font-semibold text-zinc-900">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-zinc-700">{children}</div>
    </section>
  )
}

export function PrivacyPage() {
  useApplyBrand(hostBrand())
  const brand = useBrand()
  return (
    <div className="min-h-dvh bg-white text-zinc-900">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link to="/" aria-label={`${brand.name}, página inicial`}>
            <BrandLogo />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-12 sm:px-6">
        <h1 className="text-[2rem] leading-tight tracking-[-0.02em] sm:text-[2.5rem]">Política de privacidade</h1>
        <p className="mt-3 text-sm text-zinc-500">Atualizada em {UPDATED}.</p>
        <p className="mb-8 mt-6 text-[17px] leading-relaxed text-zinc-700">
          O {brand.name} é um sistema de agenda e gestão usado por barbearias e salões. Esta página
          explica quais dados pessoais passam por ele, para quê, por quanto tempo e como pedir uma
          cópia, uma correção ou a exclusão.
        </p>

        <Section title="Quem é responsável">
          <p>
            <strong>O salão</strong> em que você marca horário decide quais dados usa e para quê. Na
            linguagem da Lei Geral de Proteção de Dados (Lei 13.709/2018), ele é o{' '}
            <em>controlador</em>.
          </p>
          <p>
            <strong>A Impulsio Digital</strong>, de Juiz de Fora (MG), fornece e mantém o sistema e
            trata os dados em nome do salão, seguindo as instruções dele. É a <em>operadora</em>.
          </p>
        </Section>

        <Section title="Quais dados guardamos">
          <p>Dos clientes do salão:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>nome, telefone e, se você informar, e-mail e data de nascimento;</li>
            <li>horários marcados, serviços, profissional, valores e formas de pagamento;</li>
            <li>
              ficha técnica, quando o salão registra (fórmula de coloração, produtos, preferências e
              fotos, estas só com a sua autorização);
            </li>
            <li>as mensagens de WhatsApp enviadas pelo sistema (lembretes, confirmações, avisos de vaga);</li>
            <li>se você pediu ou não para ser avisado de vagas e chamado de volta.</li>
          </ul>
          <p>
            Da equipe do salão: nome, e-mail de acesso e o registro de entradas no painel e de ações
            sobre dados de clientes.
          </p>
          <p>
            Não usamos cookies de propaganda nem de rastreamento. O navegador guarda apenas o acesso
            ao painel e a preferência de tema claro ou escuro.
          </p>
        </Section>

        <Section title="Para que usamos">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Marcar e cuidar do seu horário</strong>: agenda, lembrete, link para confirmar,
              remarcar ou cancelar, cobrança de sinal pelo Pix. Base legal: execução do serviço que
              você pediu.
            </li>
            <li>
              <strong>Caixa, comissões e financeiro do salão</strong>. Base legal: cumprimento de
              obrigações legais e fiscais.
            </li>
            <li>
              <strong>Avisar de vagas e chamar de volta</strong> quando passar o tempo do serviço. Só
              com o seu consentimento, que pode ser retirado a qualquer momento.
            </li>
            <li>
              <strong>Fotos na ficha técnica</strong>: só com autorização registrada.
            </li>
          </ul>
          <p>Os dados não são vendidos nem usados para publicidade de terceiros.</p>
        </Section>

        <Section title="Com quem compartilhamos">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Provedor de WhatsApp</strong> escolhido pelo salão, para enviar as mensagens
              (telefone e texto da mensagem).
            </li>
            <li>
              <strong>Mercado Pago</strong>, quando o salão cobra sinal ou mensalidade pelo Pix
              (valor e identificação da cobrança).
            </li>
            <li>
              <strong>Empresa de hospedagem</strong> do servidor onde o sistema roda, contratada pela
              Impulsio Digital.
            </li>
            <li>Autoridades, quando a lei exigir.</li>
          </ul>
        </Section>

        <Section title="Por quanto tempo">
          <ul className="list-disc space-y-1 pl-5">
            <li>Cadastro: enquanto você for cliente do salão ou até pedir a exclusão.</li>
            <li>Mensagens de WhatsApp: 12 meses; depois são apagadas automaticamente.</li>
            <li>
              Atendimentos e pagamentos: pelo prazo das obrigações fiscais. Se você pedir a exclusão,
              eles ficam sem o seu nome, telefone e e-mail.
            </li>
            <li>Registro de ações da equipe: 5 anos.</li>
          </ul>
        </Section>

        <Section title="Como protegemos">
          <ul className="list-disc space-y-1 pl-5">
            <li>Conexão sempre cifrada (HTTPS).</li>
            <li>Cada salão tem o próprio banco de dados, separado dos outros.</li>
            <li>
              Acesso por função: o profissional vê a própria agenda; caixa, relatórios e dados de
              clientes ficam com o dono e a recepção.
            </li>
            <li>
              Bloqueio do acesso depois de senhas erradas seguidas e encerramento das sessões ao
              trocar a senha.
            </li>
            <li>Tokens de pagamento e de WhatsApp guardados cifrados.</li>
            <li>Cópias de segurança diárias, cifradas.</li>
            <li>Registro de quem baixou, alterou ou removeu dados de clientes.</li>
          </ul>
        </Section>

        <Section title="Seus direitos">
          <p>
            Você pode pedir a qualquer momento: confirmação de que tratamos seus dados, uma cópia
            deles, correção, exclusão ou anonimização, a retirada do consentimento para avisos e a
            informação de com quem eles foram compartilhados (art. 18 da LGPD).
          </p>
          <p>
            <strong>Como pedir:</strong> fale com o salão em que você é cliente. O dono do salão
            entrega a cópia ou remove os dados direto pelo painel. Se não conseguir resolver com o
            salão, fale com a Impulsio Digital pelo WhatsApp{' '}
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {WHATSAPP_DISPLAY}
            </a>
            . Você também pode recorrer à Autoridade Nacional de Proteção de Dados (ANPD).
          </p>
        </Section>

        <Section title="Mudanças nesta política">
          <p>
            Quando o sistema passar a guardar outros dados ou usá-los de outro jeito, esta página
            será atualizada e a data no topo mudará.
          </p>
        </Section>
      </main>
    </div>
  )
}
