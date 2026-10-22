import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BrandMark } from '../../components/ui/BrandMark'
import { getPublicInfo } from '../../api/public.api'
import { segmentBrand, useApplyBrand, useBrand } from '../../brand/brand'

/**
 * Moldura das páginas abertas pelo cliente (link do WhatsApp). O nome do salão
 * vem primeiro; a marca (Belaza ou Seu Barbeiro, pelo segmento do salão) aparece
 * só no rodapé.
 */
export function PublicShell({ title, children }: { title?: string; children: ReactNode }) {
  const { data: info } = useQuery({ queryKey: ['public-info'], queryFn: getPublicInfo })
  useApplyBrand(info ? segmentBrand(info.segment) : undefined)
  const brand = useBrand()
  return (
    <div className="on-ink flex min-h-dvh flex-col bg-zinc-950 text-espuma">
      <header className="border-b border-white/10 bg-navalha pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-5 py-4">
          <BrandMark variant="negative" className="h-8 w-8" />
          <p className="font-display text-[17px] font-bold">{title || 'Seu horário'}</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 animate-pop-in px-5 py-8">{children}</main>
      <footer className="flex items-center justify-center gap-2 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 text-xs text-zinc-500">
        <span>Feito com {brand.name}</span>
        <a href="/privacidade" className="underline underline-offset-2 hover:text-espuma">
          Privacidade
        </a>
      </footer>
    </div>
  )
}
