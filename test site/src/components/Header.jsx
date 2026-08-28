import PrototypeDisclaimer from './PrototypeDisclaimer'

export default function Header({ title = 'Provident Fund Service Demo' }) {
  return (
    <>
      <header className="bg-[#1a3a6b] text-white shadow-md">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
            DEMO
          </div>
          <div className="text-left">
            <p className="text-xs uppercase tracking-wider text-blue-100">Independent prototype</p>
            <h1 className="text-lg font-semibold leading-tight sm:text-xl">{title}</h1>
          </div>
        </div>
      </header>
      <PrototypeDisclaimer />
    </>
  )
}
