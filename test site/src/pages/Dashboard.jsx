import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/DashboardHeader'
import PrototypeFooter from '../components/PrototypeFooter'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'

export default function Dashboard() {
  const { member, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleMenuSelect = (item) => {
    const routes = {
      Account: '/dashboard/account',
      Passbook: '/dashboard/passbook',
      Nominee: '/dashboard/nominee',
      Withdrawal: '/dashboard/withdrawal',
    }
    navigate(routes[item] ?? '/dashboard')
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <DashboardHeader member={member} onLogout={handleLogout} />

      <div className="flex flex-1">
        <Sidebar activeItem="" onSelect={handleMenuSelect} />

        <main className="flex-1 p-6">
          <h2 className="text-2xl font-semibold text-gray-800">Welcome to the synthetic demo</h2>
          <p className="mt-2 text-sm text-gray-600">
            Select a demo service from the sidebar to explore synthetic account workflows.
          </p>
        </main>
      </div>

      <PrototypeFooter />
    </div>
  )
}
