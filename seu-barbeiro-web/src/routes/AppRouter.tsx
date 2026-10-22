import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PrivateRoute } from './PrivateRoute'
import { AdminLayout } from '../components/layout/AdminLayout'
import { LoginPage } from '../pages/LoginPage'

// Cada tela é baixada só quando aberta, para o painel carregar mais rápido.
const page = <T extends Record<string, React.ComponentType>>(
  load: () => Promise<T>,
  name: keyof T,
) => lazy(async () => ({ default: (await load())[name] }))

const OperationsPage = page(() => import('../pages/operations/OperationsPage'), 'OperationsPage')
const OfferPage = page(() => import('../pages/operations/OfferPage'), 'OfferPage')
const DashboardPage = page(() => import('../pages/dashboard/DashboardPage'), 'DashboardPage')
const BarbersPage = page(() => import('../pages/barbers/BarbersPage'), 'BarbersPage')
const ServicesPage = page(() => import('../pages/services/ServicesPage'), 'ServicesPage')
const ClientsPage = page(() => import('../pages/clients/ClientsPage'), 'ClientsPage')
const AppointmentsPage = page(() => import('../pages/appointments/AppointmentsPage'), 'AppointmentsPage')
const FinancesPage = page(() => import('../pages/finances/FinancesPage'), 'FinancesPage')
const ShowcasePage = page(() => import('../pages/showcase/ShowcasePage'), 'ShowcasePage')
const SettingsPage = page(() => import('../pages/settings/SettingsPage'), 'SettingsPage')
const BookingPage = page(() => import('../pages/booking/BookingPage'), 'BookingPage')
const PayPage = page(() => import('../pages/public/PayPage'), 'PayPage')
const ManagePage = page(() => import('../pages/public/ManagePage'), 'ManagePage')
const SubscriptionsPage = page(() => import('../pages/subscriptions/SubscriptionsPage'), 'SubscriptionsPage')
const CashPage = page(() => import('../pages/cash/CashPage'), 'CashPage')
const HomePage = page(() => import('../pages/site/HomePage'), 'HomePage')
const PrivacyPage = page(() => import('../pages/site/PrivacyPage'), 'PrivacyPage')

const publicFallback = <div className="min-h-dvh bg-zinc-950" />

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Raiz do site: a apresentação abre sempre, como no Pedeli. */}
        <Route
          path="/"
          element={<Suspense fallback={<div className="min-h-dvh bg-navalha" />}><HomePage /></Suspense>}
        />
        <Route
          path="/privacidade"
          element={<Suspense fallback={<div className="min-h-dvh bg-white" />}><PrivacyPage /></Suspense>}
        />
        <Route
          path="/oferta"
          element={<Suspense fallback={publicFallback}><OfferPage /></Suspense>}
        />
        <Route
          path="/agendar"
          element={<Suspense fallback={publicFallback}><BookingPage /></Suspense>}
        />
        <Route
          path="/pagar/:token"
          element={<Suspense fallback={publicFallback}><PayPage /></Suspense>}
        />
        <Route
          path="/meu-horario/:token"
          element={<Suspense fallback={publicFallback}><ManagePage /></Suspense>}
        />
        <Route element={<PrivateRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/operacao" element={<OperationsPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/barbeiros" element={<BarbersPage />} />
            <Route path="/servicos" element={<ServicesPage />} />
            <Route path="/clientes" element={<ClientsPage />} />
            <Route path="/agendamentos" element={<AppointmentsPage />} />
            <Route path="/financeiro" element={<FinancesPage />} />
            <Route path="/assinaturas" element={<SubscriptionsPage />} />
            <Route path="/caixa" element={<CashPage />} />
            <Route path="/vitrine" element={<ShowcasePage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/operacao" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
