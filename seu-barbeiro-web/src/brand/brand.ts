/*
  Duas marcas no mesmo sistema (identidade-visual/): Belaza para salões de beleza
  e Seu Barbeiro para barbearias. O segmento do salão (`shop_segment`) escolhe a
  marca do painel e das páginas do cliente; no site e na tela de entrada vale o
  domínio (ou `?marca=belaza`, para conferir sem o domínio).
  As cores trocam pelo atributo `data-brand` no <html> (index.css); o
  public/theme-init.js aplica a última marca antes da primeira pintura.
*/
import { useEffect, useSyncExternalStore } from 'react'

export type Segment = 'beauty' | 'barbershop'
export type BrandId = 'belaza' | 'seu-barbeiro'

export interface Brand {
  id: BrandId
  name: string
  tagline: string
  /** Cor do logo e da barra do navegador. */
  ink: string
  manifest: string
  favicon: string
  appleIcon: string
  slugExample: string
}

export const BRANDS: Record<BrandId, Brand> = {
  belaza: {
    id: 'belaza',
    name: 'Belaza',
    tagline: 'Gestão para salões de beleza',
    ink: '#3A1C32',
    manifest: '/manifest-belaza.webmanifest',
    favicon: '/brand/belaza-icone-app.svg',
    appleIcon: '/icons/belaza-apple-touch-icon.png',
    slugExample: 'meu-salao',
  },
  'seu-barbeiro': {
    id: 'seu-barbeiro',
    name: 'Seu Barbeiro',
    tagline: 'Gestão para barbearias e salões',
    ink: '#15233F',
    manifest: '/manifest.webmanifest',
    favicon: '/favicon.svg',
    appleIcon: '/icons/apple-touch-icon.png',
    slugExample: 'seu-barbeiro',
  },
}

export const segmentBrand = (segment?: string): BrandId =>
  segment === 'beauty' ? 'belaza' : 'seu-barbeiro'

/** Marca do domínio, usada no site e na tela de entrada. */
export function hostBrand(): BrandId {
  const asked = new URLSearchParams(window.location.search).get('marca')
  if (asked === 'belaza' || asked === 'seu-barbeiro') return asked
  return window.location.hostname.includes('belaza') ? 'belaza' : 'seu-barbeiro'
}

let current: BrandId =
  document.documentElement.dataset.brand === 'belaza' ? 'belaza' : 'seu-barbeiro'
const listeners = new Set<() => void>()

function setHead(selector: string, attr: string, value: string) {
  document.querySelector(selector)?.setAttribute(attr, value)
}

export function applyBrand(id: BrandId) {
  const brand = BRANDS[id]
  document.documentElement.dataset.brand = id
  try {
    localStorage.setItem('sb-brand', id)
  } catch {
    // Sem armazenamento (navegação privada): a marca vale só nesta visita.
  }
  document.title = brand.name
  setHead('meta[name="theme-color"]', 'content', brand.ink)
  setHead('meta[name="apple-mobile-web-app-title"]', 'content', brand.name)
  setHead('link[rel="manifest"]', 'href', brand.manifest)
  setHead('link[rel="icon"]', 'href', brand.favicon)
  setHead('link[rel="apple-touch-icon"]', 'href', brand.appleIcon)
  if (id === current) return
  current = id
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBrand(): Brand {
  return BRANDS[useSyncExternalStore(subscribe, () => current)]
}

/** Aplica a marca enquanto a tela estiver aberta; `undefined` mantém a atual. */
export function useApplyBrand(id: BrandId | undefined) {
  useEffect(() => {
    if (id) applyBrand(id)
  }, [id])
}
