const MENU_ITEMS = [
  { key: 'Account', label: 'Account (demo)' },
  { key: 'Passbook', label: 'Passbook (demo)' },
  { key: 'Nominee', label: 'Nominee (demo)' },
  { key: 'Withdrawal', label: 'Withdrawal (demo)' },
  { key: 'UAN Card', label: 'Account card (demo)' },
  { key: 'KYC', label: 'Profile checks (demo)' },
]

export default function Sidebar({ activeItem, onSelect }) {
  return (
    <aside className="w-56 shrink-0 border-r border-gray-200 bg-white">
      <nav className="py-4">
        <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Demo services
        </p>
        <ul>
          {MENU_ITEMS.map((item) => {
            const isActive = activeItem === item.key
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onSelect(item.key)}
                  className={`w-full border-l-4 px-4 py-2.5 text-left text-sm transition ${
                    isActive
                      ? 'border-[#1a3a6b] bg-blue-50 font-medium text-[#1a3a6b]'
                      : 'border-transparent text-gray-700 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
