// Aplica o tema e a marca salvos antes da primeira pintura para evitar piscar.
// Arquivo próprio (e não script em linha) porque a CSP só permite scripts do domínio.
try {
  var t = localStorage.getItem('sb-theme')
  if (t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches))
    document.documentElement.dataset.theme = 'dark'
  // Site e entrada seguem o domínio; painel e páginas do cliente, a última marca
  // do salão (src/brand/brand.ts confirma depois de carregar o salão).
  var p = location.pathname
  var b = p === '/' || p === '/login' || p === '/privacidade'
    ? (/belaza/.test(location.hostname) || /[?&]marca=belaza/.test(location.search) ? 'belaza' : '')
    : localStorage.getItem('sb-brand')
  if (b === 'belaza') document.documentElement.dataset.brand = 'belaza'
} catch (e) {}
