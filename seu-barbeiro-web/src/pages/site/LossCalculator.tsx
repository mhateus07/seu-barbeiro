import { useEffect, useId, useState } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

/*
  Simulação do quanto a barbearia perde com faltas sem aviso. Os números são do
  próprio dono; não afirmamos taxa de falta de ninguém. O quadro de 100
  quadrados mostra a mesma porcentagem: cada um é 1% dos atendimentos.
*/

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Valor em reais que corre até o novo número quando muda. */
function Money({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => brl.format(Math.round(v)))
  useEffect(() => {
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] })
    return () => controls.stop()
  }, [value, reduce, mv])
  return <motion.span className={className}>{text}</motion.span>
}

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  const id = useId()
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-[15px] text-zinc-600">
          {label}
        </label>
        <span className="hora text-lg text-zinc-900">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="faixa-range mt-3 w-full"
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
      />
    </div>
  )
}

export function LossCalculator() {
  const [atendimentos, setAtendimentos] = useState(400)
  const [ticket, setTicket] = useState(50)
  const [faltas, setFaltas] = useState(8)
  const [duracao, setDuracao] = useState(45)

  const faltasMes = Math.round(atendimentos * (faltas / 100))
  const porMes = faltasMes * ticket
  const porAno = porMes * 12
  const horas = Math.round((faltasMes * duracao) / 60)
  const sinal = ticket * 0.3

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white">
      {/* Resultado */}
      <div className="grid gap-8 border-b border-zinc-200 p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div className="min-w-0">
          <p className="text-[15px] text-zinc-500">Perdido com faltas, por mês</p>
          <p
            className="tabular mt-3 text-[clamp(3.5rem,16vw,8.5rem)] font-semibold leading-[0.9] tracking-[-0.05em] text-accent"
            aria-live="polite"
          >
            <Money value={porMes} />
          </p>
        </div>
        <dl className="grid grid-cols-3 border-t border-zinc-200 lg:grid-cols-1 lg:border-t-0">
          {(
            [
              ['Por ano', <Money key="ano" value={porAno} />],
              ['Horários vazios', String(faltasMes)],
              ['Cadeira parada', `${horas} h`],
            ] as const
          ).map(([k, v]) => (
            <div
              key={k}
              className="flex flex-col gap-1 border-zinc-200 py-3 pr-2 not-first:pl-3 not-last:border-r lg:not-first:pl-0 lg:flex-row lg:items-baseline lg:justify-between lg:border-b lg:pr-0 lg:not-last:border-r-0 lg:last:border-b-0"
            >
              <dt className="text-[13px] text-zinc-500 sm:text-[15px]">{k}</dt>
              <dd className="hora text-base text-zinc-900 sm:text-xl">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Números da barbearia e o quadro */}
      <div className="grid lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-8 p-6 sm:grid-cols-2 sm:gap-x-10 sm:p-10">
          <Slider
            label="Atendimentos por mês"
            value={atendimentos}
            display={atendimentos.toLocaleString('pt-BR')}
            min={50}
            max={1500}
            step={10}
            onChange={setAtendimentos}
          />
          <Slider label="Ticket médio" value={ticket} display={brl.format(ticket)} min={20} max={250} step={5} onChange={setTicket} />
          <Slider
            label="Clientes que faltam sem avisar"
            value={faltas}
            display={`${faltas}%`}
            min={1}
            max={30}
            step={1}
            onChange={setFaltas}
          />
          <Slider
            label="Duração do atendimento"
            value={duracao}
            display={`${duracao} min`}
            min={15}
            max={180}
            step={5}
            onChange={setDuracao}
          />
          <p className="text-[15px] leading-relaxed text-zinc-600 sm:col-span-2">
            Com sinal de 30% no Pix, cada falta ainda deixa{' '}
            <span className="hora text-zinc-900">{brl.format(sinal)}</span> no caixa.
          </p>
        </div>

        <figure className="border-t border-zinc-200 p-6 sm:p-10 lg:border-l lg:border-t-0">
          <div className="mx-auto grid max-w-[300px] grid-cols-10 gap-1 sm:gap-1.5" aria-hidden="true">
            {Array.from({ length: 100 }, (_, i) => (
              <span
                key={i}
                className={`aspect-square rounded-[2px] transition-colors duration-300 ${
                  i >= 100 - faltas ? 'bg-accent' : 'bg-zinc-200'
                }`}
                style={{ transitionDelay: `${(99 - i) * 6}ms` }}
              />
            ))}
          </div>
          <figcaption className="mx-auto mt-5 max-w-[300px] text-sm leading-relaxed text-zinc-500">
            Cada quadrado é 1% dos atendimentos do mês. Em vermelho, os{' '}
            <span className="hora text-zinc-900">{faltasMes}</span> horários em que o cliente não veio.
          </figcaption>
        </figure>
      </div>

      <p className="border-t border-zinc-200 px-6 py-4 text-xs leading-relaxed text-zinc-500 sm:px-10">
        Simulação. Use os números da sua barbearia: quantos atendimentos você faz, quanto cobra em média
        e quantos clientes costumam não aparecer.
      </p>
    </div>
  )
}
