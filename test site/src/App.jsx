import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import AccountBalance from './pages/AccountBalance'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Nominee from './pages/Nominee'
import Passbook from './pages/Passbook'
import Withdrawal from './pages/Withdrawal'
import EmbeddedCompanion from './voice-companion/EmbeddedCompanion'

export default function App() {
  return (
    <AuthProvider>
      <EmbeddedCompanion />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/account"
            element={
              <ProtectedRoute>
                <AccountBalance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/passbook"
            element={
              <ProtectedRoute>
                <Passbook />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/nominee"
            element={
              <ProtectedRoute>
                <Nominee />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/withdrawal"
            element={
              <ProtectedRoute>
                <Withdrawal />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
