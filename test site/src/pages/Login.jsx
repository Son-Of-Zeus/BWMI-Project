import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { isLoggedIn, login } = useAuth()
  const navigate = useNavigate()

  const [uan, setUan] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [redirecting, setRedirecting] = useState(false)

  if (isLoggedIn) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    const result = login(uan.trim(), password)
    if (result.success) {
      setUan('')
      setPassword('')
      setRedirecting(true)
      setTimeout(() => navigate('/dashboard'), 1500)
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Header title="Unified Member Portal" />

      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-md rounded border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-800">Member Login</h2>
            <p className="mt-1 text-sm text-gray-600">
              Sign in with your Universal Account Number (UAN)
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
            {error && (
              <div
                role="alert"
                className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {redirecting && (
              <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                Redirecting to Dashboard...
              </div>
            )}

            <div>
              <label htmlFor="uan" className="mb-1 block text-sm font-medium text-gray-700">
                UAN (Universal Account Number)
              </label>
              <input
                id="uan"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                value={uan}
                onChange={(e) => setUan(e.target.value)}
                disabled={redirecting}
                placeholder="Enter your 12-digit UAN"
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] disabled:bg-gray-100"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={redirecting}
                placeholder="Enter your password"
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 outline-none focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] disabled:bg-gray-100"
              />
            </div>

            <button
              type="submit"
              disabled={redirecting}
              className="w-full rounded bg-[#1a3a6b] px-4 py-2.5 font-medium text-white transition hover:bg-[#143055] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Login
            </button>
          </form>

          <div className="border-t border-gray-200 px-6 py-4 text-xs text-gray-500">
            This is a mock portal for demonstration purposes only.
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-500">
        © Employees&apos; Provident Fund Organisation, Government of India
      </footer>
    </div>
  )
}
