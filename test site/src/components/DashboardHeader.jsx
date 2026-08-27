export default function DashboardHeader({ member, onLogout }) {
  return (
    <header className="bg-[#1a3a6b] text-white shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
            EPF
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-blue-100">Member Portal</p>
            <h1 className="text-lg font-semibold">{member.name}</h1>
            <p className="text-sm text-blue-100">UAN: {member.UAN}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded border border-white/40 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
        >
          Logout
        </button>
      </div>
    </header>
  )
}
