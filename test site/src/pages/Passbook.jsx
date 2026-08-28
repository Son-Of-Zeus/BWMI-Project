import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/DashboardHeader'
import PrototypeFooter from '../components/PrototypeFooter'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'

const SYNTHETIC_MEMBER_DETAILS = {
  dob: '15/03/1985',
  mobile: '9876543210',
}

const MONTH_NAMES = [
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

function formatDate(date) {
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function generatePassbookEntries() {
  const entries = []
  let balance = 200000
  let count = 0

  for (let year = 2022; year <= 2023 && count < 24; year += 1) {
    for (let month = 0; month < 12 && count < 24; month += 1) {
      const credit = count >= 22 ? 10416 : 10417
      balance += credit
      const date = new Date(year, month, 5)

      entries.push({
        id: count,
        date,
        monthYear: `${MONTH_NAMES[month]} ${year}`,
        particulars: 'Synthetic employer & employee contribution',
        debit: 0,
        credit,
        balance,
      })
      count += 1
    }
  }

  return entries
}

const PASSBOOK_ENTRIES = generatePassbookEntries()

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Months' },
  ...PASSBOOK_ENTRIES.map((entry) => ({
    value: entry.monthYear,
    label: entry.monthYear,
  })),
]

function navigateForMenu(navigate, item) {
  const routes = {
    Account: '/dashboard/account',
    Passbook: '/dashboard/passbook',
    Nominee: '/dashboard/nominee',
    Withdrawal: '/dashboard/withdrawal',
  }
  navigate(routes[item] ?? '/dashboard')
}

export default function Passbook() {
  const { member, logout } = useAuth()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return PASSBOOK_ENTRIES
    return PASSBOOK_ENTRIES.filter((entry) => entry.monthYear === filter)
  }, [filter])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handlePrint = () => {
    alert('Opening print preview...')
  }

  const handleDownload = () => {
    alert(`Synthetic_Passbook_${member.UAN}.pdf downloaded`)
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <DashboardHeader member={member} onLogout={handleLogout} />

      <div className="flex flex-1">
        <Sidebar
          activeItem="Passbook"
          onSelect={(item) => navigateForMenu(navigate, item)}
        />

        <main className="flex-1 p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="mb-2 text-sm font-medium text-[#1a3a6b] hover:underline"
              >
                ← Back to Dashboard
              </button>
              <h2 className="text-2xl font-semibold text-gray-800">Passbook (Demo)</h2>
              <p className="mt-1 text-sm text-gray-600">
                View synthetic provident-fund transaction examples.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="rounded border border-[#1a3a6b] px-4 py-2 text-sm font-medium text-[#1a3a6b] transition hover:bg-[#1a3a6b] hover:text-white"
              >
                Print synthetic passbook
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="rounded bg-[#1a3a6b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#143055]"
              >
                Download synthetic PDF
              </button>
            </div>
          </div>

          <section className="mb-6 rounded border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Synthetic passbook details
            </h3>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Synthetic name
                </dt>
                <dd className="mt-1 font-medium text-gray-800">{member.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Synthetic UAN
                </dt>
                <dd className="mt-1 font-medium text-gray-800">{member.UAN}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Synthetic DOB
                </dt>
                <dd className="mt-1 font-medium text-gray-800">{SYNTHETIC_MEMBER_DETAILS.dob}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Synthetic mobile
                </dt>
                <dd className="mt-1 font-medium text-gray-800">
                  {SYNTHETIC_MEMBER_DETAILS.mobile}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="font-semibold text-gray-800">Synthetic transaction history</h3>
                <p className="mt-1 text-xs text-gray-500">
                  All rows and amounts below are synthetic demo data.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="month-filter" className="text-sm text-gray-600">
                  Select Month/Year
                </label>
                <select
                  id="month-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b]"
                >
                  {FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Particulars</th>
                    <th className="px-5 py-3 font-medium text-right">Synthetic debit</th>
                    <th className="px-5 py-3 font-medium text-right">Synthetic credit</th>
                    <th className="px-5 py-3 font-medium text-right">Synthetic balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-5 py-3 text-gray-800">
                        {formatDate(entry.date)}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{entry.particulars}</td>
                      <td className="px-5 py-3 text-right text-gray-600">
                        {entry.debit ? formatCurrency(entry.debit) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-green-700">
                        {formatCurrency(entry.credit)}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-gray-800">
                        {formatCurrency(entry.balance)}
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
