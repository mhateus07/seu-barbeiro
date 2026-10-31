import { defineConfig, devices } from '@playwright/test'

// Usa somente banco local salon_test_* (conferido por scripts/preview-demo.cjs).
const database =
  process.env.PREVIEW_DATABASE_URL ??
  'postgresql://postgres:salon_test_only@127.0.0.1:55439/salon_test_b'
const api = 3344
const web = 5199

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${web}`,
    trace: 'retain-on-failure',
    // Para usar um navegador já instalado, em vez do baixado pelo Playwright.
    launchOptions: { executablePath: process.env.E2E_BROWSER || undefined },
  },
  projects: [
    { name: 'computador', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node ../seu-barbeiro-api/scripts/preview-demo.cjs',
      url: `http://127.0.0.1:${api}/health`,
      env: {
        PREVIEW_DATABASE_URL: database,
        PREVIEW_PORT: String(api),
        FRONTEND_URL: `http://localhost:${web}`,
      },
    },
    {
      command: `npx vite --port ${web} --strictPort`,
      url: `http://localhost:${web}`,
      env: { VITE_API_URL: `http://127.0.0.1:${api}/api/v1` },
    },
  ],
})
