import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/DashboardHeader'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'

const WITHDRAWAL_OPTIONS = [
  {
    id: 'partial',
    title: 'Partial Withdrawal',
    description: 'Withdraw a portion of your EPF balance for eligible purposes.',
    availableAmount: 225000,
  },
  {
    id: 'full',
    title: 'Full Withdrawal (Post-Superannuation)',
    description: 'Complete withdrawal after retirement or superannuation.',
    availableAmount: 450000,
  },
  {
    id: 'advance',
    title: 'Advance Against EPF',
    description: 'Short-term advance against your EPF corpus for urgent needs.',
    availableAmount: 100000,
  },
]

const REASONS = ['Medical', 'Education', 'Home Purchase', 'Emergency']

const BANK_DETAILS = {
  account: 'State Bank of India — Account ending 1234',
  ifsc: 'SBIN0001234',
}

const SAMPLE_REQUESTS = [
  {
    id: 'WD2024001189',
    type: 'Partial Withdrawal',
    amount: 50000,
    reason: 'Medical',
    date: '12/08/2024',
    status: 'Approved',
  },
  {
    id: 'WD2024001201',
    type: 'Advance Against EPF',
    amount: 75000,
    reason: 'Emergency',
    date: '05/09/2024',
    status: 'Pending',
  },
  {
    id: 'WD2024001195',
    type: 'Partial Withdrawal',
    amount: 200000,
    reason: 'Home Purchase',
    date: '22/08/2024',
    status: 'Rejected',
  },
]

const EMPTY_FORM = {
  type: 'partial',
  amount: '',
  reason: 'Medical',
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function StatusBadge({ status }) {
  const styles = {
    Approved: 'bg-green-100 text-green-800',
    Pending: 'bg-yellow-100 text-yellow-800',
    Rejected: 'bg-red-100 text-red-800',
  }
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}
    >
      {status}
    </span>
  )
}

function navigateForMenu(navigate, item) {
  const routes = {
    Account: '/dashboard/account',
    Passbook: '/dashboard/passbook',
    Nominee: '/dashboard/nominee',
    Withdrawal: '/dashboard/withdrawal',
  }
  navigate(routes[item] ?? '/dashboard')
}

export default function Withdrawal() {
  const { member, logout } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY_FORM)
  const [amountError, setAmountError] = useState('')
  const [requests, setRequests] = useState(SAMPLE_REQUESTS)
  const [selectedCard, setSelectedCard] = useState('partial')

  const selectedOption = useMemo(
    () => WITHDRAWAL_OPTIONS.find((opt) => opt.id === form.type) ?? WITHDRAWAL_OPTIONS[0],
    [form.type],
  )

  const maxAmount = selectedOption.availableAmount

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (name === 'type') {
      setSelectedCard(value)
      setAmountError('')
    }
    if (name === 'amount') {
      setAmountError('')
    }
  }

  const handleCardSelect = (optionId) => {
    setSelectedCard(optionId)
    setForm((prev) => ({ ...prev, type: optionId, amount: '' }))
    setAmountError('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const amount = Number(form.amount)

    if (!amount || amount <= 0) {
      setAmountError('Please enter a valid amount.')
      return
    }
    if (amount > maxAmount) {
      setAmountError(`Amount cannot exceed ${formatCurrency(maxAmount)}.`)
      return
    }

    const requestId = 'WD2024001234'
    alert(`Request submitted with ID: ${requestId}`)

    setRequests((prev) => [
      {
        id: requestId,
        type: selectedOption.title,
        amount,
        reason: form.reason,
        date: new Date().toLocaleDateString('en-GB'),
        status: 'Pending',
      },
      ...prev,
    ])

    setForm({ ...EMPTY_FORM, type: form.type })
    setAmountError('')
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <DashboardHeader member={member} onLogout={handleLogout} />

      <div className="flex flex-1">
        <Sidebar activeItem="Withdrawal" onSelect={(item) => navigateForMenu(navigate, item)} />

        <main className="flex-1 p-6">
          <div className="mb-6">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="mb-2 text-sm font-medium text-[#1a3a6b] hover:underline"
            >
              ← Back to Dashboard
            </button>
            <h2 className="text-2xl font-semibold text-gray-800">Withdrawal Request</h2>
            <p className="mt-1 text-sm text-gray-600">Submit and track your EPF withdrawal requests</p>
          </div>

          <section className="mb-8 grid gap-4 md:grid-cols-3">
            {WITHDRAWAL_OPTIONS.map((option) => {
              const isSelected = selectedCard === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleCardSelect(option.id)}
                  className={`rounded border p-5 text-left shadow-sm transition ${
                    isSelected
                      ? 'border-[#1a3a6b] bg-blue-50 ring-1 ring-[#1a3a6b]'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <h3 className="font-semibold text-gray-800">{option.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{option.description}</p>
                  <p className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Available Amount
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#1a3a6b]">
                    {formatCurrency(option.availableAmount)}
                  </p>
                </button>
              )
            })}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-semibold text-gray-800">New Withdrawal Request</h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="type" className="mb-1 block text-sm font-medium text-gray-700">
                    Withdrawal Type
                  </label>
                  <select
                    id="type"
                    name="type"
                    value={form.type}
                    onChange={handleChange}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b]"
                  >
                    {WITHDRAWAL_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="amount" className="mb-1 block text-sm font-medium text-gray-700">
                    Amount
                  </label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    min="1"
                    max={maxAmount}
                    required
                    value={form.amount}
                    onChange={handleChange}
                    placeholder={`Max: ${formatCurrency(maxAmount)}`}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b]"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Maximum allowed: {formatCurrency(maxAmount)}
                  </p>
                  {amountError && (
                    <p className="mt-1 text-xs text-red-600" role="alert">
                      {amountError}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="reason" className="mb-1 block text-sm font-medium text-gray-700">
                    Reason
                  </label>
                  <select
                    id="reason"
                    name="reason"
                    value={form.reason}
                    onChange={handleChange}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b]"
                  >
                    {REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="bank" className="mb-1 block text-sm font-medium text-gray-700">
                    Bank Account
                  </label>
                  <input
                    id="bank"
                    type="text"
                    readOnly
                    value={BANK_DETAILS.account}
                    className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                  />
                </div>

                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">IFSC Code</p>
                  <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">
                    {BANK_DETAILS.ifsc}
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full rounded bg-[#1a3a6b] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#143055]"
                >
                  Submit Request
                </button>
              </form>
            </section>

            <section className="rounded border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <h3 className="font-semibold text-gray-800">Recent Withdrawal Requests</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Request ID</th>
                      <th className="px-5 py-3 font-medium">Type</th>
                      <th className="px-5 py-3 font-medium">Amount</th>
                      <th className="px-5 py-3 font-medium">Reason</th>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {requests.map((req) => (
                      <tr key={req.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-800">{req.id}</td>
                        <td className="px-5 py-3 text-gray-600">{req.type}</td>
                        <td className="px-5 py-3 text-gray-800">{formatCurrency(req.amount)}</td>
                        <td className="px-5 py-3 text-gray-600">{req.reason}</td>
                        <td className="px-5 py-3 text-gray-600">{req.date}</td>
                        <td className="px-5 py-3">
                          <StatusBadge status={req.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>

      <footer className="border-t border-gray-200 bg-white py-3 text-center text-xs text-gray-500">
        © Employees&apos; Provident Fund Organisation, Government of India
      </footer>
    </div>
  )
}
