import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/DashboardHeader'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'

const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Other']

const INITIAL_NOMINEES = [
  {
    id: 1,
    name: 'Priya Kumar',
    relationship: 'Spouse',
    percentage: 100,
    dob: '15/05/1992',
    address: '42, MG Road, Bengaluru, Karnataka - 560001',
    status: 'Verified',
  },
]

const EMPTY_FORM = {
  name: '',
  relationship: 'Spouse',
  percentage: '',
  dob: '',
  address: '',
}

function formatDisplayDate(isoDate) {
  if (!isoDate) return ''
  if (isoDate.includes('/')) return isoDate
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

function StatusBadge({ status }) {
  const isVerified = status === 'Verified'
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
      }`}
    >
      {status}
    </span>
  )
}

function DeleteIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
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

export default function Nominee() {
  const { member, logout } = useAuth()
  const navigate = useNavigate()
  const [nominees, setNominees] = useState(INITIAL_NOMINEES)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    const nomineeData = {
      name: form.name.trim(),
      relationship: form.relationship,
      percentage: Number(form.percentage),
      dob: formatDisplayDate(form.dob),
      address: form.address.trim(),
      status: 'Pending',
    }

    if (editingId) {
      setNominees((prev) =>
        prev.map((n) => (n.id === editingId ? { ...n, ...nomineeData, status: 'Pending' } : n)),
      )
      setEditingId(null)
    } else {
      setNominees((prev) => [...prev, { id: Date.now(), ...nomineeData }])
    }

    setForm(EMPTY_FORM)
    alert('Nominee updated successfully. Awaiting EPFO verification')
  }

  const handleEdit = (nominee) => {
    setEditingId(nominee.id)
    const [day, month, year] = nominee.dob.split('/')
    setForm({
      name: nominee.name,
      relationship: nominee.relationship,
      percentage: String(nominee.percentage),
      dob: `${year}-${month}-${day}`,
      address: nominee.address,
    })
  }

  const handleDelete = (id) => {
    setNominees((prev) => prev.filter((n) => n.id !== id))
    if (editingId === id) {
      setEditingId(null)
      setForm(EMPTY_FORM)
    }
  }

  const primaryNominee = nominees[0]

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <DashboardHeader member={member} onLogout={handleLogout} />

      <div className="flex flex-1">
        <Sidebar activeItem="Nominee" onSelect={(item) => navigateForMenu(navigate, item)} />

        <main className="flex-1 p-6">
          <div className="mb-6">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="mb-2 text-sm font-medium text-[#1a3a6b] hover:underline"
            >
              ← Back to Dashboard
            </button>
            <h2 className="text-2xl font-semibold text-gray-800">Nominee Details</h2>
            <p className="mt-1 text-sm text-gray-600">Manage your EPF nominee information</p>
          </div>

          {primaryNominee && (
            <section className="mb-6 rounded border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Current Nominee
              </h3>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Name</dt>
                  <dd className="mt-1 font-medium text-gray-800">{primaryNominee.name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Relationship
                  </dt>
                  <dd className="mt-1 font-medium text-gray-800">{primaryNominee.relationship}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Allocation
                  </dt>
                  <dd className="mt-1 font-medium text-gray-800">{primaryNominee.percentage}%</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">DOB</dt>
                  <dd className="mt-1 font-medium text-gray-800">{primaryNominee.dob}</dd>
                </div>
              </dl>
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-semibold text-gray-800">
                {editingId ? 'Update Nominee' : 'Add / Update Nominee'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
                    Nominee Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={form.name}
                    onChange={handleChange}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="relationship"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Relationship
                  </label>
                  <select
                    id="relationship"
                    name="relationship"
                    value={form.relationship}
                    onChange={handleChange}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b]"
                  >
                    {RELATIONSHIPS.map((rel) => (
                      <option key={rel} value={rel}>
                        {rel}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="percentage"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Percentage Allocation
                  </label>
                  <input
                    id="percentage"
                    name="percentage"
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={form.percentage}
                    onChange={handleChange}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b]"
                  />
                </div>

                <div>
                  <label htmlFor="dob" className="mb-1 block text-sm font-medium text-gray-700">
                    Date of Birth
                  </label>
                  <input
                    id="dob"
                    name="dob"
                    type="date"
                    required
                    value={form.dob}
                    onChange={handleChange}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b]"
                  />
                </div>

                <div>
                  <label htmlFor="address" className="mb-1 block text-sm font-medium text-gray-700">
                    Address
                  </label>
                  <textarea
                    id="address"
                    name="address"
                    rows={3}
                    required
                    value={form.address}
                    onChange={handleChange}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b]"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded bg-[#1a3a6b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#143055]"
                  >
                    Submit
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null)
                        setForm(EMPTY_FORM)
                      }}
                      className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="rounded border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <h3 className="font-semibold text-gray-800">Current Nominees</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Name</th>
                      <th className="px-5 py-3 font-medium">Relationship</th>
                      <th className="px-5 py-3 font-medium">%</th>
                      <th className="px-5 py-3 font-medium">DOB</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {nominees.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                          No nominees added yet.
                        </td>
                      </tr>
                    ) : (
                      nominees.map((nominee) => (
                        <tr key={nominee.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-800">{nominee.name}</td>
                          <td className="px-5 py-3 text-gray-600">{nominee.relationship}</td>
                          <td className="px-5 py-3 text-gray-600">{nominee.percentage}%</td>
                          <td className="px-5 py-3 text-gray-600">{nominee.dob}</td>
                          <td className="px-5 py-3">
                            <StatusBadge status={nominee.status} />
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleEdit(nominee)}
                                className="text-xs font-medium text-[#1a3a6b] hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(nominee.id)}
                                className="rounded p-1 text-red-600 transition hover:bg-red-50"
                                aria-label={`Delete ${nominee.name}`}
                              >
                                <DeleteIcon />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
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
