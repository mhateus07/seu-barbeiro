// Aplica o tema salvo antes da primeira pintura para evitar piscar.
// Arquivo próprio (e não script em linha) porque a CSP só permite scripts do domínio.
try {
  var t = localStorage.getItem('sb-theme')
  if (t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches))
    document.documentElement.dataset.theme = 'dark'
} catch (e) {}
