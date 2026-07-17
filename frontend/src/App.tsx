import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
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
import { AddSip } from './pages/AddSip'
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public / auth screens (no app chrome) */}
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Transactional Form 16 screens — centered, no app shell */}
          <Route path="/form16/upload" element={<Form16Upload />} />
          <Route path="/form16/processing" element={<Form16Processing />} />
          <Route path="/form16/recommendation/loading" element={<RecommendationLoading />} />

          {/* App shell — Layout renders the sidebar/header/footer + <Outlet/> */}
          <Route path="/*" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="income" element={<Income />} />
            <Route path="income/new" element={<AddIncome />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="recurring" element={<Recurring />} />
            <Route path="investments" element={<Investments />} />
            <Route path="investments/add-sip" element={<AddSip />} />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
