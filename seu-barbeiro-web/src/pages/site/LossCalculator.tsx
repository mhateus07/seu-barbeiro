import { useId, useState } from 'react'

/*
  Simulação do quanto o salão perde com faltas sem aviso. Os números são do
  próprio dono; não afirmamos taxa de falta de ninguém.
*/

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

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
        <label htmlFor={id} className="text-[15px] text-zinc-700">
          {label}
        </label>
        <span className="hora text-[15px] text-zinc-900">{display}</span>
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
    <div className="grid rounded-lg border border-zinc-300 bg-white lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-8 p-7 sm:p-10">
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
          label="Duração média do atendimento"
          value={duracao}
          display={`${duracao} min`}
          min={15}
          max={180}
          step={5}
          onChange={setDuracao}
        />
        <p className="text-xs leading-relaxed text-zinc-500">
          Simulação. Use os números do seu salão: quantos atendimentos você faz, quanto cobra em
          média e quantos clientes costumam não aparecer.
        </p>
      </div>

      <div className="flex flex-col border-t border-zinc-200 p-7 sm:p-10 lg:border-l lg:border-t-0">
        <p className="text-sm text-zinc-500">Perdido com faltas por mês</p>
        <p className="hora mt-2 text-[2.5rem] font-medium leading-none text-zinc-900" aria-live="polite">
          {brl.format(porMes)}
        </p>
        <dl className="mt-8 border-t border-zinc-200 text-[15px]">
          {(
            [
              ['Por ano', brl.format(porAno)],
              ['Horários perdidos no mês', String(faltasMes)],
              ['Cadeira parada no mês', `${horas} h`],
              ['Com sinal de 30% no Pix, cada falta deixa', brl.format(sinal)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 border-b border-zinc-200 py-3">
              <dt className="text-zinc-600">{k}</dt>
              <dd className="hora shrink-0 text-zinc-900">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
