import { z } from 'zod'

export const updateSettingsSchema = z.object({
  settings: z.record(z.string(), z.string()),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>

// Valores padrão das configurações
export const SETTING_DEFAULTS: Record<string, string> = {
  shop_name: 'Meu salão',
  // Segmento: beauty (salão de beleza, marca Belaza) | barbershop (barbearia, marca
  // Seu Barbeiro). Muda marca, cores e textos do painel e das páginas do cliente.
  // Salões antigos, sem o valor gravado, continuam como barbearia.
  shop_segment: 'barbershop',
  shop_logo: '',
  shop_description: 'Conheça nossos serviços e escolha seu próximo horário.',
  shop_phone: '',
  shop_address: '',
  shop_instagram: '',
  hours_monday: '08:00-19:00',
  hours_tuesday: '08:00-19:00',
  hours_wednesday: '08:00-19:00',
  hours_thursday: '08:00-19:00',
  hours_friday: '08:00-19:00',
  hours_saturday: '08:00-16:00',
  hours_sunday: 'closed',
  loyalty_enabled: 'true',
  loyalty_points_per_visit: '10',
  loyalty_redemption_points: '100',
  loyalty_redemption_value: '10',
  waitlist_auto_offer: 'false',
  whatsapp_enabled: 'false',
  whatsapp_api_url: '',
  whatsapp_api_key: '',
  whatsapp_instance: '',
  whatsapp_reminder_hours: '24',
  // Link do cliente: antecedência mínima (horas) para confirmar, remarcar ou cancelar.
  client_change_min_hours: '2',
  // Pix via Mercado Pago. O token nunca volta para o navegador.
  mp_access_token: '',
  // Sinal: off | all (todos) | no_show (só quem faltou nos últimos 12 meses)
  deposit_mode: 'off',
  deposit_type: 'percent',
  deposit_value: '30',
  deposit_expire_minutes: '30',
  // Assinaturas: dias de antecedência da cobrança e prazo do Pix.
  subscription_notice_days: '3',
  subscription_grace_days: '5',
}

/** Configurações que só o servidor lê; o painel recebe apenas se estão preenchidas. */
export const SECRET_SETTINGS = ['mp_access_token', 'whatsapp_api_key']
