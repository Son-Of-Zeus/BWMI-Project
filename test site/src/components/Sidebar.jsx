const MENU_ITEMS = [
  'Account',
  'Passbook',
  'Nominee',
  'Withdrawal',
  'UAN Card',
  'KYC',
]

export default function Sidebar({ activeItem, onSelect }) {
  return (
    <aside className="w-56 shrink-0 border-r border-gray-200 bg-white">
      <nav className="py-4">
        <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Services
        </p>
        <ul>
          {MENU_ITEMS.map((item) => {
            const isActive = activeItem === item
            return (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className={`w-full border-l-4 px-4 py-2.5 text-left text-sm transition ${
                    isActive
                      ? 'border-[#1a3a6b] bg-blue-50 font-medium text-[#1a3a6b]'
                      : 'border-transparent text-gray-700 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {item}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
