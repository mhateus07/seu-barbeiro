/** Última volta completa das rotinas automáticas, lida pela verificação de saúde. */
let lastRun: number | null = null

export function markWorkerRun() {
  lastRun = Date.now()
}

export function workerLastRun() {
  return lastRun
}
