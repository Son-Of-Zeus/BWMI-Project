export const PROTOTYPE_DISCLAIMER =
  'Independent hackathon prototype · Synthetic data · Not affiliated with EPFO or the Government of India.'

export const SYNTHETIC_DATA_NOTICE =
  'All identities, balances, claims, transactions, nominee records, withdrawal requests, bank details, and login credentials shown here are synthetic demo data.'

export default function PrototypeDisclaimer() {
  return (
    <section
      aria-label="Prototype disclaimer"
      className="border-b border-amber-300 bg-amber-50 text-amber-950"
    >
      <div className="mx-auto max-w-5xl px-6 py-3">
        <p className="text-sm font-bold">{PROTOTYPE_DISCLAIMER}</p>
        <p className="mt-1 text-xs text-amber-900">{SYNTHETIC_DATA_NOTICE}</p>
      </div>
    </section>
  )
}
