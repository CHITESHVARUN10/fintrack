import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { AuthGuard } from './components/layout/AuthGuard'
import { ConfirmationProvider } from './components/ui/ConfirmationProvider'
import { Layout } from './components/layout/Layout'
import { navItems } from './components/layout/nav'
import { registerPrefetcher, prefetchRoute } from './lib/routePrefetch'
// Route-level code splitting — each page is its own chunk, so the first
// paint only ships the shell; heavy pages (recharts, reports) load on
// navigation. Each loader is registered by pathname so the sidebar can warm
// it on hover/focus.
const load = (path: string, loader: () => Promise<unknown>, exportName: string) => {
  let pending: Promise<Record<string, ComponentType>> | undefined
  const getModule = () => (pending ??= loader() as Promise<Record<string, ComponentType>>)
  registerPrefetcher(path, getModule)
  return lazy(() => getModule().then((m) => ({ default: m[exportName] })))
}

const Landing = load('/', () => import('./pages/Landing'), 'Landing')
const Login = load('/login', () => import('./pages/Login'), 'Login')
const Register = load('/register', () => import('./pages/Register'), 'Register')
const AcceptInvite = load('/accept-invite/:token', () => import('./pages/AcceptInvite'), 'AcceptInvite')
const PrivacyPolicy = load('/privacy', () => import('./pages/PrivacyPolicy'), 'PrivacyPolicy')
const Docs = load('/docs', () => import('./pages/Docs'), 'Docs')

const Dashboard = load('/dashboard', () => import('./pages/Dashboard'), 'Dashboard')
const Income = load('/income', () => import('./pages/Income'), 'Income')
const AddIncome = load('/income/new', () => import('./pages/AddIncome'), 'AddIncome')
const Subscriptions = load('/subscriptions', () => import('./pages/Subscriptions'), 'Subscriptions')
const SubscriptionDetail = load('/subscriptions/:id', () => import('./pages/SubscriptionDetail'), 'SubscriptionDetail')
const Investments = load('/investments', () => import('./pages/Investments'), 'Investments')
const Tax = load('/tax', () => import('./pages/Tax'), 'Tax')
const Reports = load('/reports', () => import('./pages/Reports'), 'Reports')
const Family = load('/family', () => import('./pages/Family'), 'Family')
const Notifications = load('/notifications', () => import('./pages/Notifications'), 'Notifications')
const Transactions = load('/transactions', () => import('./pages/Transactions'), 'Transactions')
const ImportPage = load('/import', () => import('./pages/ImportPage'), 'ImportPage')
const FamilyDashboard = load('/family/dashboard', () => import('./pages/FamilyDashboard'), 'FamilyDashboard')
const Vendors = load('/vendors', () => import('./pages/Vendors'), 'Vendors')
const VendorDetail = load('/vendors/:id', () => import('./pages/VendorDetail'), 'VendorDetail')
const Budgets = load('/budgets', () => import('./pages/Budgets'), 'Budgets')
const Settings = load('/settings', () => import('./pages/Settings'), 'Settings')

// Route-transition placeholder shown while a page chunk streams in.
function PageFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center font-bold uppercase tracking-widest text-on-surface-variant">
      Loading…
    </div>
  )
}

// Warm the sidebar's route chunks once an authenticated shell is on screen.
// Chunks are small (9–50 KB) and this only runs after login, so landing/login
// visitors never download pages they cannot reach. Navigation-specific chunks
// still warm earlier on hover/focus via the sidebar.
function useIdleRoutePrefetch(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const kickoff = () => {
      navItems.forEach((item) => prefetchRoute(item.to))
    }
    const timer = window.setTimeout(kickoff, 1500)
    return () => window.clearTimeout(timer)
  }, [enabled])
}


function AnimatedRoutes() {
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  useIdleRoutePrefetch(isAuthenticated)
  // Route entry is a CSS animation that starts from visible: the old
  // AnimatePresence/mode="wait" pair held the incoming page at opacity 0 and
  // could stall a suspended route, leaving a blank screen until a repaint.
  return (
    <div key={location.pathname} className="nb-page-enter min-h-full">
      <Suspense fallback={<PageFallback />}>
          <Routes location={location}>
          {/* Public / auth screens (no app chrome) */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/terms" element={<PrivacyPolicy />} />

          {/* App shell — Layout renders the sidebar/header/footer + <Outlet/> */}
          <Route
            element={
              <AuthGuard>
                <Layout />
              </AuthGuard>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="family/dashboard" element={<FamilyDashboard />} />
            <Route path="vendors" element={<Vendors />} />
            <Route path="vendors/:id" element={<VendorDetail />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="budgets" element={<Budgets />} />
            <Route path="income" element={<Income />} />
            <Route path="income/new" element={<AddIncome />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="subscriptions/:id" element={<SubscriptionDetail />} />
            <Route path="recurring" element={<Navigate to="/subscriptions" replace />} />
            <Route path="investments" element={<Investments />} />
            <Route path="tax" element={<Tax />} />
            <Route path="reports" element={<Reports />} />
            <Route path="family" element={<Family />} />
            <Route path="expenses" element={<Navigate to="/transactions" replace />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
          </Routes>
      </Suspense>
    </div>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <ConfirmationProvider>
              <AnimatedRoutes />
            </ConfirmationProvider>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </MotionConfig>
  )
}
