import { lazy, Suspense, type ComponentType } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { AuthProvider } from './context/AuthContext'
import { TaxpayerProvider } from './context/TaxpayerContext'
import { ThemeProvider } from './context/ThemeContext'
import { AuthGuard } from './components/layout/AuthGuard'
import { Layout } from './components/layout/Layout'
// Route-level code splitting — each page is its own chunk, so the first
// paint only ships the shell; heavy pages (recharts, reports) load on
// navigation.
const load = (mod: Promise<unknown>, exportName: string) =>
  lazy(() => (mod as Promise<Record<string, ComponentType>>).then((m) => ({ default: m[exportName] })))

const Landing = load(import('./pages/Landing'), 'Landing')
const Login = load(import('./pages/Login'), 'Login')
const Register = load(import('./pages/Register'), 'Register')
const AcceptInvite = load(import('./pages/AcceptInvite'), 'AcceptInvite')
const PrivacyPolicy = load(import('./pages/PrivacyPolicy'), 'PrivacyPolicy')
const Docs = load(import('./pages/Docs'), 'Docs')

const Dashboard = load(import('./pages/Dashboard'), 'Dashboard')
const Income = load(import('./pages/Income'), 'Income')
const AddIncome = load(import('./pages/AddIncome'), 'AddIncome')
const Subscriptions = load(import('./pages/Subscriptions'), 'Subscriptions')
const SubscriptionDetail = load(import('./pages/SubscriptionDetail'), 'SubscriptionDetail')
const Recurring = load(import('./pages/Recurring'), 'Recurring')
const Investments = load(import('./pages/Investments'), 'Investments')
const Loans = load(import('./pages/Loans'), 'Loans')
const LoanDetail = load(import('./pages/LoanDetail'), 'LoanDetail')
const Insurance = load(import('./pages/Insurance'), 'Insurance')
const Education = load(import('./pages/Education'), 'Education')
const Tax = load(import('./pages/Tax'), 'Tax')
const Reports = load(import('./pages/Reports'), 'Reports')
const Family = load(import('./pages/Family'), 'Family')
const FamilyCreateJoin = load(import('./pages/FamilyCreateJoin'), 'FamilyCreateJoin')
const Notifications = load(import('./pages/Notifications'), 'Notifications')
const Transactions = load(import('./pages/Transactions'), 'Transactions')
const ImportPage = load(import('./pages/ImportPage'), 'ImportPage')
const FamilyDashboard = load(import('./pages/FamilyDashboard'), 'FamilyDashboard')
const Vendors = load(import('./pages/Vendors'), 'Vendors')
const VendorDetail = load(import('./pages/VendorDetail'), 'VendorDetail')
const Budgets = load(import('./pages/Budgets'), 'Budgets')
const Settings = load(import('./pages/Settings'), 'Settings')
const Form16List = load(import('./pages/Form16List'), 'Form16List')
const Form16Upload = load(import('./pages/Form16Upload'), 'Form16Upload')
const Form16Processing = load(import('./pages/Form16Processing'), 'Form16Processing')
const Form16Review = load(import('./pages/Form16Review'), 'Form16Review')
const TaxRecommendation = load(import('./pages/TaxRecommendation'), 'TaxRecommendation')
const RecommendationLoading = load(import('./pages/RecommendationLoading'), 'RecommendationLoading')

// Route-transition placeholder shown while a page chunk streams in.
function PageFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center font-bold uppercase tracking-widest text-on-surface-variant">
      Loading…
    </div>
  )
}


function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
      >
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

          {/* Transactional Form 16 screens — centered, no app shell but still protected */}
          <Route
            path="/form16/upload"
            element={
              <AuthGuard>
                <Form16Upload />
              </AuthGuard>
            }
          />
          <Route
            path="/form16/processing"
            element={
              <AuthGuard>
                <Form16Processing />
              </AuthGuard>
            }
          />
          <Route
            path="/form16/recommendation/loading"
            element={
              <AuthGuard>
                <RecommendationLoading />
              </AuthGuard>
            }
          />

          {/* App shell — Layout renders the sidebar/header/footer + <Outlet/> */}
          <Route
            element={
              <AuthGuard>
                <Layout />
              </AuthGuard>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="family/create-join" element={<FamilyCreateJoin />} />
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
            <Route path="recurring" element={<Recurring />} />
            <Route path="investments" element={<Investments />} />
            <Route path="loans" element={<Loans />} />
            <Route path="loans/:id" element={<LoanDetail />} />
            <Route path="insurance" element={<Insurance />} />
            <Route path="education" element={<Education />} />
            <Route path="tax" element={<Tax />} />
            <Route path="reports" element={<Reports />} />
            <Route path="family" element={<Family />} />
            <Route path="expenses" element={<Navigate to="/transactions" replace />} />
            <Route path="form16" element={<Form16List />} />
            <Route path="form16/review/:id" element={<Form16Review />} />
            <Route path="form16/recommendation/:id" element={<TaxRecommendation />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
          </Routes>
        </Suspense>
      </motion.main>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AuthProvider>
          <TaxpayerProvider>
            <BrowserRouter>
              <AnimatedRoutes />
            </BrowserRouter>
          </TaxpayerProvider>
        </AuthProvider>
      </ThemeProvider>
    </MotionConfig>
  )
}
