import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AuthProvider } from './context/AuthContext'
import { TaxpayerProvider } from './context/TaxpayerContext'
import { AuthGuard } from './components/layout/AuthGuard'
import { Layout } from './components/layout/Layout'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { Income } from './pages/Income'
import { AddIncome } from './pages/AddIncome'
import { Subscriptions } from './pages/Subscriptions'
import { Recurring } from './pages/Recurring'
import { Investments } from './pages/Investments'
import { Loans } from './pages/Loans'
import { Expenses } from './pages/Expenses'
import { Insurance } from './pages/Insurance'
import { Education } from './pages/Education'
import { Tax } from './pages/Tax'
import { Reports } from './pages/Reports'
import { Family } from './pages/Family'
import { Notifications } from './pages/Notifications'
import { Settings } from './pages/Settings'
import { Form16List } from './pages/Form16List'
import { Form16Upload } from './pages/Form16Upload'
import { Form16Processing } from './pages/Form16Processing'
import { Form16Review } from './pages/Form16Review'
import { TaxRecommendation } from './pages/TaxRecommendation'
import { RecommendationLoading } from './pages/RecommendationLoading'
import { AcceptInvite } from './pages/AcceptInvite'

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
        <Routes location={location}>
          {/* Public / auth screens (no app chrome) */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />

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
            <Route path="income" element={<Income />} />
            <Route path="income/new" element={<AddIncome />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="recurring" element={<Recurring />} />
            <Route path="investments" element={<Investments />} />
            <Route path="loans" element={<Loans />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="insurance" element={<Insurance />} />
            <Route path="education" element={<Education />} />
            <Route path="tax" element={<Tax />} />
            <Route path="reports" element={<Reports />} />
            <Route path="family" element={<Family />} />
            <Route path="form16" element={<Form16List />} />
            <Route path="form16/review/:id" element={<Form16Review />} />
            <Route path="form16/recommendation/:id" element={<TaxRecommendation />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </motion.main>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <TaxpayerProvider>
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </TaxpayerProvider>
    </AuthProvider>
  )
}
