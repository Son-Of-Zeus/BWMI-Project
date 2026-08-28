import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/DashboardHeader'
import PrototypeFooter from '../components/PrototypeFooter'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const CONTRIBUTION_HISTORY = MONTHS.map((month, index) => ({
  month,
  year: 2023,
  amount: index < 10 ? 10417 : 10416,
  status: index < 10 ? 'Synthetic completed' : 'Synthetic pending',
}))

const LAST_TRANSACTIONS = CONTRIBUTION_HISTORY.slice(-6)
  .reverse()
  .map((entry) => ({
    date: `${entry.month.slice(0, 3)} ${entry.year}`,
    description: 'Monthly provident-fund contribution (synthetic example)',
    amount: entry.amount,
    status: entry.status,
  }))

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function StatusBadge({ status }) {
  const isCompleted = status === 'Synthetic completed'
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isCompleted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
      }`}
    >
      {status}
    </span>
  )
}

export default function AccountBalance() {
  const { member, logout } = useAuth()
  const navigate = useNavigate()

  const employeeContribution = Math.round(member.contribution / 2)
  const employerContribution = member.contribution - employeeContribution

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleDownload = () => {
    alert('Synthetic statement downloaded as PDF')
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <DashboardHeader member={member} onLogout={handleLogout} />

      <div className="flex flex-1">
        <Sidebar activeItem="Account" onSelect={(item) => {
          const routes = {
            Account: '/dashboard/account',
            Passbook: '/dashboard/passbook',
            Nominee: '/dashboard/nominee',
            Withdrawal: '/dashboard/withdrawal',
          }
          navigate(routes[item] ?? '/dashboard')
        }} />

        <main className="flex-1 p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="mb-2 text-sm font-medium text-[#1a3a6b] hover:underline"
              >
                ← Back to Dashboard
              </button>
              <h2 className="text-2xl font-semibold text-gray-800">Account Balance (Demo)</h2>
              <p className="mt-1 text-sm text-gray-600">
                View a synthetic provident-fund account snapshot and contribution history.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded bg-[#1a3a6b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#143055]"
            >
              Download synthetic statement
            </button>
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Synthetic current balance', value: member.balance },
              { label: 'Synthetic total contribution', value: member.contribution },
              { label: 'Synthetic employee contribution', value: employeeContribution },
              { label: 'Synthetic employer contribution', value: employerContribution },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded border border-gray-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {item.label}
                </p>
                <p className="mt-2 text-xl font-semibold text-[#1a3a6b]">
                  {formatCurrency(item.value)}
                </p>
              </div>
            ))}
          </div>

          <section className="mb-8 rounded border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h3 className="font-semibold text-gray-800">
                Synthetic contribution history (Jan 2023 – Dec 2023)
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Every amount and status in this table is synthetic demo data.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Month</th>
                    <th className="px-5 py-3 font-medium">Year</th>
                    <th className="px-5 py-3 font-medium">Synthetic amount</th>
                    <th className="px-5 py-3 font-medium">Synthetic status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {CONTRIBUTION_HISTORY.map((row) => (
                    <tr key={`${row.month}-${row.year}`} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-800">{row.month}</td>
                      <td className="px-5 py-3 text-gray-600">{row.year}</td>
                      <td className="px-5 py-3 font-medium text-gray-800">
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-5 py-4">
              <h3 className="font-semibold text-gray-800">Synthetic recent transactions</h3>
              <p className="mt-1 text-xs text-gray-500">
                These transaction examples are not connected to a real account.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Synthetic description</th>
                    <th className="px-5 py-3 font-medium">Synthetic amount</th>
                    <th className="px-5 py-3 font-medium">Synthetic status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {LAST_TRANSACTIONS.map((txn) => (
                    <tr key={txn.date} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-800">{txn.date}</td>
                      <td className="px-5 py-3 text-gray-600">{txn.description}</td>
                      <td className="px-5 py-3 font-medium text-gray-800">
                        {formatCurrency(txn.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={txn.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      <PrototypeFooter />
    </div>
  )
}
